import test from "node:test";
import assert from "node:assert/strict";
import {diagnosisDraft,saveDiagnosisDraft,readDiagnosisDraft,clearDiagnosisDraft,diagnosisRequest} from "../src/diagnosis.js";
const lead={name:"Dylan Fixture",email:" Dylan@example.invalid ",parentEmail:"guardian@example.invalid",grade:"Grade 9",serviceContactConsent:"yes",campaignOptIn:"no",challenge:"forgetting",studyMethod:"rereads",assessmentHorizon:"this-week",weeklyCapacity:"2-4",diagnosisSummary:"Practice recalling the next assessment topics."};
const storage=()=>{const values=new Map();return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test("diagnosis handoff is validated and bound to the verified student email",()=>{
  const draft=diagnosisDraft(lead);assert.equal(draft.email,"dylan@example.invalid");assert.equal(draft.grade,9);
  assert.throws(()=>diagnosisDraft({...lead,parentEmail:lead.email}),/different guardian/);
  assert.throws(()=>diagnosisDraft({...lead,challenge:"arbitrary"}),/questions/);
  assert.throws(()=>diagnosisDraft({...lead,serviceContactConsent:"no"}),/privacy/);
  assert.throws(()=>diagnosisRequest(draft,"other@example.invalid"),/current account will not be changed/);
  assert.equal(diagnosisRequest(draft,draft.email).p_request_key,draft.id);
});
test("email callback tab can recover the same immutable request, then clear it",()=>{
  const local=storage(),draft=saveDiagnosisDraft(local,lead,{now:1000});
  const recovered=readDiagnosisDraft(local,draft.id,1001);assert.deepEqual(recovered,draft);
  assert.deepEqual(diagnosisRequest(recovered,draft.email),diagnosisRequest(draft,draft.email));
  clearDiagnosisDraft(local,draft.id);assert.equal(readDiagnosisDraft(local,draft.id,1002),null);
});
test("expired, malformed and excessive drafts do not accumulate private data",()=>{
  const local=storage(),draft=saveDiagnosisDraft(local,lead,{now:1000});
  assert.equal(readDiagnosisDraft(local,draft.id,86401001),null);assert.equal(local.length,0);
  for(let n=0;n<12;n++)saveDiagnosisDraft(local,lead,{now:1000+n});assert.equal(local.length,5);
  local.setItem("admit-diagnosis:"+draft.id,"invalid");assert.equal(readDiagnosisDraft(local,draft.id),null);
});

test('diagnosis accepts optional family sharing without inferring consent',()=>{const draft=diagnosisDraft({...lead,parentEmail:''});assert.equal(draft.guardian,'');assert.equal(diagnosisRequest(draft,draft.email).p_guardian_email,'');});
