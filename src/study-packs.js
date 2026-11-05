const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function packCode(value){
 const text=String(value||'').trim();if(/^[a-f0-9]{64}$/.test(text))return text;
 try{const url=new URL(text);if(url.origin!==location.origin)return null;const code=new URLSearchParams(url.hash.slice(1)).get('pack');return /^[a-f0-9]{64}$/.test(code||'')?code:null;}catch{return null;}
}
const countLabel=(n,label)=>`${n} ${label}${n===1?'':'s'}`;
export const packLink=code=>new URL('pack.html#pack='+code,location.href).href;
export function packPreviewMarkup(manifest){
 if(manifest?.schema_version!==1||!Array.isArray(manifest.targets)||manifest.targets.some(t=>t.kind!=='knowledge'))throw Error('This pack needs a newer version of Admit Strategy. Refresh and try again.');
 return `<header class="pack-preview-heading"><p class="section-kicker">Study Pack · independent copy</p><h2>${esc(manifest.title)}</h2><p>Created by ${esc(manifest.creator)}</p><p>${countLabel(manifest.targets.length,'concept')} · ${countLabel(manifest.units.length,'unit')} · ${countLabel(manifest.models.length,'Model')}</p>${manifest.source_credit?`<p>Source: ${esc(manifest.source_credit)}</p>`:''}</header>
 <div class="pack-material">${manifest.units.map(u=>`<details open><summary>${esc(u.name)} · ${countLabel(manifest.targets.filter(t=>t.unit_key===u.key).length,'concept')}</summary><dl>${manifest.targets.filter(t=>t.unit_key===u.key).map(t=>`<div><dt>${esc(t.title)}</dt><dd>${t.prompt?`<p>${esc(t.prompt)}</p>`:''}<p>${esc(t.answer)}</p>${t.accepted_answers?.length?`<p class="pack-answer-rule">Also accepted: ${t.accepted_answers.map(esc).join('; ')}</p>`:''}${t.required_keywords?.length?`<p class="pack-answer-rule">Key words: ${t.required_keywords.map(esc).join(', ')}</p>`:''}</dd></div>`).join('')}</dl></details>`).join('')}
 ${manifest.models.map(m=>`<section class="pack-model"><h3>${esc(m.title)}</h3><div class="pack-model-image" data-pack-image="${esc(m.key)}"><p>Loading image…</p></div><ol>${m.points.map(p=>`<li>${esc(manifest.targets.find(t=>t.key===p.target_key)?.title)}</li>`).join('')}</ol></section>`).join('')}</div>`;
}
export async function packAsset(client,body){
 const {data,error}=await client.functions.invoke('study-pack-assets',{body});
 if(error){let message;try{message=(await error.context.json()).error;}catch{}throw Error(message||'Could not finish the pack. Retry; your saved work is kept.');}return data;
}
export async function showPackImages(root,manifest,load,active=()=>true){
 const urls=[];for(const model of manifest.models){
  const host=root.querySelector(`[data-pack-image="${model.key}"]`);if(!host)continue;
  try{const blob=await load(model);if(!active())return urls;if(!(blob instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(model.mime_type))throw Error('Image unavailable');const url=URL.createObjectURL(new Blob([blob],{type:model.mime_type}));urls.push(url);const img=document.createElement('img');img.src=url;img.alt=model.title;host.replaceChildren(img);
   for(const [i,p] of model.points.entries()){const marker=document.createElement('span');marker.className='pack-image-marker';marker.style.left=p.x+'%';marker.style.top=p.y+'%';marker.textContent=String(i+1);host.append(marker);}
  }catch{if(active())host.textContent='Image could not load. Reopen this preview to retry.';}
 }return urls;
}
export class StudyPacks {
 constructor({portal,config,isActive=()=>true,onChange=async()=>{}}){this.portal=portal;this.config=config;this.isActive=isActive;this.onChange=onChange;this.urls=[];this.dialog=document.createElement('dialog');this.dialog.className='study-dialog pack-dialog';this.dialog.setAttribute('aria-label','Study Packs');document.body.append(this.dialog);this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});this.dialog.addEventListener('click',e=>this.click(e));this.dialog.addEventListener('submit',e=>this.submit(e));}
 get unsaved(){return !!this.busy||!!this.pending;}
 active(){return !this.disposed&&this.isActive();}
 dispose(){this.disposed=true;this.dialog.remove();this.urls.forEach(URL.revokeObjectURL);}
 show(html){if(!this.active())return;this.urls.forEach(URL.revokeObjectURL);this.urls=[];this.dialog.innerHTML=`<fieldset data-pack-controls ${this.busy?'disabled':''}><div class="pack-dialog-top"><h2>Study Packs</h2><button type="button" class="btn secondary" data-pack-action="close" aria-label="Close Study Packs">Close</button></div>${html}</fieldset><p data-pack-status role="status" aria-live="polite"></p>`;if(!this.dialog.open)this.dialog.showModal();this.dialog.querySelector('h2').tabIndex=-1;this.dialog.querySelector('h2').focus();}
 message(text){const n=this.dialog.querySelector('[data-pack-status]');if(n)n.textContent=text;}
 async run(fn){if(this.busy)return;this.busy=true;const controls=this.dialog.querySelector('[data-pack-controls]');if(controls)controls.disabled=true;try{await fn();}catch(e){if(this.active())this.message(e.message);}finally{this.busy=false;if(this.active()){const current=this.dialog.querySelector('[data-pack-controls]');if(current)current.disabled=false;}}}
 async open(store){this.store=store;this.pending=null;this.selection=null;await this.manager();}
 async manager(){this.show(`<p>Share selected learning material, or add a classmate’s pack. Your results and original files stay private.</p><div class="study-actions"><button class="btn" data-pack-action="select">Create Study Pack</button></div><form class="portal-form" data-pack-form="open"><label>Pack link or code<input name="code" required autocomplete="off" maxlength="400"></label><button class="btn secondary">Preview pack</button></form><h3>Your shared packs</h3><div data-my-packs><p>Loading…</p></div>`);
  const [packs,imports]=await Promise.all([this.portal.rpc('list_my_study_packs',{}),this.portal.result(this.portal.client.from('study_pack_imports').select('id,class_id,status').eq('status','preparing').order('created_at',{ascending:false}).limit(30))]);if(!this.active())return;this.dialog.querySelector('[data-my-packs]').innerHTML=(packs.map(p=>`<article class="pack-list-item"><h4>${esc(p.title)}</h4><p>${p.status==='published'?'Ready to share':p.status==='preparing'?'Image preparation unfinished':'Link revoked'}</p>${p.status!=='revoked'?`<div class="study-actions"><button class="btn secondary" data-pack-action="${p.status==='preparing'?'finish':'link'}" data-id="${p.id}" data-code="${p.code}">${p.status==='preparing'?'Finish preparing':'Copy link'}</button><button class="btn secondary" data-pack-action="revoke" data-id="${p.id}">Revoke link</button></div>`:''}</article>`).join('')||'<p>No shared packs yet. Create one from a unit.</p>')+imports.map(i=>`<article class="pack-list-item"><h4>Unfinished import · ${esc(this.portal.data.classes.find(c=>c.id===i.class_id)?.name||'Class')}</h4><button class="btn secondary" data-pack-action="resume-import" data-id="${i.id}">Finish adding material</button></article>`).join('');
 }
 async select(){
  const s=this.store;if(!s)throw Error('Choose a class in Classes first.');
  const diagrams=await this.portal.result(this.portal.client.from('study_diagrams').select('*').eq('class_id',s.classId).is('archived_at',null).order('id').limit(100));if(!this.active())return;this.models=diagrams;
  const draft=this.selection?.p_class_id===s.classId?this.selection:null;
  const units=s.units.filter(u=>!u.archived_at),cards=s.cards.filter(c=>!c.archived_at&&units.some(u=>u.id===c.unit_id));
  this.show(`<h3>Select material</h3><form class="portal-form" data-pack-form="select"><label>Pack title<input name="title" maxlength="160" required value="${esc(draft?.p_title||((s.portal.data.classes.find(c=>c.id===s.classId)?.name||'')+' study pack'))}"></label><label>Public creator name<input name="creator" maxlength="80" required value="${esc(draft?.p_creator||'')}" placeholder="First name or nickname"></label><label>Source credit <span>optional</span><input name="credit" maxlength="500" value="${esc(draft?.p_credit||'')}" placeholder="Your own notes or an authorized source"></label><p>Select up to 500 concepts and 5 Models. Include every concept labeled in a selected Model.</p>
   ${units.map(u=>`<details class="pack-unit-select" open><summary>${esc(u.name)}</summary><label class="pack-select-all"><input type="checkbox" data-pack-unit="${u.id}">Select this unit</label>${cards.filter(c=>c.unit_id===u.id).map(c=>`<label><input type="checkbox" name="card" value="${c.id}" data-unit="${u.id}" ${draft?.p_card_ids.includes(c.id)?'checked':''}>${esc(c.term)}</label>`).join('')}${diagrams.filter(d=>d.unit_id===u.id).map(d=>`<label><input type="checkbox" name="model" value="${d.id}" ${draft?.p_model_ids.includes(d.id)?'checked':''}>Model: ${esc(d.title)}</label>`).join('')}</details>`).join('')||'<p>Add concepts in this class before creating a pack.</p>'}<button class="btn" ${!cards.length?'disabled':''}>Preview exactly what will be shared</button></form>`);
  this.dialog.querySelectorAll('[data-pack-unit]').forEach(n=>n.onchange=()=>this.dialog.querySelectorAll(`[data-unit="${n.dataset.packUnit}"]`).forEach(c=>c.checked=n.checked));
 }
 async selectionPreview(data){
  this.pending=null;this.selection={p_class_id:this.store.classId,p_card_ids:data.getAll('card'),p_model_ids:data.getAll('model'),p_title:data.get('title'),p_creator:data.get('creator'),p_credit:data.get('credit')};
  const preview=await this.portal.rpc('preview_study_pack_selection',this.selection);if(!this.active())return;this.preview=preview;
  this.show(`${packPreviewMarkup(preview.manifest)}<p>Only the content above will be shared. Boxes, results, notes, assessments and original source files are excluded.</p><form class="portal-form" data-pack-form="publish"><label class="pack-rights"><input name="rights" type="checkbox" required>I created this material or have permission to share it, including the selected Model images.</label><button class="btn">Create share link</button><button type="button" class="btn secondary" data-pack-action="select">Change selection</button></form>`);
  const selected=this.models.filter(d=>this.selection.p_model_ids.includes(d.id));
  this.urls=await showPackImages(this.dialog,preview.manifest,async m=>{
   const d=selected[Number(m.key.slice(1))-1],f=await this.portal.result(this.portal.client.from('files').select('storage_path').eq('id',d.file_id).single());
   const {data,error}=await this.portal.client.storage.from('student-files').download(f.storage_path);if(error)throw error;return data;
  },()=>this.active());
 }
 async publish(form){
  if(!form.elements.rights.checked)return;this.pending ||= {...this.selection,p_preview_hash:this.preview.preview_hash,p_rights_confirmed:true,p_request_key:crypto.randomUUID()};
  this.message('Preparing your pack…');let result=await this.portal.rpc('create_study_pack',this.pending);if(!this.active())return;this.created=result;
  if(result.status==='preparing')await packAsset(this.portal.client,{action:'publish',id:result.pack_id});
  if(!this.active())return;this.pending=null;this.link(result.code);
 }
 link(code){this.show(`<h3>Your pack is ready</h3><p>Anyone with this link can preview the selected material. Each import is an independent copy.</p><label>Share link<input readonly value="${esc(packLink(code))}" aria-label="Study Pack share link"></label><div class="study-actions"><button class="btn" data-pack-action="copy" data-code="${code}">Copy link</button><button class="btn secondary" data-pack-action="manager">Your packs</button></div><details><summary>Use a code instead</summary><p class="pack-code">${code}</p></details>`);}
 async receive(code){this.code=code;this.pending=null;this.show('<p role="status">Loading pack…</p>');const preview=await this.portal.rpc('preview_study_pack',{p_code:code});if(!this.active())return;this.preview=preview;
  const classes=this.portal.data.classes.filter(c=>!c.archivedAt);this.show(`${packPreviewMarkup(preview.manifest)}<p>Your copy starts fresh. Your results stay private, and later creator edits won’t change your copy.</p><form class="portal-form" data-pack-form="import"><label>Add to class<select name="classId"><option value="new">Create a new class</option>${classes.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label data-pack-new-class>New class name<input name="className" maxlength="80" required value="${esc(preview.manifest.class_name)}"></label><button class="btn">Add to my class</button></form>`);
  const select=this.dialog.querySelector('[name=classId]');select.onchange=()=>{const label=this.dialog.querySelector('[data-pack-new-class]');label.hidden=select.value!=='new';label.querySelector('input').required=select.value==='new';};
  this.urls=await showPackImages(this.dialog,preview.manifest,m=>packAsset(this.portal.client,{action:'image',code,modelKey:m.key}),()=>this.active());
 }
 async import(data){
  if(!this.pending){this.pending={classId:data.get('classId'),className:data.get('className'),classKey:crypto.randomUUID(),newId:crypto.randomUUID(),requestKey:crypto.randomUUID()};}
  const p=this.pending;this.message('Adding your independent copy…');
  if(p.classId==='new'){
   const created=await this.portal.rpc('save_record',{p_table:'classes',p_student_id:this.portal.studentId,p_record_id:p.newId,p_values:{name:p.className},p_expected_version:null,p_request_key:p.classKey});
   if(!this.active())return;p.classId=created.record.id;this.portal.ingest('classes',[created.record]);
  }
  let result=await this.portal.rpc('import_study_pack',{p_code:this.code,p_class_id:p.classId,p_request_key:p.requestKey});
  if(result.status==='preparing')result=await packAsset(this.portal.client,{action:'import',id:result.import_id});
  await this.imported(result);
 }
 async imported(result){
  if(!this.active())return;this.pending=null;await this.portal.refreshStudyOverview();await this.onChange(result.class_id);if(!this.active())return;
  try{sessionStorage.removeItem('admit-pending-pack');}catch{}
  this.show(`<h3>Ready to study</h3><p>Added ${countLabel(result.concepts,'concept')} and ${countLabel(result.models,'Model')}. Your Boxes, reviews and results start fresh.</p><button class="btn" data-start-study="${result.class_id}" data-study-unit="${result.unit_ids[0]}" data-study-focus="practice">Start studying</button><button class="btn secondary" data-pack-action="close">Done</button>`);
 }
 async template(classId){this.templateClass=classId;this.pending=null;this.show(`<h3>Start with suggested units</h3><p>These are editable starter structures, not a complete curriculum. No answers or study history are added.</p><form class="portal-form" data-pack-form="template"><label>Subject<select name="template"><option value="biology">Biology · Cells, Genetics, Ecology</option><option value="chemistry">Chemistry · Atoms, Reactions, Quantities</option><option value="algebra">Algebra · Equations, Inequalities, Graphs</option></select></label><button class="btn">Add suggested units</button></form>`);}
 async submit(e){const form=e.target.closest('[data-pack-form]');if(!form)return;e.preventDefault();if(!form.reportValidity())return;
  // Capture controls before run disables them; disabled controls are absent from FormData.
  const kind=form.dataset.packForm;if(kind==='select'||kind==='import'){
   const data=new FormData(form);return this.run(()=>kind==='select'?this.selectionPreview(data):this.import(data));
  }
  if(kind==='open'){const code=packCode(form.elements.code.value);if(!code){this.message('Paste an Admit Strategy pack link or its full code.');return;}return this.run(()=>this.receive(code));}
  if(kind==='publish')return this.run(()=>this.publish(form));
  if(kind==='template'){const template=form.elements.template.value;return this.run(async()=>{this.pending ||= {p_class_id:this.templateClass,p_template:template,p_request_key:crypto.randomUUID()};await this.portal.rpc('apply_class_template',this.pending);if(!this.active())return;this.pending=null;await this.onChange(this.templateClass);this.show('<h3>Units added</h3><p>Add your own material to these units, rename them, or archive any you do not need.</p><button class="btn" data-pack-action="close">Done</button>');});}
 }
 async click(e){if(e.target.closest('[data-start-study]')){this.dialog.close();return;}const b=e.target.closest('[data-pack-action]');if(!b)return;e.preventDefault();const a=b.dataset.packAction;
  if(a==='close'){if(!this.busy){this.dialog.close();}return;}
  return this.run(async()=>{
   if(a==='manager')return this.manager();if(a==='select')return this.select();if(a==='link')return this.link(b.dataset.code);
   if(a==='copy'){try{await navigator.clipboard.writeText(packLink(b.dataset.code));this.message('Link copied.');}catch{this.dialog.querySelector('input').select();this.message('Select and copy the link above.');}return;}
   if(a==='finish'){await packAsset(this.portal.client,{action:'publish',id:b.dataset.id});if(this.active())this.link(b.dataset.code);return;}
   if(a==='resume-import'){await this.imported(await packAsset(this.portal.client,{action:'import',id:b.dataset.id}));return;}
   if(a==='revoke'){this.show(`<h3>Revoke this link?</h3><p>New visitors will no longer be able to preview or import this pack. Copies already imported stay with their owners.</p><button class="btn" data-pack-action="confirm-revoke" data-id="${b.dataset.id}">Revoke link</button><button class="btn secondary" data-pack-action="manager">Keep link</button>`);return;}
   if(a==='confirm-revoke'){await this.portal.rpc('revoke_study_pack',{p_pack_id:b.dataset.id});if(this.active())await this.manager();}
  });
 }
}
