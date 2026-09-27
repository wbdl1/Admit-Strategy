import test from 'node:test';
import assert from 'node:assert/strict';
import {bindWorkspaceMutation} from '../src/workspace-scope.js';
import {MutationQueue} from '../src/mutation-queue.js';

test('a delayed retry cannot create a record in another student workspace',async()=>{
  const calls=[];let release;const wait=new Promise(resolve=>release=resolve);
  const first={studentId:'dylan',send:async(_values,id)=>{calls.push(['dylan',id]);throw Object.assign(new Error('Response lost'),{retryable:true});}};
  const second={studentId:'sibling',send:async(_values,id)=>{calls.push(['sibling',id]);return {ok:true};}};
  let current=first,actor='coach';const scope=bindWorkspaceMutation(first,{currentAdapter:()=>current,currentActor:()=>actor,actorId:actor});
  const queue=new MutationQueue({send:scope.send,optimistic(){},confirm(){},wait:()=>wait});
  const job=queue.enqueue({operation:'addclass',name:'Biology'},{id:'immutable-operation'});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(job.state,'retrying');
  current=second;release();await job.done;
  assert.deepEqual(calls,[['dylan','immutable-operation']]);assert.equal(job.state,'failed');assert.equal(scope.active(),false);
  current=first;actor='different-account';assert.throws(()=>scope.send({},'another'),e=>e.rejected===false&&!e.retryable);
});
test('logout and a reused mutable adapter invalidate the previous save scope',()=>{
  let actor='student';const adapter={studentId:'dylan',send:()=>({ok:true})};
  const scope=bindWorkspaceMutation(adapter,{currentAdapter:()=>adapter,currentActor:()=>actor,actorId:actor});
  assert.equal(scope.send({},'id').ok,true);adapter.studentId='sibling';assert.throws(()=>scope.send({},'id'),/workspace is closed/);
  adapter.studentId='dylan';actor=null;assert.throws(()=>scope.send({},'id'),e=>e.retryable&&e.rejected===false);
});
test('a conflict comparison cannot be displayed or accepted after an account/workspace change',async()=>{
  let actor='student',accepts=0,release;
  const pending=new Promise(resolve=>release=resolve);
  const adapter={studentId:'dylan',compareConflict:async()=>{await pending;return {latest:{teacher:'Latest'},accept:()=>accepts++};}};
  const scope=bindWorkspaceMutation(adapter,{currentAdapter:()=>adapter,currentActor:()=>actor,actorId:actor});
  const stale=scope.compareConflict('rejected');actor='sibling';release();await assert.rejects(stale,/workspace is closed/);
  actor='student';const current=await scope.compareConflict('rejected');actor=null;assert.throws(()=>current.accept(),/Sign in/);
  actor='student';current.accept();assert.equal(accepts,1);
});
test('session loss keeps an uncertain operation and retries the same receipt after recovery',async()=>{
  let actor='student',attempt=0;const calls=[];
  const adapter={studentId:'dylan',send:async(_values,id)=>{calls.push(id);if(++attempt===1){actor=null;throw new Error('Lost response');}return {ok:true};}};
  const scope=bindWorkspaceMutation(adapter,{currentAdapter:()=>adapter,currentActor:()=>actor,actorId:'student'});
  const queue=new MutationQueue({send:scope.send,optimistic(){},confirm(){},wait:async()=>{}});
  const job=queue.enqueue({recordId:'class',teacher:'Preserved'},{id:'stable-key'});await job.done;
  assert.equal(job.state,'failed');assert.equal(job.error.rejected,false);assert.equal(job.values.teacher,'Preserved');
  actor='student';queue.retry(job.id);await job.done;
  assert.equal(job.state,'saved');assert.deepEqual(calls,['stable-key','stable-key']);assert.deepEqual(job.response,{ok:true});
});
