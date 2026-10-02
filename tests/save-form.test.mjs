import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../portal.html",import.meta.url),"utf8");
const queueSource=source.slice(source.indexOf("function ensureSaveQueue(){"),source.indexOf("function appendSaveRecovery("));
test("confirmed creates reset only the submitted revision and keep its panel open",()=>{
  for(const revision of ["submitted","newer-draft"]){
    const panel={open:true},button={disabled:false,textContent:"Add"},messages=[];
    let resetCount=0,hooks;
    const form={dataset:{revision,dirty:"true"},reset(){resetCount++;},querySelector(){return null;},querySelectorAll(){return [];},closest(){return panel;}};
    const context={saveQueue:null,canonicalPortal:null,mutationUI:new Map([["request",{form,button,revision:"submitted",label:"Add"}]]),
      window:{Admit:{MutationQueue:class{constructor(options){hooks=options;}}}},showStatus:text=>messages.push(text),renderSyncPanel(){},clearTimeout(){},toastTimer:null};
    vm.runInNewContext(queueSource+";ensureSaveQueue();",context);
    const job={id:"request",values:{operation:"addclass"},state:"saving"};
    hooks.onState(job);assert.equal(button.disabled,true);assert.equal(resetCount,0);assert.equal(messages.at(-1),"Saving…");
    job.state="saved";hooks.onState(job);
    assert.equal(button.disabled,false);assert.equal(messages.at(-1),"Saved ✓");assert.equal(panel.open,true);
    assert.equal(resetCount,revision==="submitted"?1:0);
    assert.equal(form.dataset.dirty,revision==="submitted"?undefined:"true");
  }
});
