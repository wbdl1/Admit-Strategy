import test from 'node:test';import assert from 'node:assert/strict';
import {packCode,packPreviewMarkup,StudyPacks} from '../src/study-packs.js';
import {capturePendingPack,takePendingPack} from '../src/pack-intent.js';
const manifest={schema_version:1,title:'<script>private</script>',creator:'<Student>',source_credit:'My own notes',units:[{key:'u1',name:'Cells'}],targets:[{key:'c1',kind:'knowledge',unit_key:'u1',title:'Nucleus',answer:'Stores DNA',prompt:'What does it do?',accepted_answers:['Genetic material'],required_keywords:['DNA']}],models:[]};
test('preview escapes content, shows complete answer rules and rejects unsupported target types',()=>{
 const html=packPreviewMarkup(manifest);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;Student&gt;/);for(const copy of ['Stores DNA','Genetic material','DNA','My own notes','1 concept'])assert.ok(html.includes(copy));
 assert.throws(()=>packPreviewMarkup({...manifest,targets:[{kind:'skill'}]}),/newer version/);
});
test('pack codes stay in fragments and survive same-browser sign-in without retaining OAuth codes',()=>{
 const saved=new Map(),old={location:globalThis.location,history:globalThis.history,sessionStorage:globalThis.sessionStorage};
 const code='b'.repeat(64);let replacement;
 globalThis.location=new URL('https://admitstrategy.com/portal.html?code=oauth#pack='+code);globalThis.history={state:null,replaceState:(_s,_t,url)=>replacement=String(url)};globalThis.sessionStorage={setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k),removeItem:k=>saved.delete(k)};
 try{capturePendingPack();assert.equal(takePendingPack(),code);assert.equal(replacement,'https://admitstrategy.com/portal.html?code=oauth');assert.equal(packCode('https://admitstrategy.com/pack#pack='+code),code);assert.equal(packCode('https://other.invalid/pack#pack='+code),null);assert.equal(packCode(code.slice(1)),null);}
 finally{Object.assign(globalThis,old);}
});
test('retrying publication retains the exact request key and does not report success before images finish',async()=>{
 const args=[];let fail=true,linked=false;const workspace=Object.assign(Object.create(StudyPacks.prototype),{selection:{p_title:'Cells'},preview:{preview_hash:'hash'},pending:null,active:()=>true,message:()=>{},link:()=>linked=true,portal:{rpc:async(_name,arg)=>{args.push(arg);if(fail)throw Error('Network');return{status:'published',code:'c'};}}});
 const form={elements:{rights:{checked:true}}};await assert.rejects(workspace.publish(form),/Network/);assert.equal(linked,false);fail=false;await workspace.publish(form);assert.equal(args[0],args[1]);assert.equal(linked,true);assert.equal(workspace.pending,null);
});
