import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {GuestStudy} from '../src/guest-study.js';
test('guest Quiz uses the same answer rules and cannot submit twice',()=>{
 const s=new GuestStudy();assert.equal(s.choices().length,4);s.answer('Nucleus');s.answer('Cell membrane');assert.equal(s.results.length,1);assert.equal(s.feedback.rating,'knew');s.next();assert.equal(s.position,1);s.answer('Wrong answer');assert.equal(s.feedback.rating,'missed');
});
test('guest Learn repeats a missed concept once and different guests share no progress',()=>{
 const a=new GuestStudy('learn'),b=new GuestStudy('learn');a.answer('Wrong');a.next();assert.equal(a.queue.length,5);assert.equal(b.queue.length,4);assert.equal(b.results.length,0);
 while(a.card){a.answer('Wrong');a.next();}assert.equal(a.results.length,8);assert.equal(a.queue.length,8);
});
test('guest study has no backend data access or account storage',()=>{
 for(const name of ['guest.js','guest-study.js']){const source=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');assert.doesNotMatch(source,/\.(rpc|from)\(|localStorage|sessionStorage|fetch\(/);}
 const entry=readFileSync(new URL('../src/guest-entry.js',import.meta.url),'utf8');assert.doesNotMatch(entry,/\.(rpc|from)\(/);assert.match(entry,/getSession\(/);assert.match(entry,/portal\.html/);
});
