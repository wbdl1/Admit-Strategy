import {FileUploads} from './files.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function privateStudyImage(portal,fileId){
 const file=await portal.result(portal.client.from('files').select('storage_path,mime_type').eq('id',fileId).eq('state','ready').is('archived_at',null).single());
 if(!['image/png','image/jpeg','image/webp'].includes(file.mime_type))throw new Error('This diagram needs a supported image.');
 const {data,error}=await portal.client.storage.from('student-files').download(file.storage_path);if(error)throw new Error('Private image could not load. Check your connection, then retry.');
 return URL.createObjectURL(data);
}
export function diagramMarkup(url,points,active){return `<div class="study-diagram-image">${url?`<img src="${esc(url)}" alt="Private study diagram. Numbered markers identify locations to label.">`:''}${url?points.map((p,index)=>`<span class="diagram-marker ${active===p.review_card_id?'current':''}" style="left:${Number(p.x)}%;top:${Number(p.y)}%">${Number(p.number)||index+1}</span>`).join(''):''}</div>`;}

export const modelPosition=(x,y)=>({x:Math.round(Math.max(0,Math.min(100,x))*10)/10,y:Math.round(Math.max(0,Math.min(100,y))*10)/10});
export function modelLabels(points,cards){
 if(!points.length||points.length>60)throw new Error('Add between 1 and 60 labels to your image.');
 const seen=new Set();return points.map(p=>{
  if(!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))throw new Error('Choose a position on the image for every label.');
  const label=String(p.label||cards.find(c=>c.id===p.review_card_id)?.term||'').trim();
  if(!label||label.length>160)throw new Error('Give every label an answer, up to 160 characters.');
  const key=label.toLocaleLowerCase();if(seen.has(key))throw new Error('Use each answer once in a model.');seen.add(key);
  const existing=cards.find(c=>c.term.trim().toLocaleLowerCase()===key);
  return {...modelPosition(Number(p.x),Number(p.y)),label,review_card_id:existing?.id||p.review_card_id||null};
 });
}
export class StudyDiagrams {
 constructor({portal,config,patch,onStart,onChange=()=>{},isActive}){
  Object.assign(this,{portal,patch,onStart,onChange,isActive});this.rows=[];this.cards=[];this.images=new Map();this.loadingImages=new Set();this.draft=null;
  this.uploads=new FileUploads({portal,config,onChange:()=>this.status()});
 }
 get unsaved(){return this.pending||this.importPending||this.uploads.unsaved.length||this.dirty;}
 dispose(){this.disposed=true;for(const url of this.images.values())URL.revokeObjectURL(url);this.images.clear();}
 async mount(root,unit,cards){
  this.root=root;this.unit=unit;this.cards=cards.filter(c=>c.unit_id===unit.id&&!c.archived_at);
  root.onclick=e=>this.click(e);root.onsubmit=e=>this.submit(e);
  root.oninput=e=>{if(e.target.closest('[data-diagram-editor]')){this.capture();this.dirty=true;}};
  root.onchange=e=>{if(e.target.matches('[data-diagram-upload]')&&e.target.files[0])this.upload(e.target.files[0]);};
  root.ondragover=e=>{const drop=e.target.closest('[data-model-drop]');if(drop){e.preventDefault();drop.classList.add('drag-over');}};
  root.ondragleave=e=>e.target.closest('[data-model-drop]')?.classList.remove('drag-over');
  root.ondrop=e=>{const drop=e.target.closest('[data-model-drop]');if(!drop)return;e.preventDefault();e.stopPropagation();drop.classList.remove('drag-over');if(e.dataTransfer.files.length!==1){this.message='Choose one image for each model.';this.status();return;}this.upload(e.dataTransfer.files[0]);};
  root.onpointerdown=e=>this.pointerDown(e);root.onpointermove=e=>this.pointerMove(e);root.onpointerup=e=>this.pointerUp(e);root.onpointercancel=e=>this.pointerUp(e);
  root.onkeydown=e=>this.keyMove(e);
  this.render();if(this.loadedUnit!==unit.id)await this.load();
 }
 async load(){
  this.message='Loading models…';this.status();try{let rows=[],last=null;for(;;){let q=this.portal.client.from('study_diagrams').select('*,study_diagram_points(*)').eq('unit_id',this.unit.id).order('id').limit(100);if(last)q=q.gt('id',last);const page=await this.portal.result(q);rows.push(...page);if(page.length<100)break;last=page.at(-1).id;}
   if(this.disposed)return;this.rows=rows;this.loadedUnit=this.unit.id;this.message='';this.render();
  }catch(e){this.message=e.message;this.status();}
 }
 capture(){const f=this.root?.querySelector('[data-diagram-editor]');if(!f||!this.draft)return;if(f.elements.title)this.draft.title=f.elements.title.value;
  const point=this.draft.points[this.selected];if(point&&f.elements.label){const label=f.elements.label.value;if(label!==point.label){point.label=label;point.review_card_id=null;}}
 }
 canvas(d,preview){const url=this.images.get(d.file_id);return `<div class="model-canvas" data-model-canvas ${preview?'':'role="group" aria-label="Click the image to add a label. Use Add label for keyboard input."'}>${url?`<img src="${esc(url)}" alt="Your model image">${d.points.map((p,i)=>`<button type="button" class="model-hotspot" data-model-point="${i}" style="left:${Number(p.x)}%;top:${Number(p.y)}%" aria-label="Label ${i+1}: ${esc(p.label||'New answer')}. Use arrow keys to move." aria-pressed="${this.selected===i}" ${preview?'disabled':''}>${i+1}</button>`).join('')}`:'<p>Loading your image…</p>'}</div>`;}
 render(){if(this.disposed||!this.root?.isConnected)return;
  const d=this.draft,canEdit=this.portal.canEdit!==false,point=d?.points[this.selected];
  let body='';
  if(d){body=`<ol class="model-steps"><li>1 Image ✓</li><li ${!this.preview?'aria-current="step"':''}>2 Labels</li><li ${this.preview?'aria-current="step"':''}>3 Preview</li></ol><form class="portal-form model-editor" data-diagram-editor><label>Model name<input name="title" maxlength="160" required value="${esc(d.title)}"></label>${this.preview?`${this.canvas(d,true)}<ol class="model-preview-list">${d.points.map((p,i)=>`<li><strong>${i+1}.</strong> ${esc(p.label)}</li>`).join('')}</ol><div class="study-actions"><button type="submit" class="btn" name="intent" value="start">Save & start practising</button><button type="submit" class="btn secondary" name="intent" value="save">Save model</button><button type="button" class="btn secondary" data-diagram-action="back-labels">Edit labels</button></div>`:`<p>Click or tap the image to add a label. Drag a numbered point to move it.</p><div class="model-editor-layout"><div>${this.canvas(d,false)}<div class="model-label-list">${d.points.map((p,i)=>`<button type="button" class="btn secondary" data-diagram-action="select-point" data-index="${i}">${i+1}. ${esc(p.label||'New label')}</button>`).join('')}</div><button type="button" class="btn secondary" data-diagram-action="add-point">+ Add label</button></div><div>${point?`<section class="model-label-editor"><h4>Label ${this.selected+1}</h4><label>Answer<input name="label" required maxlength="160" list="model-concepts-${this.unit.id}" value="${esc(point.label||'')}" placeholder="e.g. Nucleus" autocomplete="off"></label><datalist id="model-concepts-${this.unit.id}">${this.cards.map(c=>`<option value="${esc(c.term)}"></option>`).join('')}</datalist><p class="muted">Use an existing concept or type a new answer.</p><button type="button" class="btn secondary" data-diagram-action="done-label">Done with this label</button><details><summary>Move or remove this label</summary><p>Focus its number on the image and use arrow keys, or use these buttons.</p><div class="study-actions">${[['left','←'],['up','↑'],['down','↓'],['right','→']].map(([dir,arrow])=>`<button type="button" class="btn secondary" data-diagram-action="nudge" data-direction="${dir}" aria-label="Move label ${dir}">${arrow}</button>`).join('')}</div><button type="button" class="btn secondary" data-diagram-action="remove-point" data-index="${this.selected}">Remove label ${this.selected+1}</button></details></section>`:'<p class="empty">Tap a place on the image, then type its answer.</p>'}</div></div><div class="study-actions"><button type="submit" class="btn" name="intent" value="preview" ${d.points.length?'':'disabled'}>Preview model →</button><button type="button" class="btn secondary" data-diagram-action="cancel">Close editor</button></div>`}</form>`;
  }else{body=`${this.savedDraft?'<p class="info-box">Your unfinished model is kept in this workspace. <button type="button" class="btn secondary" data-diagram-action="resume-draft">Continue editing</button></p>':''}${canEdit&&!this.unit.archived_at?'<div class="file-drop" data-model-drop><strong>Drop a diagram image here</strong><span>or </span><label class="btn">Choose image<input type="file" data-diagram-upload aria-label="Choose model image" accept=".png,.jpg,.jpeg,.webp"></label><p>PNG, JPEG or WebP · up to 20 MB</p></div>':''}<div class="model-list">${this.rows.map(row=>`<article class="item"><h4>${esc(row.title)}${row.archived_at?' · Archived':''}</h4><p class="muted">${row.study_diagram_points.length} labels</p><div class="study-actions">${!row.archived_at?`<button type="button" class="btn" data-diagram-action="study" data-id="${row.id}" ${!canEdit||this.unit.archived_at?'disabled':''}>Practise this model</button>`:''}${canEdit?`<details><summary>••• More</summary><button type="button" class="btn secondary" data-diagram-action="edit" data-id="${row.id}" ${this.unit.archived_at?'disabled':''}>${row.archived_at?'Restore / edit':'Edit model'}</button>${!row.archived_at?`<button type="button" class="btn secondary" data-diagram-action="archive" data-id="${row.id}">Archive model</button>`:''}</details>`:''}</div></article>`).join('')||'<p class="empty">Add an image, place the labels, then practise remembering them.</p>'}</div>`;}
  this.patch(this.root,`<section aria-label="Models">${body}<p role="status" aria-live="polite" data-diagram-status></p><button type="button" class="btn secondary" data-diagram-action="retry" hidden>Retry model save</button><button type="button" class="btn secondary" data-diagram-action="retry-upload" hidden>Retry image upload</button><button type="button" class="btn secondary" data-diagram-action="refresh" ${d?'hidden':''}>Refresh models</button></section>`);
  this.root.querySelectorAll('input,select,textarea,button').forEach(b=>b.dataset.unavailable=b.disabled?'true':'false');this.status();if(d&&!this.images.has(d.file_id)&&!this.loadingImages.has(d.file_id))this.image(d.file_id);
 }
 status(){if(!this.root?.isConnected)return;const job=this.job;let text=this.message||'';
  if(job&&job.state!=='saved')text=job.state==='failed'?job.error.message:job.state==='uploading'?`Uploading image… ${Math.round(job.progress*100)}%`:job.state==='validating'?'Finishing image upload…':'Preparing image…';
  const n=this.root.querySelector('[data-diagram-status]');if(n)n.textContent=text;
  const retry=this.root.querySelector('[data-diagram-action=retry]');if(retry)retry.hidden=!(this.pending||this.importPending)||!!this.busy;
  const upload=this.root.querySelector('[data-diagram-action=retry-upload]');if(upload)upload.hidden=job?.state!=='failed'||job.error?.retryable===false;
  this.root.querySelectorAll('input,select,textarea,button').forEach(b=>{if(!['retry','retry-upload'].includes(b.dataset.diagramAction))b.disabled=b.dataset.unavailable==='true'||!!this.busy||!!this.pending||!!this.importPending||!!job&&['preparing','uploading','validating'].includes(job.state);});
 }
 async image(id){this.loadingImages.add(id);try{const url=await privateStudyImage(this.portal,id);if(this.disposed){URL.revokeObjectURL(url);return;}this.images.set(id,url);this.capture();this.render();}catch(e){this.message=e.message;this.status();}finally{this.loadingImages.delete(id);}}
 async upload(file){if(!this.isActive()||this.busy||this.pending||this.importPending||this.portal.canEdit===false||this.unit.archived_at)return;try{if(!/\.(png|jpe?g|webp)$/i.test(file.name))throw new Error('Choose a PNG, JPEG or WebP image.');this.job=this.uploads.add(file,this.unit.class_id);await this.job.done;if(!this.isActive()||this.disposed)return;this.afterUpload();}catch(e){this.message=e.message;this.status();}}
 afterUpload(){if(this.job?.state==='saved'){this.draft={id:crypto.randomUUID(),file_id:this.job.result.file.id,title:this.job.result.file.original_name.replace(/\.[^.]+$/,''),points:[],row_version:null};this.preview=false;this.selected=-1;this.dirty=true;this.message='Image added. Tap where the first label belongs.';this.render();}else this.status();}
 async submit(event){if(!event.target.matches('[data-diagram-editor]'))return;event.preventDefault();event.stopPropagation();if(this.busy||this.pending||this.importPending||!event.target.reportValidity())return;this.capture();
  try{this.draft.points=modelLabels(this.draft.points,this.cards);this.message='';if(event.submitter?.value==='preview'){this.preview=true;this.render();return;}this.startAfterSave=event.submitter?.value==='start';await this.save(this.draft,false);}catch(e){this.message=e.message;this.status();}
 }
 async save(draft,archived){if(this.busy||!this.isActive())return;draft??=this.draft;this.busy=true;this.message='Saving model…';this.status();
  try{
   if(!this.pending){
    if(!archived){draft.points=modelLabels(draft.points,this.cards);const fresh=draft.points.filter(p=>!p.review_card_id);
     if(fresh.length){this.importPending??={p_unit_id:this.unit.id,p_items:fresh.map(p=>({term:p.label,answer:p.label,prompt:'Name this part of '+draft.title})),p_request_key:crypto.randomUUID()};
      const result=await this.portal.rpc('import_study_items',this.importPending);if(!this.isActive()||this.disposed)return;
      for(const point of fresh){const card=result.records.find(c=>c.term===point.label);if(!card)throw new Error('The new label was not confirmed. Retry this save.');point.review_card_id=card.id;this.cards.push(card);}this.importPending=null;
     }
    }
    this.pending={p_unit_id:this.unit.id,p_diagram_id:draft.id,p_file_id:draft.file_id,p_title:draft.title,p_points:draft.points.map(p=>({review_card_id:p.review_card_id,x:p.x,y:p.y})),p_archived:archived,p_expected_version:draft.row_version,p_request_key:crypto.randomUUID()};
   }
   const id=this.pending.p_diagram_id;await this.portal.rpc('save_study_diagram',this.pending);if(!this.isActive()||this.disposed)return;
   this.pending=null;this.draft=null;this.savedDraft=null;this.dirty=false;await this.onChange();await this.load();this.message=archived?'Model archived. Study history kept.':'Model saved ✓';
   if(this.startAfterSave&&!archived){this.startAfterSave=false;await this.onStart(id);}
  }catch(e){this.message=e.message;if(e.rejected||e.code==='P0409'){this.pending=null;this.importPending=null;}}
  finally{this.busy=false;this.status();}
 }
 focusLabel(){this.root.querySelector('[name=label]')?.focus();}
 addPoint(x=50,y=50){if(!this.draft||this.preview||this.busy||this.pending||this.importPending)return;this.capture();if(this.draft.points.length>=60){this.message='Use up to 60 labels in one model.';this.status();return;}
  this.draft.points.push({...modelPosition(x,y),label:'',review_card_id:null});this.selected=this.draft.points.length-1;this.dirty=true;this.render();this.focusLabel();
 }
 pointerDown(e){const b=e.target.closest('[data-model-point]');if(!b||b.disabled||this.preview||this.busy||this.pending||this.importPending)return;this.capture();this.selected=Number(b.dataset.modelPoint);this.drag={b,id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};b.setPointerCapture(e.pointerId);}
 pointerMove(e){const drag=this.drag;if(!drag||drag.id!==e.pointerId)return;const r=drag.b.parentElement.getBoundingClientRect();if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)drag.moved=true;if(!drag.moved)return;
  e.preventDefault();const position=modelPosition((e.clientX-r.left)/r.width*100,(e.clientY-r.top)/r.height*100);Object.assign(this.draft.points[this.selected],position);drag.b.style.left=position.x+'%';drag.b.style.top=position.y+'%';this.dirty=true;
 }
 pointerUp(e){if(!this.drag||this.drag.id!==e.pointerId)return;const moved=this.drag.moved;this.drag=null;if(moved){this.ignoreClick=true;this.render();this.root.querySelector(`[data-model-point="${this.selected}"]`)?.focus({preventScroll:true});}}
 keyMove(e){const b=e.target.closest('[data-model-point]'),moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!b||!moves[e.key]||b.disabled||this.preview)return;e.preventDefault();this.capture();this.selected=Number(b.dataset.modelPoint);this.movePoint(...moves[e.key].map(v=>v*(e.shiftKey?5:1)));this.root.querySelector(`[data-model-point="${this.selected}"]`)?.focus({preventScroll:true});}
 movePoint(dx,dy){const p=this.draft?.points[this.selected];if(!p)return;Object.assign(p,modelPosition(Number(p.x)+dx,Number(p.y)+dy));this.dirty=true;this.render();}
 async click(event){if(this.ignoreClick){this.ignoreClick=false;return;}const point=event.target.closest('[data-model-point]');if(point&&!point.disabled&&!this.preview){this.capture();this.selected=Number(point.dataset.modelPoint);this.render();this.focusLabel();return;}
  const b=event.target.closest('[data-diagram-action]');if(!b){const canvas=event.target.closest('[data-model-canvas]');if(canvas&&!this.preview&&!this.drag){const r=canvas.getBoundingClientRect();this.addPoint((event.clientX-r.left)/r.width*100,(event.clientY-r.top)/r.height*100);}return;}
  event.stopPropagation();if(b.disabled)return;const action=b.dataset.diagramAction,row=this.rows.find(r=>r.id===b.dataset.id);
  if(action==='retry'){await this.save();return;}if(action==='retry-upload'){await this.uploads.retry(this.job.id);this.afterUpload();return;}if(this.busy||this.pending||this.importPending)return;
  this.capture();this.message='';
  if(action==='refresh'){await this.load();return;}if(action==='study'){await this.onStart(row.id);return;}
  if(action==='edit'){this.draft={...row,points:row.study_diagram_points.map(p=>({review_card_id:p.review_card_id,label:this.cards.find(c=>c.id===p.review_card_id)?.term||'',x:p.x,y:p.y}))};this.preview=false;this.selected=0;}
  if(action==='archive'){await this.save({...row,points:row.study_diagram_points},true);return;}
  if(action==='cancel'){this.savedDraft=this.draft;this.draft=null;this.message='Draft kept while this workspace is open. Continue editing to save your model before refreshing.';}
  if(action==='resume-draft'){this.draft=this.savedDraft;this.savedDraft=null;}
  if(action==='add-point'){this.addPoint();return;}
  if(action==='select-point'){this.selected=Number(b.dataset.index);}
  if(action==='done-label'){if(!this.draft.points[this.selected]?.label.trim()){this.message='Type the answer for this label.';this.status();this.focusLabel();return;}this.selected=-1;}
  if(action==='remove-point'){this.draft.points.splice(Number(b.dataset.index),1);this.selected=-1;this.dirty=true;}
  if(action==='back-labels')this.preview=false;
  if(action==='nudge'){const move={left:[-2,0],right:[2,0],up:[0,-2],down:[0,2]}[b.dataset.direction];this.movePoint(...move);return;}
  this.render();if(['edit','select-point'].includes(action))this.focusLabel();
 }
}
