import test from 'node:test';import assert from 'node:assert/strict';
import {StudyWorkspace,parseStudyPaste} from '../src/study.js';
import {studyFormatterPrompt} from '../src/study-formatter.js';
import {SourcesWorkspace} from '../src/sources.js';
test('32-item import offers Add before a collapsed optional review and keeps edited preview pages',()=>{
 const workspace=new StudyWorkspace({portal:{},patch(){},notify(){}}),container={innerHTML:'',querySelector:()=>null},entry={hidden:false},form={querySelector:q=>q==='[data-paste-preview]'?container:entry};
 const s={preview:parseStudyPaste(Array.from({length:32},(_,i)=>`Term ${i}\tAnswer ${i}`).join('\n'))};
 workspace.renderPreview(s,form);assert.match(container.innerHTML,/32 items found/);assert.ok(container.innerHTML.indexOf('Add 32 items')<container.innerHTML.indexOf('Review before adding'));assert.doesNotMatch(container.innerHTML,/<details data-preview-review open/);assert.equal(entry.hidden,true);
 s.preview.items[0].answer='Edited';s.previewPage=1;container.querySelector=()=>({open:true});workspace.renderPreview(s,form);assert.match(container.innerHTML,/<details data-preview-review open/);assert.match(container.innerHTML,/Items 21–32 of 32/);assert.equal(s.preview.items[0].answer,'Edited');
 s.preview=parseStudyPaste('Malformed row');workspace.renderPreview(s,form);assert.equal(entry.hidden,false);assert.doesNotMatch(container.innerHTML,/data-study-action="import"/);
});
test('formatter copies only the static prompt and provides manual copy recovery',async()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copied,focused=false,selected=false;
 const status={},input={focus(){focused=true;},select(){selected=true;}},fallback={hidden:true,querySelector:()=>input},panel={querySelector:q=>q==='[data-formatter-status]'?status:fallback};
 const button={dataset:{studyAction:'copy-formatter'},closest:()=>panel},event={stopPropagation(){},target:{closest:()=>button}},workspace=new StudyWorkspace({portal:{},patch(){},notify(){}});
 try{Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{copied=text;}}}});await workspace.click({},event);assert.equal(copied,studyFormatterPrompt);assert.match(copied,/ONLY the material/);assert.match(copied,/Do not invent/);assert.match(status.textContent,/copied/);
 navigator.clipboard.writeText=async()=>{throw Error('Denied');};await workspace.click({},event);assert.equal(fallback.hidden,false);assert.equal(input.value,studyFormatterPrompt);assert.ok(focused&&selected);
 }finally{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
});
test('source Add all requires an explicit action and uses edited proposals through the existing review path',async()=>{
 let saved;const rows=[{dataset:{sourceItem:'a'},elements:{term:{value:'Edited term'},answer:{value:'Edited answer'}}},{dataset:{sourceItem:'b'},elements:{term:{value:'Other'},answer:{value:'Answer'}}}];
 const workspace=new SourcesWorkspace({portal:{canEdit:true}});workspace.dialog={querySelectorAll:()=>rows};workspace.review=async values=>{saved=values;};
 const button={dataset:{sourceAction:'approve-all'}},event={preventDefault(){},stopPropagation(){},target:{closest:q=>q==='[data-source-action]'?button:null}};
 assert.equal(saved,undefined);await workspace.click(event);assert.deepEqual(saved,rows.map(r=>({id:r.dataset.sourceItem,term:r.elements.term.value,answer:r.elements.answer.value,status:'approved'})));
 saved=null;workspace.portal.canEdit=false;await workspace.click(event);assert.equal(saved,null);
});
