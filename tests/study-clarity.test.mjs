import test from 'node:test';
import assert from 'node:assert/strict';
import {strengthLabel,needsPractice,recommendStudy,resultLabel} from '../src/study-state.js';
import {StudyWorkspace,studyStage,studyShortcut} from '../src/study.js';
import {modesMarkup} from '../src/study-vision.js';
import {LocalDictation} from '../src/local-dictation.js';

test('all surfaces use Box strength without rewriting historical recall or removing active weakness',()=>{
 for(const rating of ['missed','partly','knew',null])for(const [index,label] of ['Weak','Learning','Improving','Strong','Strong'].entries()){
  const card={box:index+1,last_rating:rating};assert.equal(strengthLabel(card),label);assert.equal(studyStage(card),label);assert.equal(card.last_rating,rating);
 }
 const moved={box:5,last_rating:'missed'};assert.equal(strengthLabel(moved),'Strong');assert.equal(needsPractice(moved),true);assert.equal(resultLabel(moved.last_rating),'Didn’t know');
 assert.equal(needsPractice({...moved,last_rating:'knew'}),false);
});
test('recommendation respects assessment links, deduplicates due/weak, and excludes archived content',()=>{
 const cards=[{id:'a',unit_id:'u',last_rating:'missed',next_review:'2026-10-18'},{id:'b',unit_id:'u',last_rating:'knew',last_reviewed_at:'2026-10-18',next_review:'2026-11-01'},{id:'x',unit_id:'other',next_review:'2020-01-01'},{id:'z',unit_id:'u',archived_at:'now'}];
 const r=recommendStudy(cards,[{id:'t',name:'Test',due_date:'2026-10-20',status:'upcoming'}],[{unit_id:'u',assessment_id:'t'}],'2026-10-19');
 assert.deepEqual(r.cards.map(c=>c.id),['a']);assert.equal(r.due,1);assert.equal(r.weak,1);assert.equal(r.method,'learn');
});
test('methods and learning-system destinations are structurally distinct',()=>{
 const html=modesMarkup();assert.equal((html.match(/class="study-mode-card"/g)||[]).length,6);assert.equal((html.match(/Best for:/g)||[]).length,6);
 const methods=html.split('Your learning system')[0];assert.ok(!methods.includes('data-mode="boxes"'));assert.ok(!methods.includes('data-mode="weak"'));
 assert.match(html,/Teach the Class/);assert.match(html,/When material comes back/);
});
function workspace(){const w=new StudyWorkspace({portal:{data:{classes:[]}},patch:()=>{},config:{},onChange:()=>{},notify:()=>{}});return w;}
function state(){return {store:{cards:[],units:[]},drafts:new Map(),selection:new Set(),session:{session:{id:'s',method:'flashcard',status:'active',planned_count:1},cards:[{id:'c',box:3,last_rating:'missed',term:'Term',answer:'Hidden answer',next_review:'2026-10-25'}],items:[{id:'i',review_card_id:'c',presentation:'flashcard'}]}};}
test('flashcard front conceals the answer, back permits grading, and flipping back conceals it again',()=>{
 const w=workspace(),s=state();let html=w.sessionMarkup(s);assert.match(html,/Flip to answer/);assert.ok(!html.includes('Hidden answer'));assert.ok(!html.includes('data-study-action="knew"'));
 s.revealed=true;html=w.sessionMarkup(s);assert.match(html,/is-flipped/);assert.match(html,/Hidden answer/);assert.match(html,/data-study-action="knew"/);
 s.revealed=false;assert.ok(!w.sessionMarkup(s).includes('Hidden answer'));
 const event={key:' ',target:{closest:()=>null}};assert.equal(studyShortcut(event,true),'reveal');
});
test('gallery has Study primary and no normal checkboxes, selection exposes a batch toolbar',()=>{
 const w=workspace(),s=state(),cards=s.session.cards;
 let html=w.galleryMarkup(s,cards,[],false);assert.match(html,/Study Term/);assert.match(html,/More actions for Term/);assert.match(html,/Hidden answer/);assert.ok(!html.includes('type="checkbox"'));
 s.selecting=true;s.selection.add('c');html=w.galleryMarkup(s,cards,[],false);assert.match(html,/1 selected/);assert.match(html,/Study selected/);assert.match(html,/type="checkbox"/);
});
test('teaching progressively discloses question and debrief controls without losing typed text',()=>{
 const w=workspace(),s=state();s.session.session={...s.session.session,method:'feynman',reflection_text:'Saved teaching'};s.session.prompts=[{id:'q',question:'Why?',response:'',self_rating:null}];
 let html=w.reflectionMarkup(s);assert.match(html,/Continue to questions/);assert.ok(!html.includes('Continue to debrief'));assert.ok(!html.includes('data-study-action="ask-question"'));
 s.teachingStep='questions';html=w.reflectionMarkup(s);assert.match(html,/Continue to debrief/);assert.ok(!html.includes('name="reflection"'));assert.match(html,/Saved teaching/);
 s.questionId='q';html=w.reflectionMarkup(s);assert.match(html,/name="rating" required/);assert.match(html,/Choose your result/);assert.ok(!html.includes('Continue to debrief'));
});
test('dictation distinguishes absent pack, blocked microphone, and preserves errors through onend',async()=>{
 let instance;class Local{constructor(){instance=this;}start(){}stop(){this.onend?.();}}Local.prototype.processLocally=false;
 Local.available=async()=> 'downloadable';let d=new LocalDictation({Recognition:Local,permissions:null});assert.equal((await d.probe()).state,'downloadable');
 Local.available=async()=> 'available';d=new LocalDictation({Recognition:Local,permissions:{query:async()=>({state:'denied'})}});assert.equal((await d.probe()).state,'blocked');
 const messages=[],texts=[],interim=[];d=new LocalDictation({Recognition:Local,permissions:null,onStatus:x=>messages.push(x),onText:x=>texts.push(x),onInterim:x=>interim.push(x)});await d.start();instance.onstart();
 instance.onresult({resultIndex:0,results:[Object.assign([{transcript:'Draft words'}],{isFinal:false})]});assert.deepEqual(interim,['Draft words']);
 instance.onresult({resultIndex:0,results:[Object.assign([{transcript:'Saved words'}],{isFinal:true})]});assert.deepEqual(texts,['Saved words']);
 instance.onerror({error:'not-allowed'});assert.match(messages.at(-1),/Microphone access is blocked/);assert.deepEqual(texts,['Saved words']);d.stop();
});

test('diagram pointer drag commits once, while cancellation and a tap do not grade',async()=>{
 const w=workspace(),commits=[];w.clearDrag=()=>{};w.labelTarget=async(...args)=>commits.push(args.slice(1));
 const target={disabled:false,dataset:{labelTarget:'location'},closest(){return this;}};
 const button={style:{},dataset:{dragLabel:'concept'},hasPointerCapture:()=>true,releasePointerCapture:()=>{}};
 const prior=globalThis.document;globalThis.document={elementFromPoint:()=>target};
 try{
  const s={root:{contains:n=>n===target},labelDrag:{button,id:1,moved:true}};
  await w.labelPointerUp(s,{pointerId:1,clientX:30,clientY:40});
  await w.labelPointerUp(s,{pointerId:1,clientX:30,clientY:40});assert.deepEqual(commits,[['location','concept']]);
  s.labelDrag={button,id:2,moved:true};await w.labelPointerUp(s,{pointerId:2},true);assert.equal(commits.length,1);
  s.labelDrag={button,id:3,moved:false};await w.labelPointerUp(s,{pointerId:3});assert.equal(commits.length,1);
  target.disabled=true;s.labelDrag={button,id:4,moved:true};await w.labelPointerUp(s,{pointerId:4});assert.equal(commits.length,1);
 }finally{globalThis.document=prior;}
});

test('new and moved assessments update cached Study context and unit linking preserves other tests',async()=>{
 const w=workspace(),s=state();s.classId='class';s.assessment='new-test';s.store.units=[{id:'unit',row_version:2}];s.store.assessments=[{id:'moved',class_id:'class'}];s.store.links=[{unit_id:'unit',assessment_id:'other-test'}];
 w.portal.raw=new Map([['assessments:new-test',{id:'new-test',class_id:'class'}],['assessments:moved',{id:'moved',class_id:'elsewhere'}]]);w.syncAssessments(s);assert.deepEqual(s.store.assessments.map(a=>a.id),['new-test']);
 let request;w.mutate=async(_s,name,args,confirmed)=>{request={name,args};confirmed({unit:{id:'unit',row_version:3},links:args.p_assessment_ids.map(id=>({unit_id:'unit',assessment_id:id}))});};
 await w.linkAssessmentUnit(s,'unit',true);assert.equal(request.name,'set_unit_assessments');assert.deepEqual(request.args.p_assessment_ids,['other-test','new-test']);assert.equal(s.store.units[0].row_version,3);assert.equal(s.store.links.length,2);
 await w.linkAssessmentUnit(s,'unit',false);assert.deepEqual(request.args.p_assessment_ids,['other-test']);
});
test('recommended reviews stay short without discarding the rest of the backlog',()=>{
 const cards=Array.from({length:125},(_,i)=>({id:String(i),unit_id:'unit',next_review:'2026-10-01'}));const rec=recommendStudy(cards,[],[],'2026-10-21');assert.equal(rec.cards.length,24);assert.equal(rec.minutes,12);assert.equal(rec.due,125);assert.equal(cards.length,125);
});

test('starting a different method or model saves the current draft without a switch prompt',async()=>{
 const w=workspace(),s=state(),calls=[];s.classId='class';s.unit='unit';s.method='quiz_choice';s.root={querySelector:()=>null};
 s.session.session={...s.session.session,method:'blurting',row_version:2,reflection_text:'Earlier draft'};
 s.drafts.set('reflection-s',{reflection:'New words to preserve'});
 w.mutate=async(_s,name,args,onSaved)=>{calls.push({name,args});if(name==='save_study_reflection')onSaved({...s.session,session:{...s.session.session,reflection_text:args.p_text,row_version:3}});else onSaved({session:{id:'next',status:'active',method:'quiz_choice'}});};
 await w.start(s,'practice');assert.deepEqual(calls.map(c=>c.name),['save_study_reflection','start_study_experience']);assert.equal(calls[0].args.p_text,'New words to preserve');assert.equal(calls[0].args.p_reveal,false);assert.equal(calls[1].args.p_replace_active,true);assert.equal(s.session.session.id,'next');assert.equal(s.drafts.size,0);
 await w.startDiagram(s,'diagram');assert.equal(calls.at(-1).name,'start_model_experience');assert.equal(calls.at(-1).args.p_replace_active,true);
});
test('a failed draft save keeps the current session and text and prevents switching',async()=>{
 const w=workspace(),s=state(),calls=[];s.root={querySelector:()=>null};s.session.session={...s.session.session,method:'feynman',row_version:2,reflection_text:''};s.method='learn';s.drafts.set('reflection-s',{reflection:'Keep this explanation'});
 w.mutate=async(_s,name,args)=>{calls.push(name);s.pending={name,args};};
 await w.start(s,'practice');assert.deepEqual(calls,['save_study_reflection']);assert.equal(s.session.session.id,'s');assert.equal(s.drafts.get('reflection-s').reflection,'Keep this explanation');
 await w.startDiagram(s,'diagram');assert.deepEqual(calls,['save_study_reflection']);
});
test('switching with saved answers does not submit another grade or change review history',async()=>{
 const w=workspace(),s=state(),calls=[];s.root={querySelector:()=>null};s.method='learn';s.session.items[0].answered_at='now';s.session.items[0].rating='missed';
 w.mutate=async(_s,name,args,onSaved)=>{calls.push(name);onSaved({session:{id:'new',status:'active',method:'learn'}});};
 const old=s.session;await w.start(s,'practice');assert.deepEqual(calls,['start_study_experience']);assert.equal(old.items[0].rating,'missed');assert.equal(old.cards[0].box,3);
});
