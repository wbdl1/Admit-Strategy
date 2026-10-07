import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../portal.html',import.meta.url),'utf8');
const forms=source.slice(source.indexOf('function classAccessMessage(){'),source.indexOf('function materialList('));
function fixture(canEdit,status,classes=[]){const context={canonicalPortal:canEdit===null?null:{canEdit},currentData:{accountStatus:status,classes},safe:s=>String(s),formActions:label=>`<button type='submit'>${label}</button>`};vm.createContext(context);vm.runInContext(forms,context);return context;}
test('a restricted workspace explains the blocked class action beside the fields and exposes recovery',()=>{
 const context=fixture(false,'pending_guardian');const html=context.addClassForm();
 assert.match(html,/read-only/);assert.match(html,/data-class-access>Check workspace access/);
 assert.doesNotMatch(html,/type='submit'/);assert.doesNotMatch(html,/disabled/);assert.match(html,/data-close-form/);assert.match(html,/class-add-panel' open/);
});
test('editable and demo workspaces can add classes with optional settings after the action',()=>{
 for(const canEdit of [true,null]){const context=fixture(canEdit,'pending_guardian',[{name:'Biology'}]),html=context.addClassForm();assert.equal(context.classAccessMessage(),'');assert.match(html,/type='submit'>Add/);assert.doesNotMatch(html,/data-class-access/);assert.ok(html.indexOf("type='submit'")<html.indexOf('Advanced Settings'));assert.match(html,/data-class-feedback role='status'/);}
});
test('read-only accounts do not receive a misleading guardian-approval promise',()=>{
 const context=fixture(false,'active');assert.match(context.classAccessMessage(),/read-only/);assert.doesNotMatch(context.classAccessMessage(),/guardian must approve/);
});
test('implicit keyboard submit cannot queue a mutation in a restricted class form',()=>{
 const handlers={};let message='',focused=false,prevented=false;
 const form={hasAttribute:n=>n==='data-class-form',querySelector:s=>s==='[data-class-feedback]'?{set textContent(value){message=value;}}:{focus(){focused=true;}},reportValidity(){assert.fail('Access must be explained before validation');}};
 const context={...fixture(false,'pending_guardian'),document:{addEventListener:(event,handler)=>handlers[event]=handler}};
 vm.runInNewContext(source.slice(source.indexOf('document.addEventListener("submit"'),source.indexOf('document.addEventListener("click"')),context);
 handlers.submit({target:{closest:()=>form},preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(focused,true);assert.match(message,/read-only/);
});
test('class access and cancellation stay actionable under read-only permission enforcement',()=>{
 const blocked={disabled:false,matches:()=>false},recovery={disabled:false,matches:()=>true},cancel={disabled:false,matches:()=>true};
 const context={canonicalPortal:{canEdit:false},fileExperience:null,calendarExperience:null,historyExperience:null,document:{querySelectorAll:()=>[blocked,recovery,cancel]}};
 vm.runInNewContext(source.slice(source.indexOf('function applyAccountPermissions(){'),source.indexOf('function actionId(){'))+';applyAccountPermissions();',context);
 assert.equal(blocked.disabled,true);assert.equal(recovery.disabled,false);assert.equal(cancel.disabled,false);
});
test('invalid optional class input expands its section and explains the error inline',()=>{
 let handler;const feedback={},form={querySelector:()=>feedback},details={tagName:'DETAILS',open:false,parentElement:form};
 const input={parentElement:details,validationMessage:'Choose a value of at least 10.',closest:selector=>selector==='form[data-class-form]'?form:{textContent:'Default study block (minutes)'}};
 const context={document:{addEventListener:(_event,fn)=>handler=fn}};
 vm.runInNewContext(source.slice(source.indexOf('document.addEventListener("invalid"'),source.indexOf('document.addEventListener("submit"')),context);
 handler({target:input});assert.equal(details.open,true);assert.match(feedback.textContent,/Default study block.*at least 10/);
});
