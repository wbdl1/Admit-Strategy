import {normalizeRecord} from './portal-data.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const studyToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const studyStage=card=>['','Learning','Building confidence','Remembering','Nearly mastered','Mastered'][Number(card.box)||1];
export const studyDue=card=>!card.archived_at&&card.status!=='archived'&&card.box<5&&(!card.next_review||card.next_review<=studyToday());
const dateLabel=value=>value?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'No scheduled review';

// Two spreadsheet columns (TSV), CSV with quoted fields/newlines, or term | answer.
export function parseStudyPaste(text,format='auto'){
 const errors=[],items=[],seen=new Set();let duplicates=0;
 if(text.length>4000000)return {items,errors:['Paste is too large. Use up to 1000 rows at a time.'],duplicates};
 const delimiter=format==='tab'?'\t':format==='comma'?',':format==='pipe'?'|':text.includes('\t')?'\t':text.includes('|')?'|':',';
 let fields=[],field='',quoted=false,afterQuote=false,line=1,start=1;
 const rows=[];
 for(let i=0;i<=text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else if(c===undefined){errors.push(`Line ${start}: close the quoted field.`);}else{field+=c;if(c==='\n')line++;}continue;}
  if(c==='"'&&!field.trim()&&!afterQuote){field='';quoted=true;continue;}
  if(c===delimiter||c==='\n'||c===undefined){fields.push(field.trim());field='';afterQuote=false;if(c!==delimiter){if(fields.some(Boolean))rows.push({fields,line:start});fields=[];start=line+1;}if(c==='\n')line++;}
  else if(c!=='\r'){if(afterQuote&&c.trim()){errors.push(`Line ${start}: unexpected text after a quote.`);afterQuote=false;}field+=c;}
 }
 if(rows.length>1000)errors.push('Use up to 1000 rows per import. Nothing has been saved.');
 for(const row of rows){const [term,answer]=row.fields;
  if(row.fields.length!==2||!term||!answer){errors.push(`Line ${row.line}: use two columns with a term or question and an answer.`);continue;}
  if(term.length>160||answer.length>2000){errors.push(`Line ${row.line}: limit the term to 160 characters and the answer to 2000.`);continue;}
  const key=JSON.stringify([term.toLocaleLowerCase(),answer.toLocaleLowerCase()]);if(seen.has(key))duplicates++;seen.add(key);
  items.push({term,answer,prompt:''});
 }
 if(!rows.length)errors.push('Paste at least one term and answer.');
 return {items,errors,duplicates};
}

export class StudyStore {
 constructor(portal){this.studentId=portal.studentId;this.portal=portal;this.units=[];this.cards=[];}
 assertActive(){if(this.portal.studentId!==this.studentId)throw Object.assign(new Error("This workspace is closed."),{rejected:true});}
 async load(classId){
  this.assertActive();
  const all=async table=>{let last=null,rows=[];for(;;){let q=this.portal.client.from(table).select('*').eq('student_id',this.studentId).eq('class_id',classId).order('id').limit(200);if(last)q=q.gt('id',last);const page=await this.portal.result(q);rows.push(...page);if(page.length<200)return rows;last=page.at(-1).id;}};
  const [units,cards]=await Promise.all([all('study_units'),all('review_cards')]);this.assertActive();this.units=units;this.cards=cards;this.classId=classId;this.sync();
 }
 sync(){this.assertActive();const p=this.portal;p.data.reviewCards=p.data.reviewCards.filter(c=>c.classId!==this.classId);for(const c of this.cards){p.raw.set('review_cards:'+c.id,c);if(!c.archived_at)p.data.reviewCards.push(normalizeRecord('review_cards',c,p.data.classes));}}
 async mutate(name,args){this.assertActive();const result=await this.portal.rpc(name,args);this.assertActive();if(!result.ok||result.deleted)throw Object.assign(new Error('These items were deleted. Reload the unit to continue.'),{rejected:true});return result;}
}

export class StudyWorkspace {
 constructor({portal,patch,onChange,notify,isActive=()=>true}){this.portal=portal;this.isActive=isActive;this.patch=patch;this.onChange=onChange;this.notify=notify;this.states=new Map();this.disposed=false;}
 get unsaved(){return [...this.states.values()].filter(s=>s.pending||s.busy);}
 dispose(){this.disposed=true;this.states.clear();}
 mountAll(){for(const root of document.querySelectorAll('[data-study-workspace]')){
  const id=root.dataset.studyClass;if(!id)continue;
  let s=this.states.get(id);if(!s){s={classId:id,store:new StudyStore(this.portal),unit:'',filter:'active',page:1,mode:'queue',loaded:false,drafts:new Map()};this.states.set(id,s);}
  if(s.root===root)continue;s.root=root;
  root.addEventListener('click',e=>this.click(s,e));root.addEventListener('submit',e=>this.submit(s,e));
  root.addEventListener('input',e=>{const f=e.target.closest('[data-study-form]');if(f){f.dataset.dirty='true';s.drafts.set(f.id,Object.fromEntries(new FormData(f)));if(f.dataset.studyForm==='bulk'){s.preview=null;const p=f.querySelector('[data-paste-preview]');if(p)p.innerHTML='';}}});
  root.addEventListener('change',e=>{if(e.target.matches('[data-unit-select]')){s.unit=e.target.value;s.page=1;s.session=null;this.render(s);}if(e.target.matches('[data-item-filter]')){s.filter=e.target.value;s.page=1;this.render(s);}});
  root.addEventListener('cancel',e=>{if(s.busy||s.pending)e.preventDefault();},true);
  if(s.loaded)this.render(s);else this.load(s);
 }}
 async load(s){if(s.loading)return;s.loading=true;s.message='Refreshing items…';this.render(s);try{await s.store.load(s.classId);if(this.disposed)return;s.loaded=true;s.error='';s.message='';s.recovery=false;}catch(e){s.error=e.message;s.message=e.message;s.recovery=true;}finally{if(!this.disposed){s.loading=false;this.render(s);}}}
 unit(s){return s.store.units.find(u=>u.id===s.unit);}
 cards(s){return s.store.cards.filter(c=>s.unit==='all'||(s.unit==='unfiled'?!c.unit_id:c.unit_id===s.unit));}
 button(action,label,attrs=''){return `<button type="button" class="btn secondary" data-study-action="${action}" ${attrs}>${label}</button>`;}
 render(s){if(this.disposed||!s.root?.isConnected)return;
  const y=window.scrollY,x=window.scrollX;
  if(!s.loaded){this.patch(s.root,`<div class="card"><h3>Units &amp; study</h3><p role="status">${esc(s.error||'Loading your units and items…')}</p>${s.error?this.button('reload','Retry'):''}</div>`);return;}
  if(!s.unit)s.unit=s.store.units.find(u=>!u.archived_at)?.id||'all';
  const unit=this.unit(s),units=s.store.units,cards=this.cards(s),due=cards.filter(studyDue),readOnly=this.portal.canEdit===false;
  const unitOptions=`<option value="all">All units</option><option value="unfiled">Unfiled items</option>`+units.map(u=>`<option value="${u.id}">${esc(u.name)}${u.archived_at?' (archived)':''}</option>`).join('');
  const rows=cards.filter(c=>s.filter==='archived'?!!c.archived_at:s.filter==='due'?studyDue(c):!c.archived_at).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(rows.length/40));s.page=Math.min(s.page,pages);const page=rows.slice((s.page-1)*40,s.page*40);
  const row=c=>`<article class="study-item" id="study-item-${c.id}"><div><strong>${esc(c.term)}</strong><p class="muted">${esc(c.archived_at?'Archived':studyStage(c)+' · '+(studyDue(c)?'Ready to study':c.next_review?'Next review '+dateLabel(c.next_review):'No review due'))}</p></div><div class="study-actions">${this.button('edit-item','Edit',`data-id="${c.id}"`)}${this.button(c.archived_at?'restore-item':'archive-item',c.archived_at?'Restore':'Archive',`data-id="${c.id}"`)}${this.button('delete-item','Delete',`data-id="${c.id}"`)}</div></article>`;
  this.patch(s.root,`<div class="card study-workspace"><h3>Units &amp; study</h3><p class="muted">Organize vocabulary and questions, then recall the answers. Your next review is scheduled automatically.</p>${readOnly?'<p class="info-box">You can view these items. Only the student or an authorized coach can change them.</p>':''}<fieldset ${s.busy||s.pending||s.loading?'disabled':''}><div class="study-toolbar"><label>Unit or topic<select data-unit-select>${unitOptions}</select></label>${this.button('reload','Refresh items')}</div><details class="form-panel"><summary>Create a unit or topic</summary><form id="unit-create-${s.classId}" class="portal-form" data-study-form="unit"><label>Unit name<input name="name" required maxlength="160" placeholder="Cell structure"></label><button class="btn" type="submit">Create unit</button></form></details><div class="study-actions">${unit?this.button('edit-unit','Rename unit')+this.button(unit.archived_at?'restore-unit':'archive-unit',unit.archived_at?'Restore unit':'Archive unit')+this.button('delete-unit','Delete unit'):''}</div>${unit?.archived_at?'<p class="info-box">This unit is archived. Restore it to add items or study again. Review progress is kept.</p>':''}<div class="study-summary"><strong>${cards.filter(c=>!c.archived_at).length} items · ${due.length} ready to study</strong><div class="study-actions">${this.button('start','Study due items',due.length?'':'disabled')}${this.button('practice','Practice all',cards.some(c=>!c.archived_at)?'':'disabled')}</div></div>${s.session?this.sessionMarkup(s):''}${unit&&!unit.archived_at?`<details class="form-panel"><summary>Paste vocabulary or questions</summary><form id="bulk-${unit.id}" class="portal-form" data-study-form="bulk"><p>Paste two columns from a spreadsheet, or one <strong>term | answer</strong> per line. Up to 1000 items. Omit column headings.</p><label>Separator<select name="format"><option value="auto">Detect automatically</option><option value="tab">Tab (spreadsheet)</option><option value="comma">Comma (CSV)</option><option value="pipe">Pipe |</option></select></label><label>Vocabulary or questions<textarea name="paste" rows="8" maxlength="4000000" required placeholder="Mitochondria | Produces ATP&#10;Nucleus | Contains genetic material"></textarea></label><button type="submit" class="btn">Preview items</button><div data-paste-preview aria-live="polite"></div></form></details><details class="form-panel"><summary>Add one item</summary><form id="single-${unit.id}" class="portal-form" data-study-form="item"><label>Term or question<input name="term" required maxlength="160"></label><label>Answer<textarea name="answer" required maxlength="2000"></textarea></label><button class="btn" type="submit">Add item</button></form></details>`:`${!unit?'<p class="info-box">Choose or create a unit to add vocabulary and review questions.</p>':''}`}<div class="study-toolbar"><label>Show items<select data-item-filter><option value="active">Active items</option><option value="due">Ready to study</option><option value="archived">Archived items</option></select></label><div class="view-toggle">${this.button('queue','Review queue')}${this.button('board','Board view')}</div></div><div class="${s.mode==='board'?'study-board':''}">${s.mode==='board'?[1,2,3,4,5].map(box=>`<section><h4>${studyStage({box})}</h4>${page.filter(c=>Number(c.box)===box).map(row).join('')}</section>`).join(''):page.map(row).join('')||'<p class="empty">No items here yet.</p>'}</div><div class="study-actions">${this.button('previous','Previous',s.page>1?'':'disabled')}<span>Page ${s.page} of ${pages} · ${rows.length} items</span>${this.button('next','Next',s.page<pages?'':'disabled')}</div></fieldset><p data-study-status role="status" aria-live="polite">${esc(s.message||'')}</p><div data-study-recovery>${s.recovery?this.button(s.pending?'retry':'reload',s.pending?'Retry same save':'Refresh items'):''}</div><dialog class="study-dialog" aria-label="Manage study item"></dialog></div>`);
  s.root.querySelector('[data-unit-select]').value=s.unit;s.root.querySelector('[data-item-filter]').value=s.filter;
  if(readOnly)s.root.querySelectorAll('form button,[data-study-action]:not([data-study-action="reload"]):not([data-study-action="queue"]):not([data-study-action="board"]):not([data-study-action="previous"]):not([data-study-action="next"])').forEach(b=>b.disabled=true);
  for(const form of s.root.querySelectorAll('[data-study-form]')){const draft=s.drafts?.get(form.id);if(draft){for(const [name,value] of Object.entries(draft))if(form.elements[name])form.elements[name].value=value;form.dataset.dirty='true';form.closest('details').open=true;}}
  const bulk=s.root.querySelector('[data-study-form=bulk]');if(s.preview&&bulk)this.preview(s,bulk);
  window.scrollTo(x,y);
 }
 sessionMarkup(s){const session=s.session,c=s.store.cards.find(c=>c.id===session.ids[session.index]);
  if(!c)return `<section class="study-session" aria-label="Study session"><h4>Session complete</h4><p>${session.correct} correct · ${session.incorrect} to keep practicing.</p><p>${esc(session.feedback||'Your reviews are saved.')}</p>${this.button('end','Close session')}</section>`;
  return `<section class="study-session" aria-label="Study session"><div class="study-actions"><strong>Item ${session.index+1} of ${session.ids.length}</strong>${this.button('end','End session')}</div><p role="status">${esc(session.feedback||'Think of your answer before revealing it.')}</p><h4 tabindex="-1" data-study-question>${esc(c.prompt||c.term)}</h4>${session.revealed?`<div class="study-answer"><span class="muted">Answer</span><p>${esc(c.answer||'No answer saved. Edit this item before reviewing.')}</p></div><div class="study-actions">${this.button('incorrect','Incorrect')}${this.button('correct','Correct',c.answer?'':'disabled')}</div>`:this.button('reveal','Show answer')}</section>`;
 }
 preview(s,form){const result=parseStudyPaste(form.elements.paste.value,form.elements.format.value);s.preview=result;
  form.querySelector('[data-paste-preview]').innerHTML=result.errors.length?`<p role="alert">Nothing saved. Fix these rows first:</p><ul>${result.errors.slice(0,20).map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:`<p><strong>${result.items.length} items ready</strong>. ${result.duplicates?`${result.duplicates} repeated rows will also be added. `:''}Check the first ${Math.min(5,result.items.length)} below. Existing items are kept.</p><dl>${result.items.slice(0,5).map(c=>`<dt>${esc(c.term)}</dt><dd>${esc(c.answer)}</dd>`).join('')}</dl>${this.button('import',`Add ${result.items.length} items`)}`;
 }
 async submit(s,event){const form=event.target.closest('[data-study-form]');if(!form)return;event.preventDefault();event.stopPropagation();if(s.busy||s.pending||s.loading||!form.reportValidity())return;
  const v=Object.fromEntries(new FormData(form));
  if(form.dataset.studyForm==='bulk'){this.preview(s,form);return;}
  if(form.dataset.studyForm==='unit'){const id=crypto.randomUUID();await this.mutate(s,'save_record',{p_table:'study_units',p_student_id:this.portal.studentId,p_record_id:id,p_values:{class_id:s.classId,name:v.name.trim()},p_expected_version:null},()=>{s.unit=id;form.reset();delete form.dataset.dirty;s.drafts.delete(form.id);},'Unit created. Add your items below.');}
  if(form.dataset.studyForm==='item')await this.mutate(s,'import_study_items',{p_unit_id:s.unit,p_items:[{term:v.term.trim(),answer:v.answer.trim()}]},()=>{form.reset();delete form.dataset.dirty;s.drafts.delete(form.id);},'Item added.');
 }
 async mutate(s,name,args,onSaved,message){
  if(s.busy||this.disposed)return;
  const job=s.pending||{name,args:{...args,p_request_key:crypto.randomUUID()},onSaved,message};s.pending=job;s.busy=true;s.message='Saving…';this.lock(s,true);this.status(s,'Saving…');
  try{if(!this.isActive())throw new Error('Sign in with the same account to finish saving.');const result=await s.store.mutate(job.name,job.args);if(this.disposed)return;if(!this.isActive())throw new Error('Sign in with the same account to confirm saving.');
   // Apply the confirmed result before the refresh, so a failed read never invites a duplicate write.
   if(result.record){const list=job.args.p_table==='study_units'?s.store.units:s.store.cards;const i=list.findIndex(r=>r.id===result.record.id);if(i<0)list.push(result.record);else list[i]=result.record;}
   if(job.name==='manage_study_record'){
    const {p_table,p_record_id,p_action}=job.args;
    if(p_action==='delete'){const ids=new Set(result.deleted_cards||[]);s.store.cards=s.store.cards.filter(c=>!ids.has(c.id));if(p_table==='study_units')s.store.units=s.store.units.filter(u=>u.id!==p_record_id);}
    else if(p_table==='study_units'){for(const c of s.store.cards.filter(c=>c.unit_id===p_record_id)){if(p_action==='archive'&&!c.archived_at){c.archived_at=result.record.archived_at;c.archived_with_unit=true;}else if(p_action==='restore'&&c.archived_with_unit){c.archived_at=null;c.archived_with_unit=false;}}}
   }
   if(result.records)s.store.cards.push(...result.records.filter(c=>!s.store.cards.some(r=>r.id===c.id)));
   s.pending=null;s.recovery=false;job.onSaved?.(result);s.message=job.message||'Saved ✓';
   if(job.args.p_table==='study_units'&&job.name!=='save_record'||job.args.p_table==='study_units'&&job.args.p_expected_version!==null){try{await s.store.load(s.classId);}catch{ s.message+=' Saved, but the list could not refresh. Use Refresh items.'; }}
   if(this.disposed)return;s.store.sync();this.onChange();this.notify('Saved ✓',true);
  }catch(error){if(this.disposed)return;s.message=error.message;s.recovery=true;
   if(error.rejected||error.code==='P0409'){s.pending=null;s.message+=' Your input is kept. Refresh items before trying again.';}
   this.status(s,s.message);
   const modalStatus=s.root.querySelector('dialog[open] [data-dialog-status]');if(modalStatus&&s.pending){const retry=document.createElement('button');retry.type='button';retry.className='btn secondary';retry.textContent='Retry same save';retry.onclick=()=>this.mutate(s);modalStatus.append(retry);}
   const recovery=s.root.querySelector('[data-study-recovery]');if(recovery)recovery.innerHTML=this.button(s.pending?'retry':'reload',s.pending?'Retry same save':'Refresh items');
   this.notify(s.message,false);
  }finally{if(!this.disposed){s.busy=false;this.lock(s,!!s.pending);if(!s.pending&&!s.root.querySelector('dialog[open]'))this.render(s);else this.status(s,s.message);}}
 }
 status(s,message){const node=s.root.querySelector('[data-study-status]');if(node)node.textContent=message;const dialog=s.root.querySelector('dialog[open] [data-dialog-status]');if(dialog){const retry=dialog.querySelector('button');dialog.textContent=message;if(retry)dialog.append(retry);}}
 lock(s,locked){s.root.querySelectorAll('fieldset').forEach(f=>f.disabled=locked);s.root.querySelectorAll('dialog button,dialog input,dialog textarea,dialog select').forEach(b=>b.disabled=locked);if(!s.busy&&s.pending)s.root.querySelector('dialog [data-dialog-status] button')?.removeAttribute('disabled');}
 async click(s,event){const b=event.target.closest('[data-study-action]');if(!b||b.disabled)return;const action=b.dataset.studyAction;event.stopPropagation();
  if(action==='retry'){await this.mutate(s);return;}if(s.busy||s.pending||s.loading)return;
  if(action==='reload'){await this.load(s);return;}
  if(action==='import'){if(!s.preview||s.preview.errors.length)return;const form=b.closest('form');await this.mutate(s,'import_study_items',{p_unit_id:s.unit,p_items:s.preview.items},()=>{form.reset();delete form.dataset.dirty;s.drafts.delete(form.id);s.preview=null;},'Items added. Ready to study.');return;}
  if(action==='queue'||action==='board')s.mode=action;
  if(action==='previous')s.page--;if(action==='next')s.page++;
  if(action==='start'||action==='practice'){const cards=this.cards(s).filter(action==='start'?studyDue:c=>!c.archived_at).sort((a,b)=>String(a.next_review||'9999').localeCompare(String(b.next_review||'9999'))||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));s.session={ids:cards.map(c=>c.id),index:0,correct:0,incorrect:0,revealed:false};}
  if(action==='end')s.session=null;
  if(action==='reveal')s.session.revealed=true;
  if(action==='correct'||action==='incorrect'){const session=s.session,c=s.store.cards.find(c=>c.id===session.ids[session.index]);if(!c||!session.revealed)return;await this.mutate(s,'answer_study_item',{p_card_id:c.id,p_correct:action==='correct',p_expected_version:c.row_version},result=>{session[action]++;session.index++;session.revealed=false;session.feedback=result.record.box===5?'Mastered — no scheduled review. You can still practice this item.':'Saved. Next review: '+dateLabel(result.record.next_review)+'.';},'Answer saved.');s.root.querySelector('[data-study-question]')?.focus({preventScroll:true});return;}
  if(/^(edit|archive|restore|delete)-(unit|item)$/.test(action)){this.dialog(s,action,b.dataset.id);return;}
  this.render(s);
 }
 dialog(s,action,id){const unit=action.endsWith('unit'),r=unit?this.unit(s):s.store.cards.find(c=>c.id===id);if(!r)return;const kind=action.split('-')[0],dialog=s.root.querySelector('dialog'),title=unit?r.name:r.term;
  const count=unit?s.store.cards.filter(c=>c.unit_id===r.id).length:1;
  dialog.innerHTML=`<form class="portal-form" id="study-edit-${r.id}"><h3>${esc(kind==='edit'?(unit?'Rename unit':'Edit item'):kind[0].toUpperCase()+kind.slice(1)+(unit?' unit':' item'))}</h3><p>${esc(title)}</p>${kind==='edit'?(unit?`<label>Unit name<input name="name" required maxlength="160" value="${esc(r.name)}"></label>`:`<label>Unit<select name="unit_id"><option value="">Unfiled items</option>${s.store.units.filter(u=>!u.archived_at||u.id===r.unit_id).map(u=>`<option value="${u.id}" ${r.unit_id===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><label>Term or question<input name="term" maxlength="160" required value="${esc(r.term)}"></label><label>Recall prompt (optional)<textarea name="prompt" maxlength="1200">${esc(r.prompt)}</textarea></label><label>Answer<textarea name="answer" required maxlength="2000">${esc(r.answer)}</textarea></label>`):`<p>${kind==='delete'?`Permanently delete ${unit?'this unit and all '+count+' items':'this item'}, including review history? This cannot be undone.`:kind==='archive'?`Hide ${unit?'this unit and its items':'this item'} from study and reminders. Your progress is kept. You can restore it later.`:'Restore saved items and their review progress. Items archived separately stay archived.'}</p>${kind==='delete'?'<label>Type DELETE to confirm<input name="confirmation" required pattern="DELETE" autocomplete="off"></label>':''}`}<p data-dialog-status role="status"></p><div class="study-actions"><button class="btn" type="submit">${kind==='edit'?'Save changes':kind==='delete'?'Delete permanently':kind==='archive'?'Archive':'Restore'}</button><button class="btn secondary" type="button" data-dialog-cancel>Cancel</button></div></form>`;
  dialog.querySelector('form').oninput=e=>{e.currentTarget.dataset.dirty='true';};
  dialog.querySelector('[data-dialog-cancel]').onclick=()=>{delete dialog.querySelector('form').dataset.dirty;dialog.close();};
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();e.stopPropagation();if(s.busy||s.pending||!e.target.reportValidity())return;const values=Object.fromEntries(new FormData(e.target));if(values.unit_id==='')values.unit_id=null;
   const args=kind==='edit'?{p_table:unit?'study_units':'review_cards',p_student_id:this.portal.studentId,p_record_id:r.id,p_values:values,p_expected_version:r.row_version}:{p_table:unit?'study_units':'review_cards',p_record_id:r.id,p_action:kind,p_expected_version:r.row_version};
   await this.mutate(s,kind==='edit'?'save_record':'manage_study_record',args,()=>{delete dialog.querySelector('form').dataset.dirty;dialog.close();if(unit&&kind==='delete')s.unit='all';s.session=null;},kind==='delete'?'Deleted.':kind==='archive'?'Archived. You can restore it here.':'Saved ✓');
  };dialog.addEventListener('close',()=>{if(!s.pending)delete dialog.querySelector('form').dataset.dirty;},{once:true});dialog.showModal();
 }
}
