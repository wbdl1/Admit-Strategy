import test from 'node:test';import assert from 'node:assert/strict';import {StudyWorkspace} from '../src/study.js';
const card={id:'c',term:'Nucleus',answer:'Stores genetic material',box:1,row_version:3};
const setup=(presentation='written')=>({root:{querySelector:()=>null},drafts:new Map(),session:{session:{id:'s',method:'quiz_written',status:'active'},cards:[card],items:[{id:'i',review_card_id:'c',presentation}]}});
const result=(rating='missed')=>({session:{id:'s',method:'quiz_written',status:'completed'},items:[{id:'i',review_card_id:'c',rating,answered_at:'now'}],cards:[card],record:{...card,row_version:5,last_rating:rating,next_review:'2026-11-01'},answer_check:{session_item_id:'i',automatic_rating:rating,corrected_at:null}});
test('only typed submissions use the correction contract and display the rejected-answer action',async()=>{
 const w=new StudyWorkspace({portal:{}});let job;w.mutate=async(_s,name,args,done)=>{job={name,args,done};done(result());};
 for(const presentation of ['written','label','choice']){const s=setup(presentation);await w.answer(s,null,'My wording',null,true);assert.equal(job.name,'submit_typed_study_attempt');assert.ok(!('p_rating' in job.args));assert.equal(s.feedback.response,'My wording');assert.match(w.sessionMarkup(s),/I was correct/);assert.equal(s.feedback.itemId,'i');}
 w.mutate=async(_s,name,args,done)=>{job={name,args};const r=result();delete r.answer_check;done(r);};
 for(const presentation of ['choice','label','flashcard']){const s=setup(presentation);await w.answer(s,'missed','Wrong label');assert.equal(job.name,'submit_study_attempt');assert.doesNotMatch(w.sessionMarkup(s),/I was correct/);}
});
test('successful checks do not offer an override; a correction stays distinct from automatic grading',async()=>{
 const w=new StudyWorkspace({portal:{}}),s=setup();w.mutate=async(_s,_name,_args,done)=>done(result('knew'));await w.answer(s,null,'Stores genetic material',null,true);assert.doesNotMatch(w.sessionMarkup(s),/I was correct/);
 s.feedback.answerCheck.automatic_rating='partly';s.feedback.rating='partly';assert.match(w.sessionMarkup(s),/I was correct/);
 s.feedback.answerCheck.automatic_rating='missed';s.feedback.rating='missed';const before=s.feedback.before;let job;
 w.mutate=async(_s,name,args,done)=>{job={name,args,done};};await w.correctTypedAnswer(s);assert.equal(job.name,'correct_typed_study_answer');assert.deepEqual(job.args,{p_item_id:'i',p_expected_version:5});assert.equal(s.feedback.rating,'missed');
 job.done({...result('knew'),answer_check:{automatic_rating:'missed',corrected_at:'now'}});assert.equal(s.feedback.before,before);assert.equal(s.feedback.rating,'knew');const html=w.sessionMarkup(s);assert.match(html,/Marked correct by you/);assert.match(html,/Automatic check: Not quite/);assert.doesNotMatch(html,/I was correct/);assert.doesNotMatch(html,/Correct ✓/);
});
test('typing form explicitly identifies actual input, while choice clicks do not',async()=>{
 const w=new StudyWorkspace({portal:{}}),s=setup();let args;w.answer=async(...v)=>{args=v;};const original=globalThis.FormData;globalThis.FormData=class{*[Symbol.iterator](){yield ['response','Different wording'];}};
 try{const form={dataset:{studyForm:'response'},reportValidity:()=>true};await w.submit(s,{target:{closest:()=>form},preventDefault(){},stopPropagation(){}});assert.equal(args[2],'Different wording');assert.equal(args[4],true);}finally{globalThis.FormData=original;}
});
