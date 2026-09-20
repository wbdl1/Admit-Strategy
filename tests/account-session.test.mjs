import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountExperience} from '../src/account.js';

test('repeated sign-in preserves the active coach form and its unsaved input',async()=>{
  const account={
    user:{id:'coach'},client:{auth:{getUser:async()=>({data:{user:{id:'coach'}}})}},
    gate:{hidden:false},coach:{content:{isConnected:true}},
    show:()=>assert.fail('Do not replace the active editor'),
    portal:{rpc:()=>assert.fail('Do not re-bootstrap the same active coach')}
  };
  await AccountExperience.prototype.refreshAccount.call(account);
  account.client.auth.getUser=async()=>({data:{user:{id:'different-coach'}}});
  account.show=()=>{throw new Error('Different actor must re-bootstrap');};
  await assert.rejects(AccountExperience.prototype.refreshAccount.call(account),/Different actor must re-bootstrap/);
});

test('an invalid session cannot keep the coaching editor active',async()=>{
  let loggedOut=false;
  const account={user:{id:'coach'},gate:{hidden:false},coach:{content:{isConnected:true}},
    client:{auth:{getUser:async()=>({data:{user:null},error:new Error('Session expired')})}},login:()=>{loggedOut=true;}};
  await AccountExperience.prototype.refreshAccount.call(account);assert.equal(loggedOut,true);
});

test('a personal workspace does not hide guardian invitations or approved family access',async()=>{
  const own={id:'own-workspace',profile_id:'profile'},child={id:'child-workspace',profile_id:'child-profile'};
  for(const scenario of [
    {students:[own],requests:[{request_id:'pending'}],expected:'family'},
    {students:[own,child],requests:[],expected:'family'},
    {students:[own],requests:[],expected:'own'},
    {students:[],requests:[],expected:'onboarding'}
  ]){
    let route;
    const query={select(){return this;},eq(){return this;},is(){return this;},limit(){return this;}};
    const account={client:{auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:table=>({...query,table})},
      show:()=>{},portal:{rpc:async name=>{
        if(name==='bootstrap_account')return {profile_id:'profile'};
        assert.equal(name,'guardian_requests');return scenario.requests;
      },result:async q=>q.table==='profile_roles'?[{roles:{code:'student'}}]:scenario.students},
      openStudent:async s=>{assert.equal(s.id,own.id);route='own';},
      guardianHome:(students,requests)=>{assert.equal(students,scenario.students);assert.equal(requests,scenario.requests);route='family';},
      onboarding:()=>{route='onboarding';}
    };
    await AccountExperience.prototype.refreshAccount.call(account);
    assert.equal(route,scenario.expected);
  }
});

test('expired callback query is explained and removed without losing the diagnosis handoff',async()=>{
  const originalLocation=globalThis.location,originalHistory=globalThis.history;let clean,message;
  try{
    globalThis.location={href:'http://127.0.0.1:4173/portal.html?diagnosis=fixture&error=access_denied&error_code=otp_expired&error_description=Expired'};
    globalThis.history={state:null,replaceState(_state,_title,url){clean=url;}};
    const account={client:{auth:{initialize:async()=>{}}},refresh:async()=>{},message:text=>{message=text;}};
    await AccountExperience.prototype.start.call(account);
    assert.equal(clean.search,'?diagnosis=fixture');assert.match(message,/expired/);
  }finally{
    if(originalLocation===undefined)delete globalThis.location;else globalThis.location=originalLocation;
    if(originalHistory===undefined)delete globalThis.history;else globalThis.history=originalHistory;
  }
});
