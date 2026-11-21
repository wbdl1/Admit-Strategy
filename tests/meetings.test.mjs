import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountExperience} from '../src/account.js';

test('meeting reconciliation updates only its original active workspace',async()=>{
  let complete;const pending=new Promise(resolve=>complete=resolve),query={select(){return this;},eq(){return this;},is(){return this;},gte(){return this;},order(){return this;},limit(n){assert.equal(n,1);return this;}};
  const original={studentId:'dylan',data:{nextMeeting:'Previous'},result:()=>pending};let updates=0;
  const account={portal:original,user:{id:'coach'},client:{from(table){assert.equal(table,'bookings');return query;}},onMeetingChange:()=>updates++};
  const result=AccountExperience.prototype.meetingChanged.call(account,{student_id:'dylan'});
  account.portal={studentId:'sibling',data:{nextMeeting:'Sibling meeting'}};complete([{starts_at:'2026-09-12T12:30:00Z'}]);await result;
  assert.equal(updates,0);assert.equal(original.data.nextMeeting,'Previous');assert.equal(account.portal.data.nextMeeting,'Sibling meeting');
});
test('logout during meeting reconciliation is harmless; read failure has an honest fallback',async()=>{
  let complete;const query={select(){return this;},eq(){return this;},is(){return this;},gte(){return this;},order(){return this;},limit(){return this;}};
  const portal={studentId:'dylan',data:{},result:()=>new Promise(resolve=>complete=resolve)};
  const account={portal,user:{id:'dylan'},client:{from:()=>query},onMeetingChange:()=>assert.fail('Logged-out UI must not be touched')};
  const pending=AccountExperience.prototype.meetingChanged.call(account,{student_id:'dylan'});account.user=null;portal.data=null;portal.studentId=null;complete([]);await pending;
  account.user={id:'dylan'};portal.studentId='dylan';portal.data={};portal.result=async()=>{throw new Error('offline');};account.onMeetingChange=()=>{};
  await AccountExperience.prototype.meetingChanged.call(account,{student_id:'dylan'});assert.match(portal.data.nextMeeting,/Open Meetings/);
});
