import test from 'node:test';import assert from 'node:assert/strict';import {LocalDictation} from '../src/local-dictation.js';
test('dictation refuses remote-only engines and never installs speech packs',async()=>{
 let started=0,messages=[];class Remote{start(){started++;}}Remote.available=async()=> 'available';
 const d=new LocalDictation({Recognition:Remote,onStatus:s=>messages.push(s)});await d.start();assert.equal(started,0);assert.match(messages[0],/isn’t available/);
 class Missing extends Remote{}Missing.prototype.processLocally=false;Missing.available=async args=>{assert.equal(args.processLocally,true);return 'downloadable';};d.Recognition=Missing;await d.start();assert.equal(started,0);
});
test('available dictation forces on-device processing and stops when the context closes',async()=>{
 let instance,texts=[],valid=true;class Local{constructor(){instance=this;}start(){assert.equal(this.processLocally,true);}stop(){this.onend?.();}}Local.prototype.processLocally=false;Local.available=async()=> 'available';
 const d=new LocalDictation({Recognition:Local,onText:t=>texts.push(t),isActive:()=>valid});await d.start();assert.equal(d.active,true);instance.onresult({resultIndex:0,results:[Object.assign([{transcript:'Cell energy'}],{isFinal:true})]});assert.deepEqual(texts,['Cell energy']);valid=false;instance.onresult({resultIndex:0,results:[]});assert.equal(d.active,false);d.stop();
});
