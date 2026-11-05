import {MutationQueue} from './mutation-queue.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
const button=(text,fn)=>{const node=el('button',text,'btn secondary');node.type='button';node.onclick=fn;return node;};
const label=(form,text,name,type='text',value='')=>{const box=el('label',text),input=el('input');input.name=name;input.type=type;input.value=value;box.append(input);form.append(box);return input;};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const plusDay=(value,days)=>new Date(Date.parse(value+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const clock=value=>value?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Qatar',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)):'';
const date=value=>value?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):'';
const rejected=message=>Object.assign(new Error(message),{rejected:true,retryable:false});

export function parseCalendarFile(file,window,url){
  if(!file||!file.name.toLowerCase().endsWith('.ics')||file.size<1||file.size>1024*1024)return Promise.reject(new Error('Choose a .ics file no larger than 1 MB.'));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(url);let settled=false;
    const done=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>done(new Error('This calendar took too long to read. Export a shorter date range.')),5000);
    worker.onmessage=event=>event.data.ok?done(null,event.data):done(new Error(event.data.error));
    worker.onerror=()=>done(new Error('Calendar preview failed. Your file was not imported. Try again.'));
    file.text().then(text=>{if(!settled)worker.postMessage({text,window});},error=>done(error));
  });
}

export class CalendarWorkspace {
  constructor({portal,config,onChange=()=>{}}){
    Object.assign(this,{portal,config,onChange});this.studentId=portal.studentId;this.widgets=new Map();this.records=new Map();this.sources=[];this.disposed=false;
    this.queue=new MutationQueue({send:async(values)=>{
      if(this.disposed||this.studentId!==this.portal.studentId)throw rejected('This workspace is closed. Sign in and review the saved record before trying again.');
      return this.portal.rpc(values.method,values.args);
    },optimistic:job=>{if(job.values.preview)this.records.set(job.values.preview.id,{...job.values.preview,pending:true});this.renderAll();},
    confirm:(job,response)=>{
      for(const row of response.records||[response.record].filter(Boolean)){this.records.set(row.id,row);this.portal.ingest('calendar_events',[row],{confirmed:true});}
      if(response.source){const i=this.sources.findIndex(s=>s.id===response.source.id);if(i<0)this.sources.push(response.source);else this.sources[i]=response.source;this.portal.ingest('calendar_sources',[response.source],{confirmed:true});}
      if(job.values.method==='save_calendar_event'&&!this.sources.some(s=>s.id===response.record.source_id))this.sources.push({id:response.record.source_id,kind:'manual',name:'My events'});
      if(response.assessment){this.portal.ingest('assessments',[response.assessment],{confirmed:true});this.onChange();}
    },onState:job=>{
      if(job.values.preview&&job.state==='failed'){const row=this.records.get(job.values.preview.id);if(row){row.pending=false;row.failed=true;}}
      this.renderAll();const callback=this.callbacks?.get(job.id);if(callback)callback(job);
    }});
    this.callbacks=new Map();
  }
  get unsaved(){return this.queue.unsaved;}
  dispose(){this.disposed=true;}
  mountAll(){
    for(const root of document.querySelectorAll('[data-calendar-workspace]'))if(!this.widgets.has(root))this.mount(root);
    for(const root of this.widgets.keys())if(!root.isConnected)this.widgets.delete(root);
  }
  mount(root){
    const heading=el('h2','Calendar'),help=el('p','Add events or import an .ics file. Times are shown in Qatar time.','muted');root.append(heading,help);
    const widget={root,list:el('div',null,'list'),status:el('p',null,'form-help'),jobs:el('div'),generation:0};this.widgets.set(root,widget);widget.status.setAttribute('role','status');widget.status.setAttribute('aria-live','polite');
    if(this.portal.canEdit){
      const add=el('details',null,'form-panel');add.append(el('summary','Add an event'),this.eventForm(widget));root.append(add);
      const importing=el('details',null,'form-panel');importing.append(el('summary','Import a calendar (.ics)'));root.append(importing);this.importForm(widget,importing);
    }
    const range=el('form',null,'portal-form form-grid');widget.from=label(range,'From','from','date',today());widget.to=label(range,'Through','to','date',plusDay(today(),30));
    widget.from.required=widget.to.required=true;const load=el('button','Show events','btn secondary');range.append(load);range.onsubmit=event=>{event.preventDefault();this.load(widget,true);};
    widget.more=button('Load more events',()=>this.load(widget,false));widget.more.hidden=true;root.append(range,widget.status,widget.jobs,widget.list,widget.more);this.load(widget,true);
  }
  async load(widget,reset){
    if(widget.loading)return;
    if(!widget.from.value||!widget.to.value||widget.to.value<widget.from.value){widget.status.textContent='Choose a valid date range.';return;}
    widget.loading=true;widget.more.disabled=true;widget.status.textContent='Loading calendar…';const generation=++widget.generation;
    const from=widget.from.value,to=widget.to.value;
    try{
      let query=this.portal.client.from('calendar_agenda').select('*').eq('student_id',this.studentId).is('archived_at',null).gte('display_date',from).lte('display_date',to).order('display_date').order('id').limit(51);
      if(!reset&&widget.cursor)query=query.or('display_date.gt.'+widget.cursor.day+',and(display_date.eq.'+widget.cursor.day+',id.gt.'+widget.cursor.id+')');
      const [rows,sources]=await Promise.all([this.portal.result(query),this.portal.result(this.portal.client.from('calendar_sources').select('*').eq('student_id',this.studentId).is('archived_at',null).order('name').limit(50))]);
      if(this.disposed||generation!==widget.generation)return;
      this.sources=sources;
      if(reset)widget.ids=[];
      for(const row of rows.slice(0,50)){if(!this.queue.unsaved.some(j=>j.key===row.id))this.records.set(row.id,row);if(!widget.ids.includes(row.id))widget.ids.push(row.id);}
      const last=rows.slice(0,50).at(-1);widget.cursor=last?{day:last.display_date,id:last.id}:null;widget.more.hidden=rows.length<=50;
      widget.status.textContent=widget.ids.length?'':'No events in this date range.';this.render(widget);this.sourceOptions(widget);
    }catch(error){widget.status.textContent=error.message+' ';widget.status.append(button('Retry',()=>this.load(widget,reset)));}
    finally{widget.loading=false;widget.more.disabled=false;}
  }
  renderAll(){for(const widget of this.widgets.values())if(widget.root.isConnected)this.render(widget);}
  render(widget){
    const rows=[...this.records.values()].filter(r=>{const d=r.start_date||date(r.starts_at);return d>=widget.from.value&&d<=widget.to.value&&!r.archived_at;}).sort((a,b)=>String(a.start_date||a.starts_at).localeCompare(b.start_date||b.starts_at)||a.id.localeCompare(b.id));
    if(rows.length&&widget.status.textContent==='No events in this date range.')widget.status.textContent='';
    for(const row of rows){
      let card=[...widget.list.children].find(n=>n.dataset.calendarId===row.id);
      if(!card){card=el('article',null,'item');card.dataset.calendarId=row.id;card.append(el('strong'),el('p'),el('div',null,'record-actions'),el('div',null,'calendar-editor'));widget.list.append(card);}
      card.children[0].textContent=row.title;card.children[1].textContent=(row.start_date||date(row.starts_at))+(row.starts_at?' · '+clock(row.starts_at)+'–'+clock(row.ends_at)+' (Qatar)':' · All day')+(row.status==='cancelled'?' · Cancelled':'')+(row.pending?' · Saving…':row.failed?' · Not saved':'');
      const actions=card.children[2];actions.replaceChildren();
      if(this.portal.canEdit&&!row.pending&&!row.failed){
        const source=this.sources.find(s=>s.id===row.source_id);
        if(source?.kind==='manual')actions.append(button('Edit event',()=>{card.children[3].replaceChildren(this.eventForm(widget,row));}));
        if(row.status==='active'||row.assessment_id)actions.append(button(row.assessment_id?(row.needs_confirmation?'Review changed assessment':'Review linked assessment'):'Make an assessment',()=>this.assessmentForm(widget,row,card.children[3])));
        if(row.needs_confirmation)actions.append(el('span','Review required','status'));
      }
    }
    for(const card of [...widget.list.children])if(!rows.some(r=>r.id===card.dataset.calendarId))card.remove();
    widget.jobs.replaceChildren();
    for(const job of this.queue.unsaved){
      const item=el('div',null,'info-box');item.setAttribute('role','status');item.append(el('span',job.state==='failed'?job.error?.message||'Save failed. Your input is kept.':job.state==='blocked'?'Waiting for the earlier change to be confirmed…':job.state==='retrying'?'Connection interrupted. Retrying…':'Saving…'));
      if(job.state==='failed'&&job.error?.retryable!==false)item.append(button('Retry save',()=>this.queue.retry(job.id)));
      if(job.state==='failed'&&job.error?.rejected){item.append(button('Discard rejected change',()=>{job.state='superseded';this.records.delete(job.values.preview?.id);this.renderAll();this.load(widget,true);}));}
      widget.jobs.append(item);
    }
  }
  save(form,method,args,preview,after=()=>{}){
    const id=args.p_request_key||crypto.randomUUID();args={...args,p_request_key:id};const fieldset=form.querySelector('fieldset'),status=form.querySelector('[role=status]');
    fieldset.disabled=true;status.textContent='Saving…';
    const callback=job=>{
      if(job.state==='saved'){form.removeAttribute('data-dirty');status.textContent='Saved ✓';fieldset.disabled=false;after(job);this.callbacks.delete(id);}
      else if(job.state==='failed'){status.textContent=job.error?.message||'Save could not be confirmed. Your input is kept.';fieldset.disabled=!job.error?.rejected;}
      else status.textContent=job.state==='retrying'?'Retrying…':'Saving…';
    };
    this.callbacks.set(id,callback);return this.queue.enqueue({method,args,preview},{id,key:preview?.id||args.p_event_id||args.p_source_id||id});
  }
  baseForm(){
    const form=el('form',null,'portal-form calendar-form'),fields=el('fieldset',null,'form-grid'),status=el('p',null,'form-help');status.setAttribute('role','status');form.append(fields,status);
    form.oninput=()=>form.dataset.dirty='true';return {form,fields,status};
  }
  eventForm(widget,record){
    const {form,fields,status}=this.baseForm();let current=record,createId=crypto.randomUUID();
    const title=label(fields,'Event name','title','text',record?.title||'');title.required=true;title.maxLength=300;
    const dayStart=record?.start_date||date(record?.starts_at)||today();
    const start=label(fields,'Start date','start','date',dayStart),end=label(fields,'Last day','end','date',record?.end_date?plusDay(record.end_date,-1):date(record?.ends_at)||dayStart);start.required=end.required=true;
    const all=label(fields,'All day','allDay','checkbox');all.checked=!record?.starts_at;
    const times=el('div',null,'form-grid'),startTime=label(times,'Start time (Qatar)','startTime','time',clock(record?.starts_at)||'16:00'),endTime=label(times,'End time (Qatar)','endTime','time',clock(record?.ends_at)||'17:00');fields.append(times);times.hidden=all.checked;all.onchange=()=>times.hidden=all.checked;
    const descriptionLabel=el('label','Notes'),description=el('textarea');description.name='description';description.maxLength=2000;description.value=record?.description||'';descriptionLabel.append(description);fields.append(descriptionLabel);
    const stateLabel=el('label','Status'),state=el('select');for(const value of ['active','cancelled']){const option=el('option',value==='active'?'Scheduled':'Cancelled');option.value=value;state.append(option);}state.value=record?.status||'active';stateLabel.append(state);fields.append(stateLabel);
    fields.append(el('button',record?'Save event':'Add event','btn'));
    form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;
      try{
        const values={title:title.value.trim(),description:description.value,timezone:'Asia/Qatar',status:state.value,start_date:all.checked?start.value:null,end_date:all.checked?plusDay(end.value,1):null,
          starts_at:all.checked?null:new Date(start.value+'T'+startTime.value+':00+03:00').toISOString(),ends_at:all.checked?null:new Date(end.value+'T'+endTime.value+':00+03:00').toISOString()};
        if(end.value<start.value||(!all.checked&&values.ends_at<values.starts_at))throw new Error('The end must be after the start.');
        const id=current?.id||createId;
        this.save(form,'save_calendar_event',{p_student_id:this.studentId,p_record_id:id,p_values:values,p_expected_version:current?.row_version??null},{...current,...values,id},()=>{
          current=this.records.get(id);if(!record){title.value='';description.value='';current=null;createId=crypto.randomUUID();}
        });
      }catch(error){status.textContent=error.message;}
    };return form;
  }
  sourceOptions(widget){
    if(!widget.sourceSelect)return;const chosen=widget.sourceSelect.value;
    widget.sourceSelect.replaceChildren(new Option('New calendar',''));
    for(const source of this.sources.filter(s=>s.kind==='ics'))widget.sourceSelect.append(new Option(source.name,source.id));
    widget.sourceSelect.value=chosen;
  }
  importForm(widget,parent){
    const {form,fields,status}=this.baseForm(),sourceLabel=el('label','Import into'),source=el('select');sourceLabel.append(source);fields.append(sourceLabel);widget.sourceSelect=source;this.sourceOptions(widget);
    const name=label(fields,'Calendar name','calendarName');name.maxLength=160;
    const from=label(fields,'Import from','importFrom','date',today()),to=label(fields,'Through (inclusive)','importTo','date',plusDay(today(),90));from.required=to.required=true;
    const picker=label(fields,'Calendar file (.ics, up to 1 MB)','file','file');picker.accept='.ics,text/calendar';
    const preview=el('div',null,'calendar-preview'),read=button('Preview events',async()=>{
      status.textContent='Reading calendar…';fields.disabled=true;submit.disabled=true;
      const previewSource=this.sources.find(s=>s.id===source.value);
      try{
        const result=await parseCalendarFile(picker.files[0],{from:from.value,to:plusDay(to.value,1)},this.config.calendarWorkerUrl);widget.preview={...result,source:previewSource?structuredClone(previewSource):null};preview.replaceChildren(el('p',result.events.length+' events. '+result.notice));
        if(!result.events.length){status.textContent='No events in this date range. Adjust it and preview again.';return;}
        const list=el('ul');for(const row of result.events)list.append(el('li',(row.start_date||date(row.starts_at))+' · '+row.title+(row.status==='cancelled'?' · Cancelled':'')));preview.append(list);status.textContent='Review the preview, then import.';submit.disabled=false;
      }catch(error){widget.preview=null;status.textContent=error.message;}finally{fields.disabled=false;}
    });
    const submit=el('button','Import events','btn');submit.disabled=true;fields.append(read,preview,submit);parent.append(form);
    for(const input of [picker,from,to,source])input.addEventListener('change',()=>{widget.preview=null;submit.disabled=true;preview.replaceChildren();});
    form.onsubmit=event=>{event.preventDefault();if(!widget.preview?.events.length)return;
      const existing=widget.preview.source,calendarName=existing?.name||name.value.trim();if(!calendarName){status.textContent='Name this calendar, or choose an existing one.';return;}
      this.save(form,'import_calendar_events',{p_student_id:this.studentId,p_source_id:existing?.id||crypto.randomUUID(),p_name:calendarName,p_expected_version:existing?.row_version??null,p_events:widget.preview.events},null,job=>{
        source.value=job.values.args.p_source_id;this.sourceOptions(widget);source.value=job.values.args.p_source_id;widget.preview=null;submit.disabled=true;preview.replaceChildren();picker.value='';this.load(widget,true);
      });
    };
  }
  async assessmentForm(widget,row,root){
    root.replaceChildren(el('p','Loading assessment details…'));let linked;
    try{if(row.assessment_id)linked=await this.portal.result(this.portal.client.from('assessments').select('*').eq('id',row.assessment_id).single());}
    catch(error){root.replaceChildren(el('p',error.message),button('Retry',()=>this.assessmentForm(widget,row,root)));return;}
    if(!root.isConnected)return;
    const {form,fields,status}=this.baseForm();fields.append(el('p',linked?'Linked assessment: '+linked.name+' · '+linked.due_date+'. Choose whether to apply the calendar change.':'Confirm the class and type. This creates one assessment in Classes, Upcoming Assessments and Today.'));
    const classLabel=el('label','Class'),classes=el('select');classes.required=true;classes.append(new Option('Choose a class',''));for(const item of this.portal.data.classes)classes.append(new Option(item.name,item.id));classes.value=linked?.class_id||'';classLabel.append(classes);fields.append(classLabel);
    const kindLabel=el('label','Assessment type'),kind=el('select');for(const type of ['formative','summative','test','quiz','exam','project','deadline','assignment','presentation','other'])kind.append(new Option(type[0].toUpperCase()+type.slice(1),type));kind.value=linked?.kind||'test';kindLabel.append(kind);fields.append(kindLabel);
    const perform=decision=>this.save(form,'confirm_calendar_assessment',{p_event_id:row.id,p_event_version:row.row_version,p_class_id:classes.value||null,p_kind:kind.value,p_assessment_version:linked?.row_version??null,p_decision:decision},null,()=>{root.replaceChildren(el('p','Saved ✓'));});
    if(row.status==='active')fields.append(el('button',linked?'Apply calendar date':'Create assessment','btn'));
    if(linked&&row.status==='cancelled')fields.append(button('Cancel linked assessment',()=>perform('cancel')));
    fields.append(button(linked?'Keep assessment unchanged':'Keep as calendar event',()=>perform('keep')));
    form.onsubmit=event=>{event.preventDefault();if(!classes.value){status.textContent='Choose a class first.';return;}perform('confirm');};root.replaceChildren(form);
  }
}
