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
