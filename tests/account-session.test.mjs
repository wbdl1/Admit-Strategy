import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountExperience} from '../src/account.js';

test('repeated sign-in preserves the active coach form and its unsaved input',async()=>{
  const account={
    user:{id:'coach'},client:{auth:{getUser:async()=>({data:{user:{id:'coach'}}})}},
    root:{replaceChildren(){}},gate:{hidden:false},coach:{content:{isConnected:true},dispose(){}},
    show:()=>assert.fail('Do not replace the active editor'),
    portal:{rpc:()=>assert.fail('Do not re-bootstrap the same active coach')}
  };
  await AccountExperience.prototype.refreshAccount.call(account);
  account.client.auth.getUser=async()=>({data:{user:{id:'different-coach'}}});
  account.show=()=>{throw new Error('Different actor must re-bootstrap');};
  await assert.rejects(AccountExperience.prototype.refreshAccount.call(account),/Different actor must re-bootstrap/);
});

test('an invalid session cannot keep the coaching editor active',async()=>{
  const {account,events,draft}=sessionFixture();
  account.client.auth.getUser=async()=>({data:{user:null},error:new Error('Session expired')});
  await account.refreshAccount();assert.equal(account.user,null);assert.equal(account.root.hidden,true);
  assert.deepEqual(events,['suspended']);assert.equal(account.suspendedView.nodes[0],draft);
});

function sessionFixture(){
  const events=[],draft={text:'Unsubmitted work'},gate={hidden:false,childNodes:[draft],replaceChildren(...nodes){this.childNodes=nodes;}};
  const account=Object.assign(Object.create(AccountExperience.prototype),{
    user:{id:'coach'},gate,root:{hidden:true,replaceChildren(){this.cleared=true;}},toolbar:{hidden:true},
    coach:{actorId:'coach',content:{isConnected:true},sync:{hidden:false},unsaved:[],dispose(){this.disposed=true;}},
    client:{auth:{getUser:async()=>({data:{user:{id:'coach'}}})}},
    onSessionChange:state=>events.push(state),
    login(){this.root.hidden=true;this.toolbar.hidden=true;this.gate.hidden=false;this.gate.replaceChildren({text:'Sign in'});},
    show(){throw new Error('A different actor must bootstrap');}
  });
  return {account,events,draft};
}
test('verified same-account recovery restores the original editor nodes without a reload',async()=>{
  const {account,events,draft}=sessionFixture();
  account.suspendSession();account.suspendSession();await account.refreshAccount();
  assert.equal(account.user.id,'coach');assert.equal(account.gate.childNodes[0],draft);
  assert.equal(account.gate.childNodes[0].text,'Unsubmitted work');assert.equal(account.suspendedView,null);
  assert.equal(events.at(-1),'resumed');
});
test('another account cannot restore a suspended editor or reuse its workspace',async()=>{
  const {account,events}=sessionFixture();const coach=account.coach;
  account.suspendSession();account.client.auth.getUser=async()=>({data:{user:{id:'different'}}});
  await assert.rejects(account.refreshAccount(),/different actor must bootstrap/);
  assert.equal(account.suspendedView,null);assert.equal(account.root.cleared,true);assert.equal(coach.disposed,true);
  assert.equal(events.at(-1),'cleared');assert.equal(account.portal.studentId,undefined);
});
test('a new Auth identity suspends private views before asynchronous verification',async()=>{
  let hidden=0,verified=0;
  const account={user:{id:'original'},suspendSession(){hidden++;this.user=null;},refresh(){verified++;}};
  AccountExperience.prototype.authChanged.call(account,'SIGNED_IN',{user:{id:'original'}});assert.equal(hidden,0);
  AccountExperience.prototype.authChanged.call(account,'SIGNED_IN',{user:{id:'other'}});assert.equal(hidden,1);assert.equal(account.user,null);
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(verified,2);
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

test('provider denial and initialization failure leave recovery available and the route clean',async()=>{
  const oldLocation=globalThis.location,oldHistory=globalThis.history;
  try{
    for(const scenario of [
      {suffix:'#error=access_denied&error_description=untrusted-private-detail',expected:/cancelled or declined/},
      {suffix:'&error=access_denied&error_code=flow_state_expired&error_description=untrusted-private-detail',expected:/attempt has expired.*Google again/},
      {suffix:'&error_code=flow_state_not_found',expected:/attempt has expired.*Google again/},
      {suffix:'&error=server_error&error_description=untrusted-private-detail',expected:/could not be completed/},
      {suffix:'&code=unusable-code',fail:true,expected:/could not be completed/},
      {suffix:'&code=returned-error-code',returnedError:true,expected:/could not be completed/}
    ]){
      let clean,message,refreshed=false;
      globalThis.location={href:'http://127.0.0.1:4173/portal.html?book=1'+scenario.suffix};
      globalThis.history={state:null,replaceState(_state,_title,url){clean=url;}};
      const account={client:{auth:{initialize:async()=>{if(scenario.fail)throw new Error('Private provider detail');return {error:scenario.returnedError?new Error('Private provider detail'):null};}}},
        refresh:async()=>{refreshed=true;},message:text=>message=text};
      await AccountExperience.prototype.start.call(account);
      assert.equal(refreshed,true);assert.equal(clean.search,'?book=1');assert.equal(clean.hash,'');
      assert.match(message,scenario.expected);assert.doesNotMatch(message,/private-detail|Private provider/);
    }
  }finally{
    if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
    if(oldHistory===undefined)delete globalThis.history;else globalThis.history=oldHistory;
  }
});

test('a verified callback awaiting legacy identity review is not an expired login or a workspace grant',async()=>{
  const saved={location:globalThis.location,history:globalThis.history,document:globalThis.document};let shown='',message='',bootstrapCalls=0;
  try{
    globalThis.location={href:'https://admitstrategy.com/portal?code=fixture'};
    globalThis.history={state:null,replaceState(){}};
    globalThis.document={createElement:()=>({})};
    const account=Object.assign(Object.create(AccountExperience.prototype),{
      root:{hidden:true},toolbar:{hidden:true},gate:{append(){}},
      client:{auth:{initialize:async()=>({error:null}),getUser:async()=>({data:{user:{id:'verified-claimant',email:'fixture@example.invalid'}}})},from(){assert.fail('Pending review must not fetch academic records');}},
      portal:{rpc:async name=>{assert.equal(name,'bootstrap_account');bootstrapCalls++;return {state:'review_required',claim_id:'claim'};}},
      show:html=>shown=html,message:text=>message=text
    });
    await account.start();
    assert.match(shown,/existing workspace is being linked/);assert.equal(message,'');
    assert.equal(account.user.id,'verified-claimant');assert.equal(account.portal.studentId,undefined);
    assert.equal(account.root.hidden,true);assert.equal(account.toolbar.hidden,true);assert.equal(bootstrapCalls,1);
  }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('Google login offers account choice and preserves the intended callback',async()=>{
  const previousDocument=globalThis.document;let googleButton,request;
  const form={querySelector:()=>({}),elements:{email:{value:''}}};
  try{
    globalThis.document={createElement:()=>({})};
    let shown=false;
    const account={config:{googleEnabled:true},gate:{querySelector:selector=>{
      if(selector==='[data-login]')return shown?form:null;
      if(selector==='[data-google-login]')return {append:button=>{googleButton=button;}};
      throw new Error('Unexpected element');
    }},show:()=>{shown=true;},run:async(_button,fn)=>fn(),redirectUrl:()=> 'https://admitstrategy.com/portal.html?diagnosis=fixture',
      client:{auth:{signInWithOAuth:async value=>{request=value;return {error:null};}}}};
    AccountExperience.prototype.login.call(account);
    await googleButton.onclick({currentTarget:googleButton});
    assert.equal(request.provider,'google');
    assert.equal(request.options.queryParams.prompt,'select_account');
    assert.equal(request.options.redirectTo,'https://admitstrategy.com/portal.html?diagnosis=fixture');
  }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('Google session recovery leaves the draft tab intact and offers a separate sign-in tab',async()=>{
  const originalDocument=globalThis.document;let request,googleButton,link,shown=false;
  const form={before(){},querySelector:()=>({}),elements:{email:{value:''}}};
  const target={append:button=>googleButton=button,replaceChildren:node=>link=node};
  try{
    globalThis.document={createElement:()=>({})};
    const account={config:{googleEnabled:true},suspendedView:{actorId:'student'},gate:{querySelector:selector=>selector==='[data-login]'?(shown?form:null):selector==='[data-google-login]'?target:form},show:()=>shown=true,run:async(_button,fn)=>fn(),redirectUrl:()=> 'http://127.0.0.1:4173/portal.html',
      client:{auth:{signInWithOAuth:async input=>{request=input;return {data:{url:'http://127.0.0.1:54321/auth/v1/authorize?provider=google'},error:null};}}}};
    AccountExperience.prototype.login.call(account);await googleButton.onclick({currentTarget:googleButton});
    assert.equal(request.options.skipBrowserRedirect,true);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
    assert.match(link.textContent,/another tab/);assert.equal(account.suspendedView.actorId,'student');
  }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
});
