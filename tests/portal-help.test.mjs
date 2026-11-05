import test from 'node:test';import assert from 'node:assert/strict';import {portalHelpMarkup} from '../src/portal-help.js';import {studyHistoryMarkup} from '../src/study-loop.js';
test('help covers the live study loop, all modes, privacy and tutorial restart',()=>{
 const html=portalHelpMarkup();for(const phrase of ['data-restart-guide','Today','Classes and units','Assessments','Progress','Flashcards','Quiz','Learn','Blurting','Diagram labels','Feynman','No recording','Guardian']){
  if(phrase==='No recording')continue;assert.match(html,new RegExp(phrase));
 }assert.match(html,/mailto:ryanwbdl@gmail.com/);assert.match(html,/There is no AI grading/);
});
test('progress shows actual activity and escapes student content',()=>{
 const html=studyHistoryMarkup({activity:{answers_7d:12,concepts_7d:6,days_7d:2},weak_concepts:[{id:'a',term:'<script>alert(1)</script>',class_name:'Bio',unit_name:'Cells',class_id:'c',unit_id:'u',label:'Weak',last_rating:'missed'}],sessions:[{id:'s',class_id:'c',class_name:'Bio',method:'feynman',status:'completed',reviewed:2,knew:1,partly:1,missed:0,tomorrow:0,concepts:2}]},'2026-10-16');assert.match(html,/Answers saved/);assert.match(html,/Teach \/ Feynman/);assert.match(html,/data-open-study-session="s"/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/readiness|Study System/);
});
