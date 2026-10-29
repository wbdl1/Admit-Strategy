import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../portal.html",import.meta.url),"utf8");
const queueSource=source.slice(source.indexOf("function ensureSaveQueue(){"),source.indexOf("function appendSaveRecovery("));
test('canonical project steps wait for persisted events and rejected saves leave milestones unchanged',()=>{
  for(const operation of ['completeproject','milestoneproject','reachproject']){
    let hooks;
    const project={id:'project',nextAction:'Draft outline'};
    const event={id:'milestone',completedAt:null};
    const data={projects:[project],projectEvents:[event]};
    const context={saveQueue:null,canonicalPortal:{},accountExperience:{user:{id:'actor'}},currentData:data,mutationUI:new Map(),
      window:{Admit:{bindWorkspaceMutation:()=>({active:()=>true}),MutationQueue:class{constructor(options){hooks=options;}laterPending(){return [];}}}},
      collectionFor:()=> 'projects',applyDemoAction(){throw new Error('Canonical project events must wait for the server');},
      renderAffectedViews(){},showStatus(){},renderSyncPanel(){},clearTimeout(){},toastTimer:null};
    vm.runInNewContext(queueSource+';ensureSaveQueue();',context);
    const job={id:'request',values:{operation,recordId:'project',eventId:'milestone'}};
    hooks.optimistic(job);
    assert.equal(data.projects[0].nextAction,'Draft outline');assert.equal(data.projectEvents.length,1);assert.equal(event.completedAt,null);
    job.state='failed';job.error={rejected:true,message:'Retry this change'};hooks.onState(job);
    assert.equal(data.projects[0].nextAction,'Draft outline');assert.equal(data.projectEvents.length,1);assert.equal(event.completedAt,null);
  }
});

test("confirmed creates reset only the submitted revision and keep its panel open",()=>{
  for(const revision of ["submitted","newer-draft"]){
    const panel={open:true},button={disabled:false,textContent:"Add"},messages=[],feedback={textContent:""};
    let resetCount=0,hooks;
    const form={dataset:{revision,dirty:"true"},reset(){resetCount++;},querySelector(selector){return selector==="[data-class-feedback]"?feedback:null;},querySelectorAll(){return [];},closest(){return panel;}};
    const context={saveQueue:null,canonicalPortal:null,mutationUI:new Map([["request",{form,button,revision:"submitted",label:"Add"}]]),
      window:{Admit:{MutationQueue:class{constructor(options){hooks=options;}}}},showStatus:text=>messages.push(text),renderSyncPanel(){},clearTimeout(){},toastTimer:null};
    vm.runInNewContext(queueSource+";ensureSaveQueue();",context);
    const job={id:"request",values:{operation:"addclass"},state:"saving"};
    hooks.onState(job);assert.equal(button.disabled,true);assert.equal(resetCount,0);assert.equal(messages.at(-1),"Saving…");assert.equal(feedback.textContent,"Saving…");
    job.state="saved";hooks.onState(job);
    assert.equal(button.disabled,false);assert.equal(messages.at(-1),"Saved ✓");assert.equal(feedback.textContent,"Saved ✓");assert.equal(panel.open,true);
    assert.equal(resetCount,revision==="submitted"?1:0);
    assert.equal(form.dataset.dirty,revision==="submitted"?undefined:"true");
  }
});


test('patching a dirty form preserves browser-owned file selections and its uploaded file reference',()=>{
 const runtime=readFileSync(new URL('../src/runtime.js',import.meta.url),'utf8');let hooks;
 const context={morphdom(_a,_b,options){hooks=options;}};
 vm.runInNewContext(runtime.slice(runtime.indexOf('function key('),runtime.indexOf('window.Admit =')),context);
 context.patch({cloneNode(){return {}; }},'');
 const make=selector=>({hasAttribute(){return false;},matches(s){return s===selector;},closest(){return {};},isEqualNode(){return false;},tagName:'INPUT'});
 const selected=make('input[type="file"]');Object.defineProperty(selected,'value',{get(){return 'C:\\fakepath\\notes.txt';}});
 const target={};Object.defineProperty(target,'value',{set(){throw new Error('Browser forbids copying a file path');}});
 assert.equal(hooks.onBeforeElUpdated(selected,target),false);
 assert.equal(hooks.onBeforeElUpdated(make('input[type="hidden"][name="fileId"]'),{}),false);
});
