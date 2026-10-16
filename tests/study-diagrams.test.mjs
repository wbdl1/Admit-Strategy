import test from 'node:test';import assert from 'node:assert/strict';
import {StudyDiagrams,privateStudyImage,diagramMarkup} from '../src/study-diagrams.js';
test('diagram markers are bounded numeric content with stable session numbering',()=>{
 const html=diagramMarkup('blob:private',[{review_card_id:'concept',x:50,y:30,number:2}],'concept');assert.match(html,/>2<\/span>/);assert.match(html,/left:50%;top:30%/);assert.match(html,/alt="Private study diagram/);assert.ok(!html.includes('undefined'));
});
test('private image retrieval requires a ready authorized file and handles storage failure',async()=>{
 let bucket,path;const q={select(){return q;},eq(){return q;},is(){return q;},single(){return q;}};
 const portal={result:async()=>({storage_path:'student/private.png',mime_type:'image/png'}),client:{from:()=>q,storage:{from(name){bucket=name;return {download:async p=>{path=p;return {error:new Error('denied')}}};}}}};
 await assert.rejects(privateStudyImage(portal,'file'),/Private image could not load/);assert.equal(bucket,'student-files');assert.equal(path,'student/private.png');
 portal.result=async()=>({mime_type:'text/html'});await assert.rejects(privateStudyImage(portal,'file'),/supported image/);
});
test('an interrupted diagram save preserves the draft and retries exactly once with the same key',async()=>{
 let fail=true,calls=[];const d=new StudyDiagrams({portal:{rpc:async(_name,args)=>{calls.push(structuredClone(args));if(fail)throw new Error('Interrupted');return {ok:true};}},config:{},patch(){},onStart(){},isActive:()=>true});d.unit={id:'unit'};d.status=()=>{};d.load=async()=>{};
 d.draft={id:'diagram',file_id:'file',title:'Cell',points:[{review_card_id:'card',x:50,y:50}],row_version:null};d.dirty=true;
 await d.save(d.draft,false);assert.ok(d.pending);assert.ok(d.draft);fail=false;await d.save();assert.deepEqual(calls[0],calls[1]);assert.equal(d.pending,null);assert.equal(d.dirty,false);assert.equal(d.draft,null);
});
