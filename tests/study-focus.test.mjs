import test from 'node:test';
import assert from 'node:assert/strict';
import {studyShortcut} from '../src/study.js';
test('flashcard shortcuts never grade hidden answers, repeat held keys or intercept form controls',()=>{
 const event=key=>({key,target:{closest:()=>null}});
 assert.equal(studyShortcut(event(' '),false),'reveal');assert.equal(studyShortcut(event('1'),false),null);
 assert.equal(studyShortcut(event('1'),true),'missed');assert.equal(studyShortcut(event('2'),true),'partly');assert.equal(studyShortcut(event('3'),true),'knew');
 assert.equal(studyShortcut({...event('3'),repeat:true},true),null);assert.equal(studyShortcut({...event('3'),metaKey:true},true),null);
 assert.equal(studyShortcut({...event(' '),target:{closest:()=>({})}},false),null);
});
