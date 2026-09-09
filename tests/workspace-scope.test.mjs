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
  current=first;actor='different-account';assert.throws(()=>scope.send({},'another'),e=>e.rejected&&!e.retryable);
});
test('logout and a reused mutable adapter invalidate the previous save scope',()=>{
  let actor='student';const adapter={studentId:'dylan',send:()=>({ok:true})};
  const scope=bindWorkspaceMutation(adapter,{currentAdapter:()=>adapter,currentActor:()=>actor,actorId:actor});
  assert.equal(scope.send({},'id').ok,true);adapter.studentId='sibling';assert.throws(()=>scope.send({},'id'),/workspace is closed/);
  adapter.studentId='dylan';actor=null;assert.throws(()=>scope.send({},'id'),/workspace is closed/);
});
