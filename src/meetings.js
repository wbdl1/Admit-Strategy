import {MutationQueue} from './mutation-queue.js';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
const button=(text,fn)=>{const b=el('button',text,'btn secondary');b.type='button';b.onclick=fn;return b;};
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const time=value=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Qatar'}).format(new Date(value))+' (Qatar time)';
const statusText=value=>String(value).replaceAll('_',' ');

export class Meetings {
  constructor(account,host,{studentId=null,coaching=false}={}){
    Object.assign(this,{account,host,studentId,coaching,adapter:account.portal,actorId:account.user.id,period:'upcoming',generation:0});
    host.classList.add('meetings-workspace');
    this.ui=new Map();this.rows=new Map();
    this.queue=new MutationQueue({send:(job,id)=>{
      if(this.disposed||this.actorId!==account.user?.id)throw Object.assign(new Error('Sign in with the original account to finish this change.'),{rejected:true,retryable:false});
      return this.adapter.rpc(job.rpc,{...job.args,p_request_key:id});
    },optimistic:job=>{const ui=this.ui.get(job.id);this.freeze(ui.form,true);ui.summary.textContent=ui.title+' — Saving…';},
    confirm:(job,response)=>{const ui=this.ui.get(job.id),record=response.record||response.booking;ui.confirm(record);this.account.meetingChanged(record);},onState:job=>this.state(job)});
    this.unload=e=>{if(this.queue.unsaved.length||host.querySelector('form[data-dirty]')){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',this.unload);
    const nav=el('nav',null,'demo-actions');nav.setAttribute('aria-label','Meeting views');
    nav.append(button('Upcoming',()=>this.switchPeriod('upcoming')),button('Past and cancelled',()=>this.switchPeriod('history')));
    this.editor=el('div');this.list=el('div',null,'list');this.message=el('p');this.message.setAttribute('role','status');this.message.setAttribute('aria-live','polite');
    if(studentId){this.createButton=button(coaching?'Arrange coaching meeting':'Book your free first meeting',()=>this.chooseTime());nav.append(this.createButton);}
    host.append(nav,this.editor,this.message,this.list);this.load();
  }
  dispose(){this.disposed=true;this.generation++;window.removeEventListener('beforeunload',this.unload);}
  canLeave(){
    if(this.queue.unsaved.length){this.message.textContent='Finish or resolve the meeting change before leaving.';return false;}
    return !this.host.querySelector('form[data-dirty]')||window.confirm('Discard your unsaved meeting details?');
  }
  switchPeriod(period){if(!this.canLeave())return;this.period=period;this.editor.replaceChildren();this.load();}
  freeze(form,value){form.querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=value);}
  async load(cursor=null){
    const generation=++this.generation;this.message.textContent='Loading meetings…';
    try{
      const rows=await this.adapter.rpc('list_meetings',{p_student_id:this.studentId,p_period:this.period,p_before_time:cursor?.starts_at??null,p_before_id:cursor?.id??null});
      if(this.disposed||generation!==this.generation)return;
      if(!cursor){this.rows.clear();this.list.replaceChildren();}this.more?.remove();
      rows.slice(0,25).forEach(row=>this.card(row));
      this.message.textContent=this.rows.size?'Meeting times use Qatar time.':'No meetings in this view.';
      if(rows.length>25){this.more=button('Load more meetings',()=>this.load(rows[24]));this.list.after(this.more);}
    }catch(error){if(this.disposed||generation!==this.generation)return;this.message.replaceChildren(el('span',error.message),button('Retry loading meetings',()=>this.load(cursor)));}
  }
  card(row){
    let state=this.rows.get(row.id);
    if(!state){const card=el('article',null,'card');state={card,summary:el('h3'),details:el('div'),actions:el('div',null,'demo-actions'),editor:el('div')};card.append(state.summary,state.details,state.actions,state.editor);this.rows.set(row.id,state);this.list.append(card);}
    state.row={...state.row,...row};const current=state.row;
    this.message.textContent='Meeting times use Qatar time.';
    if(this.createButton&&!this.coaching)this.createButton.hidden=[...this.rows.values()].some(({row:r})=>r&&((r.status==='booked'&&new Date(r.ends_at)>new Date())||(r.purpose==='first_meeting'&&r.status==='completed')));
    state.summary.textContent=time(current.starts_at)+' · '+statusText(current.status);
    state.details.replaceChildren(el('p',current.student_name||''),el('p',current.location));
    if(current.meeting_url&&/^https:\/\//i.test(current.meeting_url)){const link=el('a','Open meeting link');link.href=current.meeting_url;link.target='_blank';link.rel='noopener noreferrer';state.details.append(link);}
    if(current.preparation)state.details.append(el('p',current.preparation));
    state.actions.replaceChildren();
    if(current.can_open_student)state.actions.append(button('Open student',()=>this.account.coach.openStudentId(current.student_id)));
    if(!current.can_manage)return;
    if(current.status==='booked'){
      if(new Date(current.starts_at)>new Date())state.actions.append(button('Reschedule',()=>this.chooseTime(current,state)),button('Cancel meeting',()=>this.cancel(current,state)));
      else if(current.can_record_attendance)state.actions.append(button('Cancel meeting',()=>this.cancel(current,state)));
      if(current.can_record_attendance)state.actions.append(button('Edit meeting details',()=>this.details(current,state)));
    }
    if(current.can_record_attendance&&current.status!=='cancelled'&&new Date(current.ends_at)<=new Date())state.actions.append(button('Record attendance',()=>this.attendance(current,state)));
  }
  form(host){const form=el('form',null,'portal-form');const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.oninput=()=>form.dataset.dirty='true';host.replaceChildren(form);return {form,status};}
  field(form,title,name,type,value='',required=true,max){const label=el('label',title),input=el(type==='textarea'?'textarea':'input');input.name=name;if(type!=='textarea')input.type=type;input.value=value;input.required=required;if(max)input.maxLength=max;label.append(input);form.append(label);return input;}
  submit(form,status,label,fn){const save=button(label,()=>{});save.type='submit';form.append(save,status);form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())fn();};}
  state(job){
    if(this.disposed)return;const ui=this.ui.get(job.id);if(!ui)return;
    if(job.state==='saved'){ui.summary.textContent=ui.title;ui.status.textContent='Saved ✓';delete ui.form.dataset.dirty;this.freeze(ui.form,false);if(ui.complete)ui.complete();}
    else if(job.state==='failed'){
      ui.status.replaceChildren(el('span',(job.error.rejected?'Not saved. ':'Save unconfirmed. ')+job.error.message+' Your input is kept.'));
      ui.summary.textContent=ui.title+' — '+(job.error.rejected?'Not saved':'Save unconfirmed');
      if(job.error.rejected)this.freeze(ui.form,false);
      if(job.error.retryable!==false)ui.status.append(button('Retry the same change',()=>this.queue.retry(job.id)));
      if(job.error.rejected)ui.status.append(button('Dismiss rejected change',()=>{job.state='superseded';ui.status.textContent='Change dismissed. Your draft is kept.';}));
      if(job.error.code==='P0409'&&ui.latest)ui.status.append(button('Compare latest meeting',()=>ui.latest()));
    }else ui.status.textContent=job.state==='retrying'?'Saving… retrying safely.':'Saving…';
  }
  save(rpc,args,ui){const id=crypto.randomUUID();this.ui.set(id,ui);this.queue.enqueue({rpc,args},{id,key:args.p_booking_id||args.p_student_id});}
  change(current,values,ui,state){
    this.editor.replaceChildren();
    this.save('update_meeting',{p_booking_id:current.id,p_values:values,p_expected_version:current.row_version},{...ui,
      summary:state.summary,title:time(values.starts_at||current.starts_at)+' · '+statusText(values.status||current.status),
      confirm:row=>this.card({...current,...row}),
      latest:async()=>{
        try{const row=await this.adapter.result(this.account.client.from('bookings').select('*').eq('id',current.id).single());
          const comparison=el('div');comparison.append(el('p','Saved meeting: '+time(row.starts_at)+' · '+statusText(row.status)+' · '+row.location),el('p',row.preparation||''));
          comparison.append(button('Use this version and keep my draft',()=>{Object.assign(current,row);comparison.remove();ui.status.textContent='Draft kept. Review it before saving against the displayed version.';}));ui.status.append(comparison);
        }catch(error){ui.status.append(el('span',error.message));}
      }});
  }
  cancel(current,state){
    if(!this.canLeave())return;const ui=this.form(state.editor);ui.form.append(el('p','Cancel this meeting on '+time(current.starts_at)+'?'));
    this.submit(ui.form,ui.status,'Confirm cancellation',()=>this.change(current,{status:'cancelled'},{...ui,complete:()=>this.freeze(ui.form,true)},state));
  }
  details(current,state){
    if(!this.canLeave())return;const ui=this.form(state.editor);
    const location=this.field(ui.form,'Location','location','text',current.location,true,500),url=this.field(ui.form,'Meeting link (HTTPS)','meeting_url','url',current.meeting_url||'',false,2000),prep=this.field(ui.form,'What to bring / preparation','preparation','textarea',current.preparation,false,1200);
    this.submit(ui.form,ui.status,'Save meeting details',()=>this.change(state.row,{location:location.value,meeting_url:url.value||null,preparation:prep.value},ui,state));
  }
  attendance(current,state){
    if(!this.canLeave())return;const ui=this.form(state.editor),label=el('label','Attendance'),select=el('select');
    for(const [value,title] of [['completed','Attended'],['no_show','Did not attend']]){const option=el('option',title);option.value=value;select.append(option);}select.value=current.status==='no_show'?'no_show':'completed';label.append(select);ui.form.append(label);
    this.submit(ui.form,ui.status,'Save attendance',()=>this.change(state.row,{status:select.value},ui,state));
  }
  async chooseTime(current=null,state=null){
    if(!this.studentId&&!current)return;if(!this.canLeave())return;
    if(!current&&this.period!=='upcoming'){this.period='upcoming';await this.load();if(this.disposed)return;}
    if(current)this.editor.replaceChildren();
    const host=state?.editor||this.editor,ui=this.form(host),title=el('h3',current?'Choose a new meeting time':this.coaching?'Arrange a coaching meeting':'Book your free first meeting');ui.form.append(title,el('p','A 60-minute meeting. Bring your next assessment and current schoolwork.'));
    const day=this.field(ui.form,'Meeting date','meeting_date','date',date());day.min=date();const slots=el('div',null,'demo-actions');ui.form.append(slots,ui.status);
    let generation=0;const load=async()=>{
      const next=++generation;slots.replaceChildren();ui.status.textContent='Loading available times…';
      try{const rows=await this.adapter.rpc('booking_slots',{p_date:day.value});if(next!==generation||!ui.form.isConnected)return;
        ui.status.textContent=rows.length?'Choose a time to confirm.':'No times available. Choose another day.';
        rows.forEach(slot=>slots.append(button(time(slot.starts_at),()=>{
          if(current)this.change(state.row,{starts_at:slot.starts_at,coach_profile_id:slot.coach_profile_id},{...ui,complete:()=>this.freeze(ui.form,true)},state);
          else this.save(this.coaching?'book_coaching_meeting':'book_meeting',{p_student_id:this.studentId,p_coach_id:slot.coach_profile_id,p_starts_at:slot.starts_at},{...ui,summary:title,title:'Meeting '+time(slot.starts_at),
            confirm:row=>{this.card({...row,student_name:this.account.portal.studentId===row.student_id?this.account.portal.data?.student.name:'',can_manage:true,can_record_attendance:this.coaching,can_open_student:false});},
            complete:()=>{this.freeze(ui.form,true);ui.status.replaceChildren(el('span','Booked: '+time(slot.starts_at)+'. Saved ✓'));if(!this.coaching)ui.status.append(button('Open your portal',()=>{if(this.dialog)this.dialog.close();this.account.showWorkspace();}));}});
        })));
      }catch(error){if(next!==generation)return;ui.status.replaceChildren(el('span',error.message),button('Retry available times',load));}
    };day.onchange=load;load();
  }
}

export function openMeetings(account,{studentId=account.portal.studentId,coaching=false}={}){
  if(!studentId)return;if(account.meetings&&!account.meetings.canLeave())return;
  account.meetings?.dispose();
  const dialog=el('dialog',null,'editor-dialog');dialog.setAttribute('aria-labelledby','meetings-title');
  const head=el('div',null,'editor-head'),title=el('h2','Meetings');title.id='meetings-title';
  const close=button('Close',()=>{if(view.canLeave())dialog.close();});close.setAttribute('aria-label','Close meetings');head.append(title,close);
    const body=el('div',null,'editor-body meeting-dialog-body');dialog.append(head,body);document.body.append(dialog);
  const view=new Meetings(account,body,{studentId,coaching});view.dialog=dialog;account.meetings=view;
  dialog.oncancel=e=>{if(!view.canLeave())e.preventDefault();};dialog.onclose=()=>{view.dispose();dialog.remove();if(account.meetings===view)account.meetings=null;};dialog.showModal();
}
