import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {MutationQueue} from '../src/mutation-queue.js';
import {readFileSync} from 'node:fs';
import {PortalData,normalizeRecord,currentFeedbackRequest} from '../src/portal-data.js';
const source=readFileSync(new URL('../portal.html',import.meta.url),'utf8');

test('saved evidence is independent from optional version-bound feedback',()=>{
 const proof={id:'proof',row_version:2,status:'submitted',proof_text:'Private work',evidence_reviews:[{evidence_version:1,status:'changes_requested',feedback:'Earlier suggestion'}]};
 let record=normalizeRecord('evidence',proof);assert.equal(record.status,'Saved');assert.equal(record.coachReview,'');assert.equal(record.reviewHistory.length,1);
 proof.evidence_feedback_requests=[{evidence_version:1},{evidence_version:2,cancelled_at:'2026-10-11'}];assert.equal(currentFeedbackRequest(proof),undefined);
 proof.evidence_feedback_requests[1].cancelled_at=null;assert.equal(normalizeRecord('evidence',proof).coachReview,'Feedback requested');
 assert.equal(normalizeRecord('tasks',{status:'completed',evidence:[proof]}).status,'Completed');
});

test('feedback retry preserves the reviewed version and request key after a lost response',async()=>{
 const calls=[];let fail=true;
 const client={rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});return fail?{status:503,error:{code:'NETWORK_ERROR'}}:{data:{record:{id:'proof',row_version:2,status:'submitted',evidence_feedback_requests:[{evidence_version:2,cancelled_at:null}]}}};}};
 const portal=new PortalData(client);portal.studentId='student';portal.data={classes:[],evidenceWins:[]};portal.raw.set('evidence:proof',{row_version:2,evidence_reviews:[{evidence_version:1,feedback:'Preserved'}]});
 const values={operation:'requestfeedback',recordId:'proof',requested:'true'};
 await assert.rejects(portal.send(values,'request'),e=>e.retryable);portal.raw.get('evidence:proof').row_version=3;fail=false;
 const saved=await portal.send(values,'request');assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].name,'set_evidence_feedback_request');assert.equal(calls[0].args.p_expected_version,2);
 assert.equal(saved.changed.values.coachReview,'Feedback requested');assert.equal(saved.changed.values.reviewHistory[0].feedback,'Preserved');
});

test('feedback controls are optional, owner-scoped and do not impersonate a coach relationship',()=>{
 const context={canonicalPortal:{canEdit:true,canRequestFeedback:false},safe:String,formActions:label=>`<button>${label}</button>`};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function feedbackRequestForm('),source.indexOf('function evidenceList(')),context);
 assert.equal(context.feedbackRequestForm({id:'e'}),'');
 context.canonicalPortal.canRequestFeedback=true;assert.match(context.feedbackRequestForm({id:'e'}),/Request coach feedback/);
 assert.match(context.feedbackRequestForm({id:'e',feedbackRequested:true,coachReview:'Feedback requested'}),/Cancel feedback request/);
 context.canonicalPortal.canEdit=false;assert.equal(context.feedbackRequestForm({id:'e',feedbackRequested:true,coachReview:'Feedback requested'}),'');
});

test('adding proof does not reopen completed work or claim an unconfirmed evidence row',()=>{
 const context={canonicalPortal:{},document:{getElementById:()=>null},renderAffectedViews:()=>{},currentData:{tasks:[{id:'task',status:'Completed'}],evidenceWins:[]},actionId:()=> 'new-proof'};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function applyDemoAction('),source.indexOf('function moveDemoReviewCard(')),context);
 context.applyDemoAction({operation:'submittaskproof',recordId:'task',proofNote:'Optional proof'},{quiet:true,keepEditor:true});
 assert.equal(context.currentData.tasks[0].status,'Completed');assert.equal(context.currentData.evidenceWins.length,0);
});


test('confirmed request and cancellation leave the correct next action on the live button',async()=>{
 const button={disabled:false,textContent:'Request coach feedback'},ui={button,label:button.textContent};
 const item={id:'proof',feedbackRequested:false};
 const context={clearTimeout,toastTimer:null,saveQueue:null,canonicalPortal:null,window:{Admit:{MutationQueue}},mutationUI:new Map(),currentData:{evidenceWins:[item]},
  collectionFor:()=> 'evidenceWins',applyDemoAction:()=>{},renderAffectedViews:()=>{},showStatus:()=>{},renderSyncPanel:()=>{}};
 context.sendLegacyMutation=async values=>({ok:true,changed:{values:{feedbackRequested:values.requested==='true'}}});
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function ensureSaveQueue('),source.indexOf('function appendSaveRecovery(')),context);
 const queue=context.ensureSaveQueue();
 for(const [id,requested,label] of [['request','true','Cancel feedback request'],['cancel','false','Request coach feedback']]){
  context.mutationUI.set(id,ui);
  const job=queue.enqueue({operation:'requestfeedback',recordId:'proof',requested},{id});
  assert.equal(button.textContent,'Saving…');await job.done;
  assert.equal(job.state,'saved');assert.equal(button.textContent,label);assert.equal(button.disabled,false);
 }
});
