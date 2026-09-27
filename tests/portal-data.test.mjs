import test from "node:test";
import assert from "node:assert/strict";
import {PortalData,normalizeRecord} from "../src/portal-data.js";
import {boundedFetch} from "../src/network.js";

test("planner sends the whole proof and keeps the same payload after an uncertain response",async()=>{
  const calls=[];let fail=true;
  const client={rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});return fail?{error:{code:"NETWORK_ERROR"},status:0}:{data:{ok:true,record:{id:"block",row_version:2,status:"completed"},evidence:{id:"proof",proof_text:"Completed six questions",study_block_id:"block"}}};}};
  const portal=new PortalData(client);portal.studentId="student";portal.data={classes:[],evidenceWins:[]};portal.raw.set("study_blocks:block",{row_version:1});
  const input={operation:"updateplanner",recordId:"block",status:"Completed",proofNote:"Completed six questions",proofUrl:"https://example.invalid/proof"};
  await assert.rejects(portal.send(input,"proof"),e=>e.retryable&&!e.rejected);
  portal.raw.set("study_blocks:block",{row_version:99});fail=false;
  const result=await portal.send(input,"proof");
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].name,"save_study_block_with_proof");
  assert.equal(calls[0].args.p_note,input.proofNote);assert.equal(calls[0].args.p_url,input.proofUrl);
  assert.equal(result.changed.values.proofNote,input.proofNote);assert.equal(portal.data.evidenceWins.length,1);
});
test("confirmed task and planner proof survives a portal reload",()=>{
  for(const table of ["tasks","study_blocks"]){
    const row=normalizeRecord(table,{id:"item",row_version:2,evidence:[{row_version:2,proof_text:"Six diagrams",proof_url:"https://example.invalid/proof",evidence_reviews:[{status:"approved",feedback:"Clear correction",evidence_version:2}]}]});
    assert.equal(row.proofNote,"Six diagrams");assert.equal(row.coachReview,"Approved");assert.equal(row.coachFeedback,"Clear correction");
  }
});
test("calendar deadline labels map to a supported type and shared recap retains next actions",()=>{
  const portal=new PortalData({});assert.equal(portal.values('assessments',{type:'Project deadline'}).kind,'deadline');
  const record=normalizeRecord('sessions',{id:'session',shared_summary:'Practice diagrams',next_actions:'Submit two corrected diagrams'});
  assert.equal(record.detail,'Practice diagrams\n\nNext actions: Submit two corrected diagrams');
});
test("network timeout is bounded and preserves a caller's cancellation",async()=>{
  const transport=(_input,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}));
  await assert.rejects(boundedFetch(transport,10)("https://example.invalid"),/timed out/);
  const controller=new AbortController(),pending=boundedFetch(transport,1000)("https://example.invalid",{signal:controller.signal});
  controller.abort(new Error("Caller cancelled"));await assert.rejects(pending,/Caller cancelled/);
});

function conflictFixture(){
  let latest={id:'class',student_id:'student',row_version:2,name:'Biology',teacher:'Coach edit'},failRead=false;
  const calls=[],reads=[];
  const client={rpc:async(name,args)=>{
    calls.push(structuredClone(args));
    if(args.p_expected_version!==latest.row_version)return {status:409,error:{code:'P0409',message:'Record changed'}};
    latest={...latest,...args.p_values,row_version:latest.row_version+1};return {data:{ok:true,record:latest}};
  },from:table=>{const query={select(){return this;},eq(key,value){reads.push([table,key,value]);return this;},is(){return this;},async maybeSingle(){return failRead?{status:503,error:{code:'UNAVAILABLE'}}:{data:structuredClone(latest)};}};return query;}};
  const portal=new PortalData(client);portal.studentId='student';portal.data={classes:[]};
  portal.ingest('classes',[{...latest,row_version:1,teacher:'Original'}]);
  return {portal,calls,reads,setReadFailure:value=>failRead=value,setLatest:value=>latest=value};
}
test('a concurrent edit requires comparison and explicit acceptance before a fresh save',async()=>{
  const {portal,calls,reads}=conflictFixture(),draft={operation:'updateclass',recordId:'class',name:'Biology',teacher:'Student draft'};
  await assert.rejects(portal.send(draft,'rejected'),e=>e.code==='P0409'&&!e.retryable&&e.rejected);
  const comparison=await portal.compareConflict('rejected');
  assert.equal(comparison.latest.teacher,'Coach edit');
  assert.equal(portal.raw.get('classes:class').row_version,1);
  await assert.rejects(portal.send(draft,'not-reviewed'),e=>e.code==='P0409');assert.equal(calls.length,1);
  assert.ok(reads.some(([,key,value])=>key==='student_id'&&value==='student'));
  assert.ok(reads.some(([,key,value])=>key==='id'&&value==='class'));
  comparison.accept();assert.equal(draft.teacher,'Student draft');assert.equal(calls.length,1);
  const saved=await portal.send(draft,'reviewed');
  assert.equal(saved.changed.values.teacher,'Student draft');assert.equal(calls[1].p_expected_version,2);
  assert.equal(portal.requests.get('rejected').args.p_expected_version,1);
});
test('failed comparison, missing records and newer cached versions never silently authorize overwrite',async()=>{
  const fixture=conflictFixture(),{portal}=fixture;
  await assert.rejects(portal.send({operation:'updateclass',recordId:'class',teacher:'Draft'},'rejected'));
  fixture.setReadFailure(true);await assert.rejects(portal.compareConflict('rejected'));
  assert.equal(portal.raw.get('classes:class').row_version,1);
  fixture.setReadFailure(false);const old=await portal.compareConflict('rejected');
  portal.raw.set('classes:class',{row_version:3});assert.throws(()=>old.accept(),/newer version/);
  fixture.setLatest(null);const removed=await portal.compareConflict('rejected');assert.equal(removed.latest,null);
  removed.accept();assert.equal(portal.data.classes.length,0);assert.equal(portal.raw.has('classes:class'),false);
});
