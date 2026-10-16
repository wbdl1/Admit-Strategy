export const guideSteps=[
 {view:'today',title:'Today',body:'Today shows the most important academic actions and reviews you should focus on now.'},
 {view:'classes',title:'Classes',body:'Classes organize what you are learning. Add subjects, units/topics and study material here.'},
 {view:'assessments',title:'Assessments',body:'Add tests, quizzes, projects and deadlines so Admit Strategy can prioritize your work.'},
 {view:'classes',title:'Study / Reviews',body:'Admit Strategy brings difficult material back more often and strong material back less often so you review at the right time. Open a class, choose Units & study, and pick a mode. Every mode updates the same review progress.'},
 {view:'progress',title:'Progress',body:'See confirmed study activity, recent sessions and concepts that need practice. These are real outcomes, not predicted grades.'},
 {view:'classes',title:'You’re ready.',body:'Start by adding one class and your next assessment.'}
];
export class PortalGuide {
 constructor({portal,actor,root,navigate,addClass,isActive,storage=globalThis.localStorage}){
  Object.assign(this,{portal,actor,root,navigate,addClass,isActive,storage});this.key=`admit-guide-v1:${actor}:${portal.studentId}`;
 }
 cached(){try{return JSON.parse(this.storage.getItem(this.key)||'null');}catch{return null;}}
 cache(){try{this.storage.setItem(this.key,JSON.stringify({state:this.state,pending:this.pending,skipAfterSync:this.skipAfterSync}));}catch{/* Server persistence remains available. */}}
 async start(){
  const cached=this.cached();
  try{this.state=await this.portal.rpc('portal_guide_state',{p_student_id:this.portal.studentId});}
  catch{this.state=cached?.state;this.error='The guide could not sync. You can use the portal normally and retry here.';}
  if(!this.isActive())return;
  this.skipAfterSync=!!cached?.skipAfterSync;
  if(cached?.pending){this.pending=cached.pending;this.state=cached.state;await this.flush();}
  this.show();
 }
 dispose(){this.disposed=true;}
 live(){return !this.disposed&&this.isActive()&&this.root.isConnected;}
 async change(step,status='active'){
  if(this.busy||this.pending)return;
  this.pending={p_student_id:this.portal.studentId,p_step:step,p_status:status,p_expected_version:this.state.row_version,p_request_key:crypto.randomUUID()};
  this.state={...this.state,step,status};this.cache();this.show();await this.flush();
 }
 async flush(){
  if(!this.pending||this.busy)return;this.busy=true;this.error='';this.render();
  try{const saved=await this.portal.rpc('save_portal_guide',this.pending);if(!this.live())return;this.state=saved;this.pending=null;this.cache();}
  catch(error){if(!this.live())return;
   if(error.code==='P0409'){try{this.state=await this.portal.rpc('portal_guide_state',{p_student_id:this.portal.studentId});this.pending=null;this.cache();this.error='Loaded your guide progress from the other tab.';}catch{this.error='Guide sync is unavailable. Your place is kept on this device.';}}
   else this.error='Guide progress is kept on this device. Retry sync when connected. The portal remains available.';
  }finally{this.busy=false;if(this.live())this.render();}
  if(this.live()&&this.skipAfterSync&&!this.pending){this.skipAfterSync=false;await this.change(this.state.step,'skipped');}
 }
 show(){if(!this.live())return;this.render();if(this.state?.status==='active'){
  this.navigate(guideSteps[this.state.step].view,this.state.step);requestAnimationFrame(()=>{if(this.live())this.root.scrollIntoView({block:'start'});});
 }}
 render(){
  if(!this.live())return;this.root.replaceChildren();
  const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const button=(text,fn,secondary=false)=>{const b=el('button',text);b.type='button';b.className='btn'+(secondary?' secondary':'');b.onclick=fn;return b;};
  if(!this.state){this.root.hidden=false;this.root.append(el('p',this.error||'Loading the optional guide…'),button('Retry guide',()=>this.start(),true));return;}
  const active=this.state.status==='active';this.root.hidden=!active&&!this.error&&!this.pending;
  if(active){const step=guideSteps[this.state.step];this.root.append(el('p',this.state.step===5?"Quick portal guide complete":`Quick portal guide · ${this.state.step+1} of 5`),el('h2',step.title),el('p',step.body));
   const actions=el('div','');actions.className='guide-actions';
   if(this.state.step>0){const back=button('Back',()=>this.change(this.state.step-1),true);back.disabled=this.busy||!!this.pending;actions.append(back);}
   const next=button(this.state.step===5?'Add my first class':'Next',async()=>{const final=this.state.step===5;await this.change(final?5:this.state.step+1,final?'completed':'active');if(final&&this.live()){const panel=this.addClass();panel?.scrollIntoView({block:"center"});panel?.querySelector("input[name=name]")?.focus({preventScroll:true});}});next.disabled=this.busy||!!this.pending;actions.append(next);
   // Skip remains available even during a failed sync. The pending save keeps its
   // original identity; the skip is applied after it confirms.
   const skip=button('Skip for now',async()=>{if(this.pending){this.state.status='skipped';this.skipAfterSync=true;this.cache();this.render();await this.flush();}else await this.change(this.state.step,'skipped');},true);actions.append(skip);this.root.append(actions);
  }
  if(this.busy||this.error||this.pending){const status=el('p',this.busy?'Saving guide progress…':this.error||'Guide progress waiting to sync.');status.setAttribute('role','status');this.root.append(status);if(!this.busy)this.root.append(button('Retry guide sync',()=>this.flush(),true));}
 }
 async restart(){if(!this.state)await this.start();if(!this.state)return;if(this.pending)await this.flush();if(this.pending)return;await this.change(0);}
}
