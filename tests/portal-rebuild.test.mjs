import test from 'node:test';
import assert from 'node:assert/strict';
import {FileUploads,validateSelection} from '../src/files.js';
import {StudyDiagrams,modelLabels,modelPosition} from '../src/study-diagrams.js';

test('model placement clamps at the image edge and reuses canonical concepts by answer',()=>{
 assert.deepEqual(modelPosition(-10,108),{x:0,y:100});
 const points=modelLabels([{label:' Nucleus ',x:25,y:40}],[{id:'existing',term:'nucleus'}]);
 assert.equal(points[0].review_card_id,'existing');assert.equal(points[0].label,'Nucleus');
 assert.throws(()=>modelLabels([{label:'x',x:NaN,y:10}],[]),/position/);
 assert.throws(()=>modelLabels([{label:'x',x:10,y:10},{label:' X ',x:20,y:20}],[]),/once/);
});
test('model label import and model save retain separate immutable retry identities',async()=>{
 let failImport=true,failDiagram=true;const calls=[];
 const portal={rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});if(name==='import_study_items'){if(failImport)throw new Error('Offline');return {records:[{id:'new',term:'Nucleus'}]};}if(failDiagram)throw new Error('Offline');return {ok:true};}};
 const editor=new StudyDiagrams({portal,config:{},patch(){},onStart(){},isActive:()=>true});editor.unit={id:'unit'};editor.status=()=>{};editor.load=async()=>{};
 editor.draft={id:'diagram',file_id:'private-file',title:'Cell',row_version:null,points:[{label:'Nucleus',x:10,y:20}]};
 await editor.save(editor.draft,false);const importKey=editor.importPending.p_request_key;assert.equal(editor.pending,undefined);
 failImport=false;await editor.save();const diagramKey=editor.pending.p_request_key;assert.equal(editor.draft.points[0].review_card_id,'new');
 failDiagram=false;await editor.save();assert.equal(editor.draft,null);
 const imports=calls.filter(c=>c.name==='import_study_items'),diagrams=calls.filter(c=>c.name==='save_study_diagram');assert.equal(imports.length,2);assert.equal(diagrams.length,2);
 assert.equal(imports[0].args.p_request_key,importKey);assert.deepEqual(imports[0],imports[1]);assert.equal(diagrams[0].args.p_request_key,diagramKey);assert.deepEqual(diagrams[0],diagrams[1]);
});
function uploadFixture(transport){
 const reservations=[],ingested=[];const query={select(){return this;},eq(){return this;},single(){return this;}};
 const portal={studentId:'student',rpc:async(name,args)=>{reservations.push(structuredClone(args));return {file:{id:'file',storage_path:'student/file'}};},result:async()=>({state:'pending'}),client:{from:()=>query,auth:{getSession:async()=>({data:{session:{access_token:'fake-token'}}})}},ingest:(...args)=>ingested.push(args)};
 const uploads=new FileUploads({portal,config:{supabaseUrl:'http://127.0.0.1:54321',publishableKey:'fake-public-key'},transport,fetcher:async()=>({ok:true,json:async()=>({ok:true,file:{id:'file',state:'ready'},material:{id:'material'}})})});
 return {uploads,reservations,ingested};
}
test('paused file uploads resume the same reservation and only show saved after validation',async()=>{
 let uploading;const started=new Promise(resolve=>uploading=resolve);let attempts=0;
 const {uploads,reservations,ingested}=uploadFixture(async({signal})=>{attempts++;if(attempts===1){uploading();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('Paused'),{paused:true})),{once:true}));}});
 const job=uploads.add(new File(['notes'],'notes.txt'),'class');await started;uploads.pause(job.id);await job.done;
 assert.equal(job.state,'paused');assert.equal(ingested.length,0);assert.ok(job.file);
 await uploads.retry(job.id);assert.equal(job.state,'saved');assert.equal(job.file,null);assert.equal(ingested.length,1);assert.deepEqual(reservations[0],reservations[1]);
});
test('upload validation rejects unsupported or oversized files before reserving storage',()=>{
 assert.throws(()=>validateSelection({name:'notes.exe',size:100}),/Choose PDF/);
 assert.throws(()=>validateSelection({name:'notes.pdf',size:21*1024*1024}),/20 MB/);
 assert.equal(validateSelection({name:'notes.pdf',size:100}),'application/pdf');
});
