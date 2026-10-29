import test from "node:test";
import assert from "node:assert/strict";
import { MutationQueue } from "../src/mutation-queue.js";

test("local change is immediate; Saved waits for persistence",async () => {
  let complete, visible=false, confirmed=false;
  const queue=new MutationQueue({send:()=>new Promise(r=>{complete=r;}),optimistic:()=>{visible=true;},confirm:()=>{confirmed=true;}});
  const start=performance.now(),job=queue.enqueue({operation:"addclass",name:"Biology"});
  assert.ok(visible);assert.ok(performance.now()-start<100);
  assert.equal(confirmed,false);assert.notEqual(job.state,"saved");
  await Promise.resolve();await Promise.resolve();
  complete({ok:true});await job.done;
  assert.equal(confirmed,true);assert.equal(job.state,"saved");
});
test("ambiguous retry uses same key and exactly one optimistic create",async () => {
  let attempts=0,optimistic=0;const keys=[];
  const queue=new MutationQueue({send:async(v,key)=>{keys.push(key);if(++attempts<3)throw new Error("network");return {ok:true};},optimistic:()=>optimistic++,confirm:()=>{},wait:async()=>{}});
  const job=queue.enqueue({operation:"addclass",name:"Biology"},{id:"stable-operation"});
  await job.done;
  assert.deepEqual(keys,["stable-operation","stable-operation","stable-operation"]);assert.equal(optimistic,1);assert.equal(job.state,"saved");
});
test("failure preserves submitted input; manual retry does not repeat optimistic mutation",async () => {
  let fail=true,optimistic=0;const values={operation:"addassessment",name:"Biology test"};
  const queue=new MutationQueue({send:async()=>{if(fail)throw new Error("offline");return {ok:true};},optimistic:()=>optimistic++,confirm:()=>{},wait:async()=>{}});
  const job=queue.enqueue(values);values.name="Later unsaved input";await job.done;
  assert.equal(job.state,"failed");assert.equal(job.values.name,"Biology test");assert.equal(queue.unsaved.length,1);
  fail=false;assert.equal(queue.retry(job.id),true);await job.done;assert.equal(job.state,"saved");assert.equal(optimistic,1);
});
test("permanent validation error is never automatically retried or shown as saved",async () => {
  let attempts=0;
  const queue=new MutationQueue({send:async()=>{attempts++;throw Object.assign(new Error("invalid"),{retryable:false});},optimistic:()=>{},confirm:()=>assert.fail(),wait:async()=>{}});
  const job=queue.enqueue({operation:"addclass"});await job.done;
  assert.equal(attempts,1);assert.equal(job.state,"failed");assert.equal(queue.retry(job.id),false);
});
test("same-record mutations serialize; independent records proceed",async () => {
  let complete;const calls=[];
  const queue=new MutationQueue({send:async(v)=>{calls.push(v.name);if(v.name==="one")await new Promise(r=>complete=r);return {ok:true};},optimistic:()=>{},confirm:()=>{}});
  const first=queue.enqueue({recordId:"a",name:"one"}),second=queue.enqueue({recordId:"a",name:"two"}),independent=queue.enqueue({recordId:"b",name:"other"});
  await independent.done;assert.deepEqual(calls,["one","other"]);
  complete();await first.done;await second.done;assert.deepEqual(calls,["one","other","two"]);
});
test("a failed earlier edit blocks later writes to that record",async () => {
  const calls=[];
  const queue=new MutationQueue({send:async(v)=>{calls.push(v.name);throw new Error("offline");},optimistic:()=>{},confirm:()=>{},wait:async()=>{},maxAttempts:1});
  const first=queue.enqueue({recordId:"a",name:"one"}),second=queue.enqueue({recordId:"a",name:"two"});
  await first.done;await second.done;assert.deepEqual(calls,["one"]);assert.equal(second.state,"blocked");
});
test("a corrected form can save after a proven validation rejection",async () => {
  const queue=new MutationQueue({send:async v=>{if(!v.name)throw Object.assign(new Error("Name required"),{retryable:false,rejected:true});return {ok:true};},optimistic:()=>{},confirm:()=>{}});
  const bad=queue.enqueue({recordId:"a",name:""});await bad.done;
  const fixed=queue.enqueue({recordId:"a",name:"Biology"});await fixed.done;
  assert.equal(bad.state,"superseded");assert.equal(fixed.state,"saved");assert.equal(queue.unsaved.length,0);
  assert.equal(bad.values.name,"");
});
test("an unsafe-to-retry timeout stays uncertain and blocks later writes",async () => {
  const queue=new MutationQueue({send:async()=>{throw Object.assign(new Error("No receipt"),{retryable:false});},optimistic:()=>{},confirm:()=>{}});
  const first=queue.enqueue({recordId:"a",name:"one"});await first.done;
  const second=queue.enqueue({recordId:"a",name:"two"});await second.done;
  assert.equal(first.error.rejected,undefined);assert.equal(queue.retry(first.id),false);assert.equal(second.state,"blocked");assert.equal(queue.unsaved.length,2);
});
test("reconciliation can preserve later optimistic edits",async () => {
  let complete;let visible="";
  const queue=new MutationQueue({send:async v=>{if(v.name==="one")await new Promise(r=>complete=r);return {ok:true,name:v.name};},optimistic:job=>visible=job.values.name,confirm:(job,response)=>{visible=response.name;for(const later of queue.laterPending(job))visible=later.values.name;}});
  const first=queue.enqueue({recordId:"a",name:"one"}),second=queue.enqueue({recordId:"a",name:"two"});
  await Promise.resolve();await Promise.resolve();assert.equal(visible,"two");complete();await first.done;assert.equal(visible,"two");await second.done;assert.equal(visible,"two");
});
