import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAnswer,checkStudyItem} from '../src/study-checking.js';
import {StudyPreferences} from '../src/study-preferences.js';
import {StudyWorkspace} from '../src/study.js';
test('instant checking respects aliases, strict wording, keyword coverage and safe fallbacks',()=>{
 const base={expected:'Stores DNA',aliases:['Genetic material'],keywords:['DNA','nucleus']};
 for(const [response,checking,rating] of [[' STORES   DNA! ','normal','knew'],['genetic material','normal','knew'],['stores DNA','strict','missed'],['Stores DNA','strict','knew'],['DNA in the nucleus','loose','knew'],['DNA only','loose','partly'],['unknown','normal','missed']])assert.equal(checkAnswer({...base,response,checking}),rating);
 assert.equal(checkAnswer({expected:'célula',response:'CÉLULA.'}),'knew');
 assert.equal(checkAnswer({expected:'İstanbul',response:'istanbul'}),null);
 assert.equal(checkAnswer({expected:'Stores DNA — original',response:'Stores DNA — original'}),'knew');
 assert.equal(checkStudyItem({term:'Cell',answer:'wrong',accepted_answers:['wrong']},{presentation:'label'},{checking_mode:'strict'},'cell'),'knew');
 assert.equal(checkStudyItem({answer:'A',required_keywords:['B']},{presentation:'choice'},{checking_mode:'loose'},'B'),'missed');
});
test('known study intent starts directly; an assessment without linked material asks for scope',async()=>{
 const w=new StudyWorkspace({portal:{}}),s={loaded:true,store:{links:[],cards:[{id:'c',unit_id:'u'}]},root:{querySelector:()=>null}};w.states.set('class',s);let starts=0,renders=0;
 w.start=async()=>{starts++;};w.render=()=>renders++;w.savePracticeDraft=async()=>true;
 await w.open('class',{unitId:'u',focus:'practice'});assert.equal(starts,1);
 await w.open('class',{unitId:'all',focus:'practice',method:'learn',assessmentId:'test'});assert.equal(starts,1);assert.equal(s.panel,'home');assert.equal(s.assessment,'test');assert.equal(renders,1);
 s.store.links.push({assessment_id:'test',unit_id:'u'});await w.open('class',{unitId:'all',focus:'practice',method:'learn',assessmentId:'test'});assert.equal(starts,2);
});
test('preferences are actor/workspace scoped, allowlisted and optional',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 const a=new StudyPreferences('student-a','workspace-a',storage),b=new StudyPreferences('guardian','workspace-a',storage),c=new StudyPreferences('student-a','workspace-b',storage);
 a.save('class-a',{method:'learn',quizFormat:'quiz_written',checking:'strict',unit:'unit-a',response:'private answer'});
 assert.equal(a.class('class-a').method,'learn');assert.equal(a.lastClass(),'class-a');assert.equal(b.lastClass(),'');assert.equal(c.lastClass(),'');assert.ok(![...data.values()].join().includes('private answer'));
 new StudyPreferences('actor','student',{getItem(){throw Error();},setItem(){throw Error();}}).save('class');
});
test('feedback appears before persistence, retry uses the same job, and only the server assigns state',async()=>{
 let rejectWrite,resolveWrite,calls=0,requestKey,overviewResolve;
 const card={id:'c',term:'Cell',answer:'Life',box:1,row_version:1},item={id:'i',review_card_id:'c',presentation:'written'};
 const w=new StudyWorkspace({portal:{refreshStudyOverview:()=>new Promise(r=>overviewResolve=r)},onChange(){},notify(){}});
 const s={root:{querySelector:()=>null},drafts:new Map(),store:{cards:[card],units:[],sync(){},mutate(_name,args){calls++;if(requestKey)assert.equal(args.p_request_key,requestKey);requestKey=args.p_request_key;return new Promise((resolve,reject)=>{resolveWrite=resolve;rejectWrite=reject;});}},session:{session:{id:'s',status:'active',method:'quiz_written'},cards:[card],items:[item]}};
 w.render=()=>{};w.lock=()=>{};w.status=()=>{};
 const pending=w.answer(s,null,'life',null,true);
 assert.equal(s.feedback.rating,'knew');assert.equal(s.feedback.after,null);assert.equal(s.busy,true);
 const html=w.sessionMarkup(s);assert.match(html,/✓ Correct/);assert.match(html,/Saving…/);assert.doesNotMatch(html,/Box 1 →/);assert.match(html,/continue-study" disabled/);
 rejectWrite(new Error('Connection interrupted'));await pending;assert.ok(s.pending);assert.equal(s.feedback.after,null);
 const retry=w.mutate(s);resolveWrite({ok:true,session:{id:'s',status:'completed',method:'quiz_written'},items:[{...item,answered_at:'now',rating:'missed'}],cards:[{...card,box:1,row_version:2,last_rating:'missed',next_review:'2026-11-13'}]});await retry;
 assert.equal(calls,2);assert.equal(s.pending,null);assert.equal(s.busy,false);assert.equal(s.feedback.rating,'missed');assert.equal(s.feedback.after.row_version,2);assert.match(w.sessionMarkup(s),/✕ Incorrect/);
 // A slow priorities refresh cannot block the confirmed answer or Next.
 assert.equal(typeof overviewResolve,'function');overviewResolve();
});
