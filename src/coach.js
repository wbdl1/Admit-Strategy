import {Meetings} from "./meetings.js";
import {MutationQueue} from "./mutation-queue.js";
import {createdPage,splitPage} from "./page-cursor.js";
const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const label=value=>String(value??"").replaceAll("_"," ");
const button=(text,fn,secondary=true)=>{const b=document.createElement("button");b.type="button";b.className="btn"+(secondary?" secondary":"");b.textContent=text;b.onclick=fn;return b;};
const shortDate=value=>value?new Intl.DateTimeFormat(undefined,{dateStyle:"medium",...(String(value).includes("T")?{timeStyle:"short",timeZone:"Asia/Qatar"}:{timeZone:"UTC"})}).format(new Date(value)):"No date";
const studentColumns="id,profile_id,grade,summary,status,row_version,created_at,profiles!inner(display_name)";
export function coachStudentQuery(client,term,cursor){
  let query=client.from("students").select(studentColumns).is("archived_at",null);
  const name=term.trim();if(name)query=query.ilike("profiles.display_name",name.replace(/[\\%_]/g,"\\$&")+"%");
  return createdPage(query,cursor);
}
const definitions={
  sessions:{title:"Sessions",name:"title",fields:[['title','Session title','text',160],['session_date','Session date','date'],['shared_summary','Student recap','textarea',4000],['next_actions','Two or three next actions','textarea',2000]]},
  coach_notes:{title:"Private coach notes",name:"title",fields:[['title','Note title','text',160],['body','Private note','textarea',10000]]},
  progress_scores:{title:"Progress",name:"metric",fields:[['metric','Area',['study_system','consistency','direction']],['score','Score',[0,25,50,75,100]]]},
  parent_updates:{title:"Parent updates",name:"body",fields:[['body','Parent update','textarea',4000],['status','Visibility',['draft','approved']]]}
};

export class CoachAdmin {
  constructor(account){
    this.account=account;this.client=account.client;this.actorId=account.user.id;this.generation=0;this.ui=new Map();
    this.queue=new MutationQueue({
      send:(values,id)=>{if(this.disposed||account.user?.id!==this.actorId)throw Object.assign(new Error("Sign in with the original coach account before retrying."),{rejected:false,retryable:!this.disposed&&!account.user});return account.portal.rpc(values.rpc,{...values.args,p_request_key:id});},
      optimistic:job=>{const ui=this.ui.get(job.id);if(ui){ui.status.textContent="Saving…";ui.preview.textContent=ui.title+" — Saving…";ui.form.querySelector("button[type=submit]").disabled=true;}},
      confirm:(job,response)=>{const ui=this.ui.get(job.id);if(ui&&!this.disposed)ui.confirm(response.record);},
      onState:job=>this.state(job)
    });
    this.sync=document.createElement("aside");this.sync.className="info-box";this.sync.hidden=true;this.sync.setAttribute("aria-label","Coaching saves");account.gate.after(this.sync);
  }
  dispose(){this.disposed=true;this.sync.remove();}
  get unsaved(){return this.queue.unsaved;}
  canNavigate(){if(this.account.meetings&&!this.account.meetings.canLeave())return false;return !this.unsaved.length&&!this.account.gate.querySelector("form[data-dirty]")||window.confirm("There are unsaved coaching changes. Leave this view? Unconfirmed saves remain in the queue.");}
  shell(title,description){
    this.account.meetings?.dispose();this.account.meetings=null;
    this.account.show("<h1>"+escape(title)+"</h1><p>"+escape(description)+"</p><nav class='demo-actions' aria-label='Coach sections'></nav><div data-coach-content></div>");
    this.nav=this.account.gate.querySelector("nav");this.content=this.account.gate.querySelector("[data-coach-content]");
    this.account.gate.append(button("Log out",()=>this.account.logout()));
  }
  async home(section="students"){
    if(!this.canNavigate())return;
    this.generation++;this.student=null;
    this.shell("Coach Admin","Find students, review their work, and manage upcoming coaching.");
    for(const [key,title] of Object.entries({students:"Students",leads:"Leads",bookings:"Upcoming meetings",evidence:"Evidence awaiting review",communications:"Communications",claims:"Account linking",failures:"System failures"})){
      const b=button(title,()=>this.home(key));b.setAttribute("aria-current",key===section?"page":"false");this.nav.append(b);
    }
    if(section==="students"){this.search();return;}
    if(section==="bookings"){this.account.meetings=new Meetings(this.account,this.content);this.account.message("");return;}
    await this.loadHome(section);
  }
  async search(){
    this.content.innerHTML="<label>Find a student<input type='search' placeholder='Search Dylan' autocomplete='off' maxlength='120'></label><div data-results class='list'></div>";
    const input=this.content.querySelector("input"),list=this.content.querySelector("[data-results]");let timer;
    const find=async()=>{
      if(!list.isConnected||this.disposed)return;
      ++this.generation;const term=input.value;
      list.replaceChildren();this.account.message("");
      await this.pages(cursor=>this.account.portal.result(coachStudentQuery(this.client,term,cursor)),(s,parent)=>{
        parent.append(button(s.profiles.display_name+" · Grade "+(s.grade||"—")+" · "+label(s.status),()=>this.studentHome(s)));
      },{parent:list,empty:"No matching students."});
    };input.oninput=()=>{clearTimeout(timer);++this.generation;timer=setTimeout(find,150);};await find();
  }
  async loadHome(section){
    const generation=++this.generation;this.account.message("Loading…");
    try{
      if(section==='evidence'){
        this.content.replaceChildren();
        await this.pages(cursor=>this.account.portal.rpc('coach_pending_evidence',{p_after_created_at:cursor?.created_at||null,p_after_id:cursor?.id||null}),(row,parent)=>{
          const card=this.card(row.activity,parent);this.text(card,shortDate(row.created_at));card.append(button('Open student',()=>this.openStudentId(row.student_id)));
        },{empty:'No evidence awaiting review.'});
        if(generation===this.generation)this.account.message('Evidence review queue loaded.');return;
      }
      let rows;
      if(section==="claims")rows=await this.account.portal.rpc("admin_pending_account_claims",{});
      else {
        const table={leads:"leads",bookings:"bookings",communications:"communication_events",failures:"communication_events"}[section];
        let query=this.client.from(table).select(section==="communications"||section==="failures"?"*,communication_templates(subject)":"*").is("archived_at",null).limit(25);
        if(section==="bookings")query=query.eq("status","booked").gte("starts_at",new Date().toISOString()).order("starts_at");
        else query=query.order("created_at",{ascending:false});
        if(section==="failures")query=query.in("status",["failed","uncertain","bounced"]);
        rows=await this.account.portal.result(query);
      }
      if(generation!==this.generation)return;this.content.replaceChildren();
      if(section==="communications"||section==="failures")this.note("Delivery states below come from the queue. Local development captures emails; a production sender is not yet enabled.");
      for(const row of rows){
        const card=this.card(row.contact_name||row.activity||row.display_name||row.communication_templates?.subject||"Meeting");
        this.text(card,section==="claims"?row.email:row.starts_at?shortDate(row.starts_at)+" · "+label(row.status):label(row.status||"Pending"));
        if(row.error_code)this.text(card,"Error "+row.error_code+" · Reference "+row.trace_id);
        if(row.student_id)card.append(button("Open student",()=>this.openStudentId(row.student_id)));
        if(section==="claims"){
          const confirm=document.createElement("label");confirm.innerHTML="<input type='checkbox'> I verified that this account belongs to the student whose existing records are shown.";card.append(confirm);
          card.append(button("Link verified account",async event=>{
            if(!confirm.querySelector("input").checked){this.account.message("Verify the student’s identity before linking the account.",true);return;}
            await this.account.run(event.currentTarget,async()=>{await this.account.portal.rpc("admin_approve_account_claim",{p_claim_id:row.claim_id});card.remove();this.account.message("Account linked.");});
          },false));
        }
      }
      this.account.message(rows.length?"Up to 25 recent records. Open a student for their full coaching record.":"No records in this view.");
    }catch(error){this.account.message(error.message,true);this.content.append(button("Retry loading",()=>this.loadHome(section)));}
  }
  async openStudentId(id){
    try{const student=await this.account.portal.result(this.client.from("students").select(studentColumns).eq("id",id).single());await this.studentHome(student);}
    catch(error){this.account.message(error.message,true);}
  }
  async studentHome(student,section="overview"){
    if(!this.canNavigate())return;
    this.student=student;this.shell(student.profiles.display_name,"Coaching record · Grade "+(student.grade||"—")+" · "+label(student.status));
    this.nav.append(button("All students",()=>this.home()),button("Open student workspace",()=>this.account.openStudent(student),false),button("Account and access",()=>this.account.accountAccess(student.id)));
    const sections={overview:"Overview",profile:"Profile",bookings:"Meetings",evidence:"Evidence",sessions:"Sessions",coach_notes:"Private notes",progress_scores:"Progress",parent_updates:"Parent updates",communications:"Communications"};
    for(const [key,title] of Object.entries(sections)){const b=button(title,()=>this.studentHome(this.student,key));b.setAttribute("aria-current",key===section?"page":"false");this.nav.append(b);}
    const generation=++this.generation;this.account.message("Loading coaching record…");
    try{
      if(section==="bookings")this.account.meetings=new Meetings(this.account,this.content,{studentId:student.id,coaching:true});
      else if(section==="profile")await this.profileForm();
      else if(section==="overview"){
        this.note("Use Open student workspace for Today, classes, assessments, tasks, planner, materials, reviews, weak points and projects. Edits are shared with the student.");
        const [diagnoses,bookings]=await Promise.all([
          this.account.portal.result(this.client.from("diagnoses").select("result_summary,created_at").eq("student_id",student.id).is("archived_at",null).order("created_at",{ascending:false}).limit(5)),
          this.account.portal.result(this.client.from("bookings").select("starts_at,status,location").eq("student_id",student.id).is("archived_at",null).order("starts_at",{ascending:false}).limit(10))
        ]);if(generation!==this.generation)return;
        for(const diagnosis of diagnoses)this.text(this.card("Diagnosis · "+shortDate(diagnosis.created_at)),diagnosis.result_summary);
        for(const booking of bookings)this.text(this.card("Meeting · "+shortDate(booking.starts_at)),label(booking.status)+" · "+booking.location);
        if(!diagnoses.length&&!bookings.length)this.note("No diagnosis or meeting recorded yet.");
      }else if(section==="evidence")await this.evidence();
      else if(section==="communications"){
        const rows=await this.account.portal.result(this.client.from("communication_events").select("status,created_at,not_before,error_code,communication_templates(subject)").eq("student_id",student.id).is("archived_at",null).order("created_at",{ascending:false}).limit(25));if(generation!==this.generation)return;
        rows.forEach(row=>this.text(this.card(row.communication_templates?.subject||"Communication"),label(row.status)+" · "+shortDate(row.created_at)));
        if(!rows.length)this.note("No communications recorded for this student.");
      }else await this.records(section);
      if(generation===this.generation)this.account.message("Coaching record loaded.");
    }catch(error){if(generation!==this.generation)return;this.account.message(error.message,true);this.content.append(button("Retry loading",()=>this.studentHome(student,section)));}
  }
  async pages(load,render,{parent=this.content,empty="No records yet."}={}){
    const generation=this.generation,region=document.createElement('div'),status=document.createElement('p');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    let cursor=null,busy=false;const seen=new Set();
    const more=button('Load more',()=>next());parent.append(region,status,more);
    const active=()=>!this.disposed&&generation===this.generation&&region.isConnected;
    const next=async()=>{
      if(busy||!active())return;busy=true;more.disabled=true;status.textContent='Loading records…';
      try{
        const page=splitPage(await load(cursor));if(!active())return;
        for(const row of page.records)if(!seen.has(row.id)){render(row,region);seen.add(row.id);}
        cursor=page.cursor;more.hidden=!cursor;more.textContent='Load more';
        status.textContent=seen.size?(cursor?seen.size+' records shown. More are available.':'All '+seen.size+' records loaded.'):empty;
      }catch(error){if(active()){status.textContent='Could not load these records. '+error.message;more.hidden=false;more.textContent='Retry loading';}}
      finally{busy=false;if(active())more.disabled=false;}
    };
    await next();
  }
  note(text){const p=document.createElement("p");p.className="form-help";p.textContent=text;this.content.append(p);}
  text(parent,value){const p=document.createElement("p");p.textContent=value||"—";p.style.whiteSpace="pre-wrap";parent.append(p);}
  card(title,parent=this.content){const card=document.createElement("article");card.className="card";card.innerHTML="<h2>"+escape(title)+"</h2>";parent.append(card);return card;}
  form(parent,fields,record={},submit){
    const form=document.createElement("form");form.className="portal-form";
    for(const [key,title,type,max] of fields){
      const wrapper=document.createElement("label");wrapper.textContent=title;
      const input=document.createElement(Array.isArray(type)?"select":type==="textarea"?"textarea":"input");input.name=key;
      if(Array.isArray(type))for(const option of type){const el=document.createElement("option");el.value=option;el.textContent=label(option);input.append(el);}else if(type!=="textarea")input.type=type;
      if(max)input.maxLength=max;input.required=!['session_date','shared_summary','next_actions','summary'].includes(key);input.value=record[key]??(Array.isArray(type)?type[0]:"");wrapper.append(input);form.append(wrapper);
    }
    const save=button("Save",()=>{},false);save.type="submit";const status=document.createElement("p");status.setAttribute("role","status");status.setAttribute("aria-live","polite");form.append(save,status);
    form.oninput=()=>{form.dataset.dirty="true";form.dataset.revision=String(Number(form.dataset.revision||0)+1);};
    form.onsubmit=event=>{event.preventDefault();if(form.reportValidity())submit(Object.fromEntries(new FormData(form)),form,status);};parent.append(form);return form;
  }
  save({rpc="save_record",args,title,form,status,preview,confirm}){
    const id=crypto.randomUUID();this.ui.set(id,{title,form,status,preview,confirm,revision:form.dataset.revision});
    this.queue.enqueue({rpc,args},{id,key:args.p_record_id||args.p_student_id});
  }
  state(job){
    if(this.disposed)return;
    const ui=this.ui.get(job.id);if(!ui)return;
    if(job.state==="saved"){
      ui.status.textContent="Saved ✓";ui.preview.textContent=ui.title;if(ui.revision===ui.form.dataset.revision)delete ui.form.dataset.dirty;ui.form.querySelector("button[type=submit]").disabled=false;
    }else if(job.state==="failed"){
      ui.status.replaceChildren(document.createTextNode("Save "+(job.error.rejected?"rejected":"unconfirmed")+". Your input is kept. "+job.error.message));
      ui.preview.textContent=ui.title+" — "+(job.error.rejected?"Not saved":"Save unconfirmed");
      if(job.error.retryable!==false)ui.status.append(button("Retry save",()=>this.queue.retry(job.id)));
      if(job.error.code==="P0409")ui.status.append(button("Compare latest saved version",()=>this.compareLatest(job,ui)));
      ui.form.querySelector("button[type=submit]").disabled=!job.error.rejected;
    }else if(job.state==="superseded"){ui.status.textContent="Rejected change dismissed. Your draft is unchanged.";}else ui.status.textContent=job.state==="retrying"?"Saving… retrying safely.":"Saving…";
    this.sync.hidden=!this.unsaved.length||this.account.user?.id!==this.actorId;this.sync.replaceChildren();
    for(const pending of this.unsaved){
      const row=document.createElement("p");row.textContent=pending.state==="failed"?(pending.error.rejected?"A coaching change was rejected. Your draft is kept.":"A coaching save is unconfirmed. Retry the same request."):"Saving coaching changes…";
      if(pending.state==="failed"&&pending.error.retryable!==false)row.append(button("Retry coaching save",()=>this.queue.retry(pending.id)));
      if(pending.state==="failed"&&pending.error.rejected)row.append(button("Dismiss rejected change",()=>{pending.state="superseded";this.state(pending);}));
      this.sync.append(row);
    }
  }
  async compareLatest(job,ui){
    try{
      const args=job.values.args;
      const latest=job.values.rpc==="coach_update_student_profile"?await this.account.portal.rpc("coach_student_profile",{p_student_id:args.p_student_id}):await this.account.portal.result(this.client.from(args.p_table).select("*").eq("id",args.p_record_id).eq("student_id",args.p_student_id).single());
      const comparison=document.createElement("details");comparison.open=true;comparison.innerHTML="<summary>Latest saved version</summary>";
      const values=job.values.rpc==="coach_update_student_profile"?{name:latest.profile.display_name,grade:latest.student.grade,summary:latest.student.summary}:Object.fromEntries(Object.keys(args.p_values).map(key=>[key,latest[key]]));
      for(const [key,value] of Object.entries(values))this.text(comparison,label(key)+": "+(value??"—"));
      comparison.append(button("Keep my draft and use this version",()=>{ui.confirm(latest);comparison.remove();ui.status.textContent="Your draft is unchanged. Review it, then Save to replace the values shown above.";}));ui.status.append(comparison);
    }catch(error){ui.status.append(document.createTextNode("Could not load the latest version: "+error.message));}
  }
  async records(table){
    const definition=definitions[table],studentId=this.student.id;
    if(table==="coach_notes")this.note("These notes are private to authorized coaches. They are never copied into a student recap or parent email.");
    if(table==="parent_updates")this.note("Drafts are private. Approved updates become visible in the authorized student and family workspace. Saving does not send email.");
    const render=(record,parent)=>{
      const card=this.card(record.id?label(record[definition.name]).slice(0,100):"Add "+definition.title.toLowerCase(),parent);
      const preview=card.querySelector("h2");let current=record;
      this.form(card,definition.fields,current,(values,form,status)=>{
        if(table==="progress_scores")values.score=Number(values.score);
        if(table==="sessions"&&!values.session_date)values.session_date=null;
        const recordId=current.id||crypto.randomUUID();
        this.save({args:{p_table:table,p_student_id:studentId,p_record_id:recordId,p_values:values,p_expected_version:current.row_version??null},title:label(values[definition.name]).slice(0,100),form,status,preview,confirm:saved=>{current=saved;}});
      });
    };render({});await this.pages(cursor=>this.account.portal.result(createdPage(this.client.from(table).select('*').eq('student_id',studentId).is('archived_at',null),cursor)),render);
  }
  async profileForm(){
    const student=this.student,studentId=student.id,generation=this.generation;let current=await this.account.portal.rpc("coach_student_profile",{p_student_id:studentId});
    if(generation!==this.generation||this.student?.id!==studentId)return;
    this.note("Verified student email: "+(current.email||"No verified contact recorded"));
    current.guardians.forEach(g=>this.note("Guardian: "+g.name+" · "+g.email+" · "+(g.approved?"Approved":"Approval required")));
    if(!current.guardians.length)this.note("No approved guardian relationship. Guardian approval must be completed from the guardian’s verified account.");
    const card=this.card("Student profile"),preview=card.querySelector("h2");
    this.form(card,[["name","Student name","text",120],["grade","Grade",[6,7,8,9,10,11,12]],["summary","Student-facing summary","textarea",2000]],{name:current.profile.display_name,grade:current.student.grade,summary:current.student.summary},(values,form,status)=>{
      this.save({rpc:"coach_update_student_profile",args:{p_student_id:studentId,p_name:values.name,p_grade:Number(values.grade),p_summary:values.summary,p_student_version:current.student.row_version,p_profile_version:current.profile.row_version},title:values.name,form,status,preview,confirm:saved=>{current=saved;Object.assign(student,saved.student,{profiles:{display_name:saved.profile.display_name}});}});
    });
  }
  async evidence(){
    const studentId=this.student.id;
    await this.pages(cursor=>this.account.portal.result(createdPage(this.client.from('evidence').select('*,evidence_reviews(*)').eq('student_id',studentId).eq('status','submitted').is('archived_at',null),cursor)),(row,parent)=>{
      const card=this.card(row.activity,parent),preview=card.querySelector("h2");this.text(card,row.what_i_did);this.text(card,row.proof_text);
      if(row.proof_url&&/^https:\/\//.test(row.proof_url)){const link=document.createElement("a");link.href=row.proof_url;link.textContent="Open submitted proof";link.target="_blank";link.rel="noopener noreferrer";card.append(link);}
      let review=row.evidence_reviews?.[0]||{};
      if(review.id&&(review.archived_at||Number(review.evidence_version)!==Number(row.row_version)))this.text(card,'This proof needs a new review. The previous decision applied to an earlier version.');
      this.form(card,[["status","Review decision",["approved","changes_requested"]],["feedback","Feedback the student can see","textarea",2000]],review,(values,form,status)=>{
        this.save({args:{p_table:"evidence_reviews",p_student_id:studentId,p_record_id:review.id||crypto.randomUUID(),p_values:{...values,evidence_id:row.id,evidence_version:row.row_version,archived_at:null},p_expected_version:review.row_version??null},title:row.activity+" · "+label(values.status),form,status,preview,confirm:saved=>{review=saved;}});
      });
    },{empty:'No submitted evidence yet.'});
  }
}
