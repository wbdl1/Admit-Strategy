import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudyPaste,studyStage,studyDue} from '../src/study.js';
import {nextReviewLabel,sessionSummary,studyTodayMarkup} from '../src/study-loop.js';

test('bulk paste supports common line formats without splitting hyphenated terms or answer punctuation',()=>{
 const sample='Mitochondria - organelle responsible for cellular respiration\nATP: usable cellular energy\nGlycolysis – first stage of glucose breakdown';
 const r=parseStudyPaste(sample);assert.equal(r.errors.length,0);assert.equal(r.items.length,3);assert.equal(r.items[1].term,'ATP');
 assert.deepEqual(parseStudyPaste('Long-term memory - recall: later - again').items[0],{term:'Long-term memory',answer:'recall: later - again',prompt:''});
 assert.equal(parseStudyPaste('A: B\nBad row','colon').errors.length,1);
 assert.equal(parseStudyPaste(Array.from({length:100},(_,i)=>`Term ${i} - Definition ${i}`).join('\n')).items.length,100);
 assert.equal(parseStudyPaste('"A, B","C: D"').items[0].term,'A, B');
});
test('strong items return when due and weakness comes from actual answer outcome',()=>{
 assert.equal(studyDue({box:5,next_review:'2000-01-01',last_reviewed_at:'1999-01-01'}),true);
 assert.equal(studyDue({box:5,next_review:'2999-01-01'}),false);
 assert.equal(studyStage({box:1,last_rating:'missed'}),'Weak');assert.equal(studyStage({box:5,last_rating:'partly'}),'Strong');assert.equal(studyStage({box:5}),'Strong');
 assert.equal(nextReviewLabel('2026-10-15','2026-10-14'),'Review tomorrow');assert.equal(nextReviewLabel('2026-10-17','2026-10-14'),'Review in 3 days');
});
test('session summary counts only confirmed answers, not skipped or pending items',()=>{
 const rows=[{rating:'knew',answered_at:'now',next_review:'2026-10-17'},{rating:'partly',answered_at:'now',next_review:'2026-10-16'},{rating:'missed',answered_at:'now',next_review:'2026-10-15'},{rating:null,skipped_at:'now'},{rating:'knew',answered_at:null}];
 assert.deepEqual(sessionSummary(rows,'2026-10-14'),{reviewed:3,knew:1,partly:1,missed:1,tomorrow:1});
});
test('Today offers one recommendation and three secondary methods for that same scope',()=>{
 const group={class_id:'c',unit_id:'u',class_name:'Biology',unit_name:'Cells',due_count:18,weak_count:6,assessment_date:'2026-10-19'};
 const data={classes:[{}],assessments:[{}],studyOverview:{unit_count:1,item_count:100,groups:Array.from({length:5},()=>group),sessions:[]}};
 const html=studyTodayMarkup(data,'2026-10-14');assert.equal((html.match(/data-start-study=/g)||[]).length,4);assert.equal((html.match(/class="study-recommendation"/g)||[]).length,1);assert.match(html,/18 reviews due/);assert.match(html,/6 weak concepts/);assert.match(html,/in 5 days/);assert.match(html,/Estimated/);assert.doesNotMatch(html,/readiness|Box [1-5]/);
 assert.match(studyTodayMarkup({studyOverview:{groups:[],sessions:[],unit_count:0,item_count:0}},'2026-10-14'),/Start with one class/);
});

test('repeated attempts never count an old review date as an additional tomorrow item',()=>{
 const rows=[{review_card_id:'a',rating:'missed',answered_at:'now',next_review:'2026-10-15'},{review_card_id:'a',rating:'knew',answered_at:'later',next_review:'2026-10-17'},{review_card_id:'b',rating:'missed',answered_at:'now',next_review:'2026-10-15'}];
 const s=sessionSummary(rows,'2026-10-14');assert.equal(s.reviewed,3);assert.equal(s.tomorrow,1);
});
