const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,text,extra='')=>`<button type="button" class="btn secondary" data-source-action="${action}" ${extra}>${text}</button>`;
const field=(label,name,value='',tag='input')=>`<label>${label}${tag==='textarea'?`<textarea name="${name}" maxlength="2000">${esc(value)}</textarea>`:`<input name="${name}" value="${esc(value)}" maxlength="160">`}</label>`;

// All extraction happens in a bounded local worker. A future provider supplies
// the same sections/items contract; approval and canonical concept storage stay here.
export function extractSource(file,config,{signal}={}){
 if(/^image\//.test(file.type))return Promise.resolve({method:'manual_v1',sections:[],items:[],note:'This is an image. Create a Model by placing labels, or add concepts yourself. Image understanding and OCR are not enabled.'});
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(config.sourceWorkerUrl,location.href),{type:'module'});
  const stop=(error,result)=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',cancel);error?reject(error):resolve(result);};
  const cancel=()=>stop(new Error('Preparation stopped. Your original file is still saved.'));
  const timer=setTimeout(()=>stop(new Error('Preparation took too long. Use a smaller file, or add concepts manually.')),30000);
  signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=({data})=>{if(data?.type==='source-result')stop(data.ok?null:new Error(data.error||'Text could not be read. Try again or add concepts manually.'),data.extraction);};
  worker.onerror=()=>stop(new Error('Text extraction is unavailable in this browser. You can add concepts manually.'));
  file.arrayBuffer().then(bytes=>{if(signal?.aborted)return cancel();worker.postMessage({bytes,name:file.name,pdfWorkerUrl:new URL(config.pdfWorkerUrl,location.href).href},[bytes]);}).catch(stop);
 });
}
export class SourcesWorkspace{
 constructor({portal,config,onChange=()=>{},isActive=()=>true}){Object.assign(this,{portal,config,onChange,isActive});this.queue=[];this.drafts=new Map();this.manualDrafts=new Map();}
 get unsaved(){return !!(this.busy||this.pending||this.newUnitRequest||this.dialog?.querySelector('[data-dirty]')||this.drafts.size||[...this.manualDrafts.values()].some(v=>v.term||v.answer));}
 dispose(){this.disposed=true;this.controller?.abort();this.dialog?.remove();this.guideDialog?.remove();this.queue=[];}
 async guide(assessmentId){
  if(!this.isActive()||this.disposed)return;
  const assessment=this.portal.data.assessments.find(a=>a.id===assessmentId);if(!assessment)return;
  this.guideDialog?.remove();const d=document.createElement('dialog');this.guideDialog=d;d.className='source-dialog';d.setAttribute('aria-label','Study guide sources');
  d.innerHTML='<p role="status">Loading study guide sources…</p><form method="dialog"><button class="btn secondary">Close</button></form>';document.body.append(d);d.showModal();
  try{
   const rows=await this.portal.result(this.portal.client.from('study_sources').select('id,filename,material_id,study_source_items(review_card_id,review_cards(id,last_rating,next_review,archived_at))').eq('student_id',this.portal.studentId).eq('assessment_id',assessmentId).order('created_at').limit(200));
   if(!this.isActive()||this.disposed||!d.isConnected)return;
   const cards=[...new Map(rows.flatMap(s=>s.study_source_items.map(i=>i.review_cards).filter(c=>c&&!c.archived_at)).map(c=>[c.id,c])).values()];
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   d.innerHTML=`<h2>${esc(assessment.name)}</h2><h3>Study guide sources</h3>${rows.length?`<ul>${rows.map(s=>`<li><button type="button" class="btn secondary" data-guide-source="${s.material_id}">${esc(s.filename)}</button></li>`).join('')}</ul>`:'<p>Add a study guide, worksheet or slides in Classes → Files &amp; links. Choose this assessment when preparing the source.</p>'}<p>${cards.length} approved concepts · ${cards.filter(c=>['missed','partly'].includes(c.last_rating)).length} weak · ${cards.filter(c=>c.next_review<=today).length} due</p>${cards.length?`<button type="button" class="btn" data-start-study="${assessment.classId}" data-study-assessment="${assessmentId}" data-study-focus="practice" data-study-method="flashcard" data-study-cards="${esc(JSON.stringify(cards.map(c=>c.id).slice(0,100)))}">Start studying</button>`:''}<form method="dialog"><button class="btn secondary">Close</button></form>`;
   d.onclick=async e=>{if(e.target.closest('[data-start-study]')){d.close();return;}const b=e.target.closest('[data-guide-source]');if(!b)return;b.disabled=true;try{const m=await this.portal.result(this.portal.query('study_materials').eq('id',b.dataset.guideSource).single());if(!this.isActive()||this.disposed)return;this.portal.ingest('study_materials',[m]);d.close();await this.open(this.portal.data.materials.find(x=>x.id===m.id));}catch{b.disabled=false;b.textContent='Could not open source — retry';}};
  }catch(e){if(d.isConnected)d.querySelector('[role=status]').textContent=e.message;}
 }
 async open(material){
  if(this.disposed||!this.isActive())return;
  if(this.dialog?.open){if(this.material.id!==material.id)this.queue.push(material);return;}
  this.dialog?.remove();this.material=material;this.contextClassId=material.classId||this.portal.data.classes[0]?.id;this.file=null;this.extraction=null;this.extractionError='';this.newUnitRequest=null;this.createdUnitId=null;this.manualDraft=this.manualDrafts.get(material.id)||null;this.source=null;this.items=[];this.models=[];this.message='Loading source…';
  const d=document.createElement('dialog');d.className='source-dialog';d.setAttribute('aria-labelledby','source-title');this.dialog=d;document.body.append(d);
  d.onclick=e=>this.click(e);d.onsubmit=e=>{e.preventDefault();e.stopPropagation();if(e.target.matches('[data-source-context]'))this.prepare(e.target);if(e.target.matches('[data-source-manual]'))this.review([{...Object.fromEntries(new FormData(e.target)),status:'approved'}]);};
  d.onchange=e=>{if(e.target.name==='classId'){this.contextClassId=e.target.value;this.createdUnitId=null;this.render();}};
  d.oninput=e=>{if(e.target.closest('[data-source-item],[data-source-manual]'))e.target.closest('form').dataset.dirty='true';};
  d.oncancel=e=>{if(this.busy||this.pending||this.newUnitRequest)e.preventDefault();};d.onclose=()=>{this.capture();if(this.queue.length&&!this.disposed)this.open(this.queue.shift());};
  this.render();d.showModal();
  try{
   const [file,units,sources]=await Promise.all([
    this.portal.result(this.portal.client.from('files').select('id,storage_path,original_name,mime_type').eq('id',material.fileId).eq('state','ready').is('archived_at',null).single()),
    this.portal.result(this.portal.client.from('study_units').select('*').eq('student_id',this.portal.studentId).is('archived_at',null).order('name').limit(200)),
    this.portal.result(this.portal.client.from('study_sources').select('*').eq('material_id',material.id).eq('file_id',material.fileId).order('created_at',{ascending:false}).limit(20))
   ]);
   if(!this.active(d))return;this.file=file;this.units=units.filter(u=>!material.classId||u.class_id===material.classId);
   this.source=sources[0]||null;this.message='';if(this.source)await this.loadItems();else this.render();
  }catch(e){if(this.active(d)){this.message=e.message;this.render();}}
 }
 active(dialog=this.dialog){return !this.disposed&&this.isActive()&&dialog===this.dialog;}
 capture(){const manual=this.dialog?.querySelector('[data-source-manual]');if(manual){this.manualDraft=Object.fromEntries(new FormData(manual));this.manualDrafts.set(this.material.id,this.manualDraft);}if(!this.source)return;for(const row of this.dialog.querySelectorAll('[data-source-item][data-dirty]'))this.drafts.set(row.dataset.sourceItem,Object.fromEntries(new FormData(row)));}
 async loadItems(){
  const dialog=this.dialog,source=this.source;const items=await this.portal.result(this.portal.client.from('study_source_items').select('*').eq('source_id',source.id).order('created_at').order('id').limit(1000));
  if(!this.active(dialog)||this.source?.id!==source.id)return;this.items=items;
  const ids=this.items.map(i=>i.review_card_id).filter(Boolean);
  const cards=ids.length?await this.portal.result(this.portal.client.from('review_cards').select('id,last_rating,next_review,archived_at').in('id',ids)):[];
  const models=await this.portal.result(this.portal.client.from('study_diagrams').select('id,title,unit_id').eq('file_id',source.file_id).eq('unit_id',source.unit_id).is('archived_at',null).limit(100));
  if(this.active(dialog)&&this.source?.id===source.id){this.cards=cards;this.models=models;this.render();}
 }
 render(){
  if(!this.active())return;
  const s=this.source,canEdit=this.portal.canEdit!==false,contextUnits=(this.units||[]).filter(u=>u.class_id===this.contextClassId);
  const context=`<form data-source-context class="portal-form"><p>Choose where this material belongs.</p>${this.material.classId?'':`<label>Class<select name="classId">${this.portal.data.classes.map(c=>`<option value="${esc(c.id)}"${c.id===this.contextClassId?' selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`}<label>Unit<select name="unitId"><option value="">Create a new unit below</option>${contextUnits.map(u=>`<option value="${esc(u.id)}"${contextUnits.length===1?' selected':''}>${esc(u.name)}</option>`).join('')}</select></label>${field('New unit name (if needed)','newUnit')}<label>Assessment (optional)<select name="assessmentId"><option value="">No assessment</option>${(this.portal.data.assessments||[]).filter(a=>!this.material.classId||a.classId===this.material.classId).map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label><button class="btn" type="submit">Prepare study material</button>${this.extractionError?button('manual','Add concepts manually'):""}</form>`;
  const approved=this.items.filter(i=>i.status==='approved'),remaining=this.items.filter(i=>i.status==='proposed');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const cards=[...new Map((this.cards||[]).filter(c=>!c.archived_at).map(c=>[c.id,c])).values()],weak=cards.filter(c=>['missed','partly'].includes(c.last_rating)).length,due=cards.filter(c=>c.next_review&&c.next_review<=day).length;
  const start=s&&cards.length?`<button type="button" class="btn" data-start-study="${s.class_id}" data-study-unit="${s.unit_id}" data-study-focus="practice" data-study-method="flashcard" data-study-cards="${esc(JSON.stringify(cards.map(c=>c.id).slice(0,100)))}">Start studying</button>`:'';
  const model=s&&/^image\//.test(this.file?.mime_type||'')&&canEdit?`<button type="button" class="btn" data-start-study="${s.class_id}" data-study-unit="${s.unit_id}" data-study-method="diagram" data-study-hub data-source-model="${s.file_id}" data-source-title="${esc(s.filename)}">Create Model from this image</button>`:'';
  const review=s?`<p class="muted">${esc(this.units?.find(u=>u.id===s.unit_id)?.name||'Unit')} · ${esc(s.filename)} · Added ${esc(s.created_at?.slice(0,10))}</p><p>${esc(s.extraction_note)}</p><p><strong>${approved.length} approved</strong> · ${weak} weak · ${due} due</p><div class="study-actions">${start}${model}${button('download','View original source')}</div>${this.models.length?`<section><h3>Models from this source</h3>${this.models.map(m=>`<p>${esc(m.title)}</p>`).join('')}<button type="button" class="btn secondary" data-start-study="${s.class_id}" data-study-unit="${s.unit_id}" data-study-method="diagram" data-study-hub>Open Models</button></section>`:''}<h3>Study items found</h3>${remaining.length?`<p>Review the wording. Nothing enters Study until you approve it.</p><div class="study-actions">${button('select-all','Select all')}${button('approve-selected','Approve selected')}</div>`:'<p>No suggestions waiting. Add a missing concept below, or return to your approved items.</p>'}<div class="source-proposals">${remaining.map(i=>{const v=this.drafts.get(i.id)||i;return `<form class="portal-form source-proposal" data-source-item="${i.id}"${this.drafts.has(i.id)?' data-dirty="true"':''}><label class="source-select"><input type="checkbox" name="selected"${v.selected?' checked':''}> Select this item</label>${field('Term / question','term',v.term)}${field('Proposed answer','answer',v.answer,'textarea')}<p class="muted">Source: ${esc(s.filename)} · ${esc(i.locator)}</p><details><summary>Source excerpt</summary><p>${esc(i.excerpt)}</p></details><div class="study-actions">${button('approve','Approve')}${button('draft','Save edits')}${button('reject','Reject')}</div></form>`;}).join('')}</div>${canEdit?`<details class="form-panel"${this.manualDraft?.term||this.manualDraft?.answer?' open':''}><summary>Add a missing concept</summary><form class="portal-form" data-source-manual>${field('Term / question','term',this.manualDraft?.term)}${field('Answer','answer',this.manualDraft?.answer,'textarea')}${field('Page, slide or source reference (optional)','locator',this.manualDraft?.locator)}<button type="submit" class="btn">Approve and add to Study</button></form></details>`:''}<details class="form-panel"><summary>Approved &amp; rejected items</summary>${this.items.filter(i=>i.status!=='proposed').map(i=>`<article class="item"><strong>${esc(i.term)}</strong><p>${esc(i.answer)}</p><p>${i.status==='approved'?'Approved — in your study concepts':'Rejected — not added to Study'}</p></article>`).join('')}</details><details class="form-panel"><summary>Extracted source text</summary>${s.sections.map(x=>`<section><h4>${esc(x.locator)}</h4><pre>${esc(x.text)}</pre></section>`).join('')||'<p>No text was extracted.</p>'}</details>`:'';
  this.dialog.innerHTML=`<header class="record-head"><h2 id="source-title">${esc(this.material.title)}</h2>${button('close','Close')}</header><p role="status" data-source-status>${esc(this.message)}</p>${this.file?(s?review:canEdit?context:'<p>No study material has been prepared for this source yet.</p>'):'<p>Your source is loading.</p>'}${this.pending?button('retry','Retry save'):''}`;
  if(this.busy||this.pending)this.dialog.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=n.dataset.sourceAction!=='retry'||this.busy);
  if(!canEdit)this.dialog.querySelectorAll('[data-source-item] button,[data-source-item] input,[data-source-item] textarea,[data-source-action="select-all"],[data-source-action="approve-selected"]').forEach(n=>n.disabled=true);
 }
 async prepare(form){
  if(this.busy||this.pending||!this.active())return;const values=this.newUnitRequest?this.unitContext:Object.fromEntries(new FormData(form)),dialog=this.dialog;this.busy=true;this.message='Preparing your study material…';this.status();
  try{
   let unitId=values.unitId||this.createdUnitId;
   if(!unitId){if(!values.newUnit.trim())throw new Error('Choose a unit or give your new unit a name.');this.unitContext=values;this.newUnitRequest??={p_table:'study_units',p_student_id:this.portal.studentId,p_record_id:crypto.randomUUID(),p_values:{class_id:this.material.classId||values.classId,name:values.newUnit.trim()},p_expected_version:null,p_request_key:crypto.randomUUID()};const r=await this.portal.rpc('save_record',this.newUnitRequest);unitId=r.record.id;this.createdUnitId=unitId;this.newUnitRequest=null;this.units.push(r.record);form.elements.unitId.add(new Option(r.record.name,unitId,true,true));form.elements.newUnit.value='';}
   if(!this.active(dialog))return;
   if(!this.extraction){
    const {data,error}=await this.portal.client.storage.from('student-files').download(this.file.storage_path);if(error)throw new Error('Could not read this private source. Check your connection and retry.');
    this.controller=new AbortController();try{this.extraction=await extractSource(new File([data],this.file.original_name,{type:this.file.mime_type}),this.config,{signal:this.controller.signal});}
    catch(e){this.extractionError=e.message||'Text could not be read in this browser.';throw new Error(this.extractionError+' Your original source is saved. Retry preparation or add concepts manually.');}
   }
   if(!this.active(dialog))return;
   this.pending={name:'prepare_study_source',args:{p_material_id:this.material.id,p_file_id:this.file.id,p_unit_id:unitId,p_assessment_id:values.assessmentId||null,p_extraction:this.extraction,p_request_key:crypto.randomUUID()}};await this.savePending();
  }catch(e){if(this.active(dialog)){if(e.rejected)this.newUnitRequest=null;this.message=this.newUnitRequest?'The new unit save is unconfirmed. Retry to safely continue with the same unit.':e.message;this.status();}}
  finally{this.busy=false;if(this.active(dialog)){this.status();if(this.extractionError&&!this.source){const current=this.dialog.querySelector('[data-source-context]');if(current&&!current.querySelector('[data-source-action=manual]'))current.insertAdjacentHTML('beforeend',button('manual','Add concepts manually'));}}}
 }
 status(){const n=this.dialog?.querySelector('[data-source-status]');if(n)n.textContent=this.message;this.dialog?.querySelectorAll('button,input,textarea,select').forEach(n=>{const unitRetry=!!this.newUnitRequest&&n.matches('[data-source-context] button[type=submit]');n.disabled=!!this.busy||!!this.pending&&n.dataset.sourceAction!=='retry'||!!this.newUnitRequest&&!unitRetry;if(n.matches('[data-source-context] button[type=submit]'))n.textContent=unitRetry?'Retry unit save':'Prepare study material';});}
 async review(items){if(this.busy||this.pending||!this.active()||this.portal.canEdit===false)return;this.capture();this.pending={name:'review_source_items',args:{p_source_id:this.source.id,p_items:items,p_expected_version:this.source.row_version,p_request_key:crypto.randomUUID()}};await this.savePending();}
 async savePending(){
  if(!this.pending||!this.active())return;this.busy=true;this.message='Saving your review…';this.status();
  try{const r=await this.portal.rpc(this.pending.name,this.pending.args);if(!this.active())return;for(const i of this.pending.args.p_items||[]){this.drafts.delete(i.id);if(!i.id){this.manualDraft=null;this.manualDrafts.delete(this.material.id);}}this.pending=null;this.source=r.source;this.message='Saved ✓';await this.loadItems();await this.portal.refreshStudyOverview();await this.onChange(this.source.class_id);}
  catch(e){if(!this.active())return;this.message=e.message;if(e.rejected){this.pending=null;if(e.code==='P0409'){this.source=await this.portal.result(this.portal.client.from('study_sources').select('*').eq('id',this.source.id).single());this.message+=' Your edits are kept; review the latest source before retrying.';}}}
  finally{this.busy=false;if(this.active())this.render();}
 }
 async click(e){
  const start=e.target.closest('[data-start-study]');if(start){this.queue=[];this.dialog.close();return;}
  const b=e.target.closest('[data-source-action]');if(!b)return;e.preventDefault();e.stopPropagation();const action=b.dataset.sourceAction;
  if(action==='close'){if(!this.busy&&!this.pending&&!this.newUnitRequest)this.dialog.close();return;}
  if(action==='manual'){this.extraction={method:'manual_v1',sections:[],items:[],note:this.extractionError+' Original source saved. Concepts are added and reviewed by you.'};await this.prepare(this.dialog.querySelector('[data-source-context]'));return;}
  if(action==='retry'){if(!this.busy)await this.savePending();return;}
  if(action==='download'){const {data,error}=await this.portal.client.storage.from('student-files').createSignedUrl(this.file.storage_path,60,{download:this.file.original_name});if(error){this.message='Could not open the source. Try again.';this.status();return;}const a=document.createElement('a');a.href=data.signedUrl;a.download=this.file.original_name;a.rel='noopener';a.click();return;}
  if(this.busy||this.pending||this.portal.canEdit===false)return;
  if(action==='select-all'){this.dialog.querySelectorAll('[name=selected]').forEach(n=>n.checked=true);return;}
  const rows=action==='approve-selected'?[...this.dialog.querySelectorAll('[data-source-item]')].filter(f=>f.elements.selected.checked):[b.closest('[data-source-item]')];
  if(!rows.length){this.message='Select at least one suggestion.';this.status();return;}
  await this.review(rows.map(f=>({id:f.dataset.sourceItem,term:f.elements.term.value,answer:f.elements.answer.value,status:action==='reject'?'rejected':action==='draft'?'proposed':'approved'})));
 }
}
