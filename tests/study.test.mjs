import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudyPaste,StudyStore,StudyWorkspace,studyDue,studyStage} from '../src/study.js';
test('bulk paste accepts spreadsheets, quoted CSV, pipes and Unicode without silent malformed rows',()=>{
 assert.equal(parseStudyPaste('Cell\tBasic unit\nNucleus\tDNA').items.length,2);
 assert.deepEqual(parseStudyPaste('"Term, one","Answer with ""quotes""\nand newlines"','comma').items[0],{term:'Term, one',answer:'Answer with "quotes"\nand newlines',prompt:''});
 assert.equal(parseStudyPaste('مرحبا | Hello').errors.length,0);
 assert.equal(parseStudyPaste('Term | Answer\nTerm | Answer').duplicates,1);
 for(const text of ['A','A |','A | B | C','"unclosed,B'])assert.ok(parseStudyPaste(text).errors.length,text);
 assert.ok(parseStudyPaste('x'.repeat(161)+' | A').errors.length);
 assert.equal(parseStudyPaste(Array.from({length:1000},(_,i)=>`${i}\tAnswer`).join('\n')).items.length,1000);
 assert.ok(parseStudyPaste(Array.from({length:1001},(_,i)=>`${i}\tAnswer`).join('\n')).errors.length);
});
test('study store traverses beyond API limits and removes archived or deleted cached cards',async()=>{
 const cards=Array.from({length:1025},(_,i)=>({id:String(i).padStart(5,'0'),class_id:'class',term:'Term',answer:'Answer',box:1,row_version:1,archived_at:i===0?'2026-01-01':null}));
 const tables={review_cards:cards,study_units:[{id:'unit'}],assessments:[{id:'assessment'}],study_unit_assessments:[{id:'link',unit_id:'unit',assessment_id:'assessment'},{id:'unrelated',unit_id:'another-unit'}]},calls={};
 const portal={studentId:'student',raw:new Map(),data:{classes:[{id:'class',name:'Biology'}],reviewCards:[{id:'deleted',classId:'class'},{id:'other',classId:'other'}]},result:q=>q,client:{from(table){let after='',count,filter=()=>true;const q={select(){return q;},eq(){return q;},in(key,ids){filter=row=>ids.includes(row[key]);return q;},order(){return q;},limit(n){count=n;return q;},gt(_key,v){after=v;return q;},then(resolve){calls[table]=(calls[table]||0)+1;resolve(tables[table].filter(c=>c.id>after&&filter(c)).slice(0,count));}};return q;}}};
 const store=new StudyStore(portal);await store.load('class');assert.equal(store.cards.length,1025);assert.equal(calls.review_cards,6);assert.deepEqual(store.assessments,tables.assessments);assert.deepEqual(store.links,[tables.study_unit_assessments[0]]);assert.equal(portal.data.reviewCards.length,1025);assert.ok(!portal.data.reviewCards.some(c=>c.id==='00000'||c.id==='deleted'));
});
test('student-friendly stages and due filtering preserve scheduler meaning',()=>{assert.equal(studyStage({box:5}),'Strong');assert.equal(studyDue({box:1}),true);assert.equal(studyDue({box:5}),false);assert.equal(studyDue({box:1,archived_at:'2026-01-01'}),false);});

test('an uncertain study save retries the exact request and advances only after confirmation',async()=>{
 let fail=true,saved=0;const calls=[];
 const portal={studentId:'student'},workspace=new StudyWorkspace({portal,patch(){},onChange(){},notify(){}});
 workspace.lock=()=>{};workspace.status=()=>{};workspace.render=()=>{};
 const state={classId:'class',root:{querySelector:()=>null},store:{units:[],cards:[],sync(){},async mutate(name,args){calls.push(structuredClone({name,args}));if(fail)throw new Error('Connection interrupted');return {ok:true,record:{id:'card',box:2}};}}};
 await workspace.mutate(state,'answer_study_item',{p_card_id:'card',p_correct:true,p_expected_version:1},()=>saved++);
 assert.equal(saved,0);assert.ok(state.pending);fail=false;
 await workspace.mutate(state);assert.equal(saved,1);assert.equal(state.pending,null);assert.deepEqual(calls[0],calls[1]);
});
test('account switching rejects a pending study write before dispatch',async()=>{
 let calls=0;const workspace=new StudyWorkspace({portal:{},isActive:()=>false,patch(){},onChange(){},notify(){}});
 workspace.lock=()=>{};workspace.status=()=>{};workspace.render=()=>{};
 const state={root:{querySelector:()=>null},store:{mutate(){calls++;}}};await workspace.mutate(state,'save_record',{});
 assert.equal(calls,0);assert.ok(state.pending);assert.match(state.message,/same account/);
});
test('a stale study store cannot read into a different student workspace',async()=>{
 const portal={studentId:'one'},store=new StudyStore(portal);portal.studentId='two';await assert.rejects(store.load('class'),/closed/);assert.throws(()=>store.sync(),/closed/);
});

test('coverage buttons save after concept reveal while flashcards still require revealing the answer',async()=>{
 const workspace=new StudyWorkspace({portal:{},patch(){},notify(){}});let answers=[];workspace.answer=async(_s,rating)=>answers.push(rating);
 const state={session:{session:{reflection_revealed_at:'2026-10-16'},items:[{id:'item',review_card_id:'card',presentation:'coverage'}],cards:[{id:'card'}]}};
 const event={stopPropagation(){},target:{closest(){return {dataset:{studyAction:'missed'}};}}};
 await workspace.click(state,event);assert.deepEqual(answers,['missed']);state.session.session.reflection_revealed_at=null;await workspace.click(state,event);assert.equal(answers.length,1);
 state.session.items[0].presentation='flashcard';await workspace.click(state,event);assert.equal(answers.length,1);state.revealed=true;await workspace.click(state,event);assert.equal(answers.length,2);
});


test('starting and grading a source concept retain its source reference without another fetch',async()=>{
 const workspace=new StudyWorkspace({portal:{},patch(){},onChange(){},notify(){}});
 workspace.lock=()=>{};workspace.status=()=>{};workspace.render=()=>{};
 const source=[{id:'proposal',source_id:'source',locator:'Page 2',study_sources:{filename:'Worksheet.pdf'}}];
 const state={root:{querySelector:()=>null},store:{units:[],cards:[{id:'card',term:'Cell',box:1,study_source_items:source}],sync(){},async mutate(name){return name==='start'?{ok:true,cards:[{id:'card',term:'Cell',box:1}]}:{ok:true,record:{id:'card',term:'Cell',box:2}};}}};
 await workspace.mutate(state,'start',{});await workspace.mutate(state,'answer',{});
 assert.equal(state.store.cards[0].box,2);assert.deepEqual(state.store.cards[0].study_source_items,source);
 state.session={session:{method:'flashcard'},cards:[{id:'card'}],items:[{review_card_id:'card'}]};
 assert.match(workspace.sourceMarkup(state),/View source/);
});


test('answer feedback keeps the source for the answered concept until Next item',()=>{
 const workspace=new StudyWorkspace({portal:{},patch(){},notify(){}});
 const cards=['answered','next'].map(id=>({id,term:id,study_source_items:[{id:'source-'+id}]}));
 const state={store:{cards},session:{session:{method:'flashcard'},cards,items:[{review_card_id:'next'}]},feedback:{before:{id:'answered'}}};
 assert.match(workspace.sourceMarkup(state),/data-id="answered"/);
 assert.doesNotMatch(workspace.sourceMarkup(state),/data-id="next"/);
 state.feedback=null;
 assert.match(workspace.sourceMarkup(state),/data-id="next"/);
});
