import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCoverage,coverageRows} from '../src/study-coverage.js';
import {StudyWorkspace} from '../src/study.js';
const card={id:'c',term:'ATP',answer:'Energy for cells',accepted_answers:['Cellular energy'],required_keywords:['energy','cells'],row_version:4};
test('coverage matches saved phrases, aliases and complete keywords with word boundaries',()=>{
 assert.equal(compareCoverage(card,'ATP supplies energy for cells.').rating,'knew');
 assert.equal(compareCoverage(card,'It provides CELLULAR ENERGY!').rating,'knew');
 assert.equal(compareCoverage(card,'Energy can be used by cells.').rating,'knew');
 assert.equal(compareCoverage(card,'ATPase is an enzyme.').rating,'missed');
 assert.equal(compareCoverage(card,'ATP is important.').rating,'partly');
 assert.equal(compareCoverage(card,'Energy is important.').rating,'missed');
 assert.equal(compareCoverage({...card,answer:'',accepted_answers:[],required_keywords:[]},'anything').rating,'missed');
});
test('uncertain or negated mentions are conservative and never labeled as understanding',()=>{
 for(const text of ["I don’t know how ATP provides energy for cells.",'ATP does not provide energy for cells.','I am unsure about ATP.'])assert.equal(compareCoverage(card,text).rating,'missed');
 assert.equal(compareCoverage(card,'I forgot ATP. It provides energy for cells.').rating,'knew');
});
test('saved questions contribute only to their concept and explicit difficulty constrains coverage',()=>{
 const q={review_card_id:'c',response:'Energy for cells',answered_at:'now',self_rating:null};
 assert.equal(compareCoverage(card,'',[q]).rating,'knew');
 assert.equal(compareCoverage(card,'',[{...q,review_card_id:'other'}]).rating,'missed');
 assert.equal(compareCoverage(card,'Energy for cells',[{...q,self_rating:'missed'}]).rating,'missed');
 assert.equal(compareCoverage(card,'Energy for cells',[{...q,self_rating:'partly'}]).rating,'partly');
});
const state=()=>({session:{id:'s',method:'blurting',status:'active',reflection_revealed_at:'now',reflection_text:'ATP is important.'},cards:[card],items:[{id:'i',review_card_id:'c',presentation:'coverage'}]});
test('coverage comparison permits correction and omits already confirmed or skipped concepts',()=>{
 const s=state();assert.equal(coverageRows(s)[0].rating,'partly');assert.equal(coverageRows(s,{i:'knew'})[0].rating,'knew');assert.equal(coverageRows(s,{i:'forged'})[0].rating,'partly');
 s.items.push({id:'answered',review_card_id:'c',answered_at:'now'},{id:'skipped',review_card_id:'c',skipped_at:'now'});assert.equal(coverageRows(s).length,1);
});
test('one reflection confirmation replaces repeated grading, keeps edits on failure, and clears only on success',async()=>{
 const w=new StudyWorkspace({portal:{data:{classes:[]}}}),s={session:state(),drafts:new Map([['coverage-s',{i:'knew'}]])};
 const html=w.sessionMarkup(s);assert.match(html,/Likely covered/);assert.match(html,/Not clearly covered/);assert.match(html,/not whether your explanation is correct/);assert.equal((html.match(/type="submit"/g)||[]).length,1);assert.ok(!html.includes('data-study-action="knew"'));
 const form={id:'coverage-s',dataset:{dirty:'true'}};let job;
 w.mutate=async(_s,name,args,done)=>{job={name,args,done};};await w.saveCoverage(s,form,{i:'knew'});
 assert.equal(job.name,'confirm_study_coverage');assert.deepEqual(job.args.p_results,[{item_id:'i',rating:'knew',expected_version:4}]);assert.equal(s.drafts.size,1);assert.equal(form.dataset.dirty,'true');
 job.done({...state(),session:{...state().session,status:'completed'}});assert.equal(s.drafts.size,0);assert.equal(form.dataset.dirty,undefined);
});
test('objective answer feedback is separate from reflection and approximate matching',()=>{
 const w=new StudyWorkspace({portal:{data:{classes:[]}}}),s={session:state(),feedback:{title:'ATP',answer:card.answer,response:card.answer,rating:'knew',before:{box:1},after:{box:2,last_rating:'knew',next_review:'2026-10-26'}}};
 assert.match(w.sessionMarkup(s),/Correct ✓/);s.feedback.approximate=true;assert.match(w.sessionMarkup(s),/Key elements found/);s.feedback.rating='missed';assert.match(w.sessionMarkup(s),/Not quite/);
});
