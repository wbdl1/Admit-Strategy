import test from 'node:test';import assert from 'node:assert/strict';
import {extractSource} from '../src/sources.js';
test('source extraction ignores library messages and accepts only its own completed result',async()=>{
 const originalWorker=globalThis.Worker,originalLocation=globalThis.location;let terminated=false;
 globalThis.location={href:'https://example.invalid/portal.html'};
 globalThis.Worker=class{postMessage(){this.onmessage({data:{sourceName:'worker',action:'ready'}});this.onmessage({data:{type:'source-result',ok:true,extraction:{items:[{term:'Cell'}],sections:[]}}});}terminate(){terminated=true;}};
 try{const result=await extractSource({name:'notes.pdf',type:'application/pdf',arrayBuffer:async()=>new ArrayBuffer(1)},{sourceWorkerUrl:'worker.js',pdfWorkerUrl:'pdf.js'});assert.equal(result.items[0].term,'Cell');assert.equal(terminated,true);}
 finally{globalThis.Worker=originalWorker;globalThis.location=originalLocation;}
});
test('a cancelled extraction stops the worker and leaves a clear recovery message',async()=>{
 const originalWorker=globalThis.Worker,originalLocation=globalThis.location;let terminated=false;
 globalThis.location={href:'https://example.invalid/portal.html'};globalThis.Worker=class{postMessage(){}terminate(){terminated=true;}};
 try{const controller=new AbortController(),pending=extractSource({name:'notes.pdf',type:'application/pdf',arrayBuffer:async()=>new ArrayBuffer(1)},{sourceWorkerUrl:'worker.js',pdfWorkerUrl:'pdf.js'},{signal:controller.signal});controller.abort();await assert.rejects(pending,/original file is still saved/);assert.equal(terminated,true);}
 finally{globalThis.Worker=originalWorker;globalThis.location=originalLocation;}
});

test('an uncertain unit save retries the same context before preparation can continue',async()=>{
 const {SourcesWorkspace}=await import('../src/sources.js');
 const oldFormData=globalThis.FormData,oldOption=globalThis.Option;
 globalThis.FormData=class{constructor(form){return new Map(Object.entries(form.values));}};
 globalThis.Option=class{};
 const calls=[],form={values:{unitId:'',newUnit:'Cells',classId:'biology',assessmentId:'test'},elements:{unitId:{add(){}},newUnit:{value:'Cells'}}};
 const source=new SourcesWorkspace({portal:{studentId:'student',rpc:async(name,args)=>{calls.push(structuredClone(args));if(calls.length===1)throw new Error('Connection interrupted');return {record:{id:'unit',name:'Cells',class_id:'biology'}};}}});
 source.dialog={querySelector:()=>null,querySelectorAll:()=>[]};source.material={id:'material'};source.file={id:'file'};source.units=[];source.extraction={method:'manual_v1',sections:[],items:[]};source.savePending=async()=>{};
 try{
  await source.prepare(form);assert.equal(source.unsaved,true);assert.match(source.message,/save is unconfirmed/);
  form.values={unitId:'',newUnit:'Changed',classId:'chemistry',assessmentId:'other-test'};
  await source.prepare(form);assert.deepEqual(calls[1],calls[0]);assert.equal(source.pending.args.p_unit_id,'unit');assert.equal(source.pending.args.p_assessment_id,'test');assert.equal(source.newUnitRequest,null);
 }finally{globalThis.FormData=oldFormData;globalThis.Option=oldOption;}
});
