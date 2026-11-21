import test from 'node:test';import assert from 'node:assert/strict';
import {photoExtraction,photoQuality,PHOTO_TEXT_LIMIT} from '../src/photo-review.js';
import {detectSourceTargets} from '../src/source-targets.js';
import {extractSource,SourcesWorkspace} from '../src/sources.js';
test('checked photo text produces proposals with checked-text provenance, never mathematical answer cards',()=>{
 const text='Nucleus: Stores genetic information\n5x - 7 = 18: x = 5\nMitochondria — Release energy';
 const result=photoExtraction(text,{rawText:'NucIeus: Stores genetic information',confidence:71});
 assert.deepEqual(result.items.map(i=>i.term),['Nucleus','Mitochondria']);assert.equal(result.sections[0].text,text);
 assert.ok(!('original_text' in result.sections[0]));assert.equal(result.sections[0].reader,'tesseract_7_eng');
 assert.ok(result.items.every(i=>!('review_card_id' in i)&&!('status' in i)));
 assert.throws(()=>photoExtraction('  '),/Type the missing text/);assert.throws(()=>photoExtraction('a'.repeat(PHOTO_TEXT_LIMIT+1)),/one page/);
 assert.match(photoQuality('',0),/No readable/);assert.match(photoQuality('ATP',40),/unclear/);assert.match(photoQuality('ATP',95),/math symbols/);
});
test('only unambiguous bounded linear skill evidence is detected, with no solved answers',()=>{
 const targets=detectSourceTargets('1. x + 7 = 12\n2. 5x - 7 = 18\n3. 4x + 3 = 2x + 13\n4. 3x - 2 < 10');
 assert.deepEqual(targets.map(t=>t.skillId),['algebra.linear.one_step','algebra.linear.two_step','algebra.linear.both_sides','algebra.linear.inequality']);
 assert.ok(targets.every(t=>t.kind==='skill'&&!('answer' in t)));
 for(const text of ['x+x=2x','3x+2=3x+9','x^2=4','2(x+3)=8','x/2=4','y=3x+2','2x <=? 4','999999x=3','Cell = nucleus','x2=4','This explains 2x=4'])assert.deepEqual(detectSourceTargets(text),[],text);
});
test('photo worker is lazy, receives only same-origin asset paths and stops on cancellation',async()=>{
 const saved={Worker:globalThis.Worker,location:globalThis.location};let workerCount=0,terminated=0,payload,progress=0;
 globalThis.location={href:'https://admitstrategy.com/portal'};
 globalThis.Worker=class{constructor(url){workerCount++;assert.match(url.href,/photo-worker/);}postMessage(value){payload=value;this.onmessage({data:{type:'source-progress',stage:'recognizing text',progress:.5}});}terminate(){terminated++;}};
 try{
  const config={photoWorkerUrl:'assets/photo-worker.js',ocrWorkerUrl:'assets/ocr/worker.min.js',ocrCorePath:'assets/ocr',ocrLangPath:'assets/ocr'};
  const controller=new AbortController(),file={name:'sheet.png',type:'image/png',arrayBuffer:async()=>new ArrayBuffer(1)};
  const pending=extractSource(file,config,{signal:controller.signal,onProgress:()=>progress++});await Promise.resolve();controller.abort();await assert.rejects(pending,/original file is still saved/);
  assert.equal(workerCount,1);assert.equal(terminated,1);assert.equal(progress,1);assert.equal(payload.workerPath,'https://admitstrategy.com/assets/ocr/worker.min.js');
  await assert.rejects(extractSource(file,config,{signal:controller.signal}),/stopped/);assert.equal(workerCount,1);
 }finally{Object.assign(globalThis,saved);}
});
test('photo text confirmation reuses existing source RPC and preserves corrected draft on failed save',async()=>{
 const calls=[],source=new SourcesWorkspace({portal:{canEdit:true,rpc:async(name,args)=>{calls.push({name,args});throw new Error('Offline');}}});
 source.dialog={querySelector:()=>null,querySelectorAll:()=>[]};source.render=()=>{};source.material={id:'material',fileId:'file'};source.file={id:'file'};source.photoContext={unitId:'unit',assessmentId:'test'};source.photoReview={rawText:'NucIeus: DNA',text:'NucIeus: DNA',confidence:60};
 await source.confirmPhoto({elements:{photoText:{value:'Nucleus: Stores DNA'}}});
 assert.equal(calls[0].name,'prepare_study_source');assert.equal(calls[0].args.p_unit_id,'unit');assert.equal(calls[0].args.p_assessment_id,'test');assert.equal(calls[0].args.p_extraction.items[0].term,'Nucleus');
 assert.equal(source.photoDrafts.get('file').text,'Nucleus: Stores DNA');assert.equal(source.pending.args.p_request_key,calls[0].args.p_request_key);
 await source.savePending();assert.deepEqual(calls[1],calls[0]);
});

test('worksheet numbering survives OCR spacing loss and student exclusions survive saving', () => {
 const text = 'Algebra 1 - Practice Worksheet\n1.x+7=12\n2.5x-7=18\n3.4x+3=2x+13\n4.3x-2<10';
 const prepared = photoExtraction(text, {excludedSkills:['algebra.linear.one_step']});
 assert.deepEqual(prepared.sections[0].targets.map(t => t.skillId), ['algebra.linear.two_step','algebra.linear.both_sides','algebra.linear.inequality']);
 assert.deepEqual(prepared.items, []);
 assert.deepEqual(detectSourceTargets('2.5x=10'), []);
});
