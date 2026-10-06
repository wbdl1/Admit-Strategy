import {celebrate} from "./celebration.js";
import {createClient} from "@supabase/supabase-js";
import {PortalData} from "./portal-data.js";
import {boundedFetch} from "./network.js";
import {readDiagnosisDraft,clearDiagnosisDraft,diagnosisRequest} from "./diagnosis.js";

const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const action=(label,fn,secondary=false)=>{const b=document.createElement("button");b.type="button";b.className="btn"+(secondary?" secondary":"");b.textContent=label;b.onclick=fn;return b;};

export class AccountExperience {
  constructor({config,root,onPortal,onAccountChange=()=>{},onMeetingChange=()=>{},onSessionChange=()=>{},hasPendingChanges=()=>false}){
    this.config=config;this.root=root;this.onPortal=onPortal;this.onAccountChange=onAccountChange;
    this.hasPendingChanges=hasPendingChanges;
    this.onMeetingChange=onMeetingChange;
    this.onSessionChange=onSessionChange;
    this.diagnosisId=new URL(location.href).searchParams.get("diagnosis");
    try{this.diagnosis=readDiagnosisDraft(localStorage,this.diagnosisId);}catch{this.diagnosis=null;}
    this.client=createClient(config.supabaseUrl,config.publishableKey,{global:{fetch:boundedFetch()},auth:{flowType:"pkce",persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    this.portal=new PortalData(this.client,{onAuthRequired:()=>this.suspendSession()});
    this.gate=document.createElement("section");this.gate.className="hero account-gate";this.gate.setAttribute("aria-label","Account access");root.before(this.gate);
    this.toolbar=document.createElement("nav");this.toolbar.className="demo-actions account-toolbar";this.toolbar.setAttribute("aria-label","Account");root.before(this.toolbar);
    this.client.auth.onAuthStateChange((event,session)=>this.authChanged(event,session));
  }
  authChanged(event,session){
    if(event==="SIGNED_OUT"||(event==="SIGNED_IN"&&this.user&&session?.user?.id!==this.user.id))this.suspendSession();
    if(["SIGNED_IN","SIGNED_OUT","INITIAL_SESSION"].includes(event))setTimeout(()=>this.refresh(),0);
  }
  async start(){
    const url=new URL(location.href),callback=url.searchParams.has("code")||url.searchParams.has("error")||url.searchParams.has("error_code")||url.hash.includes("error=")||url.hash.includes("error_code=");
    const fragment=new URLSearchParams(url.hash.slice(1)),code=url.searchParams.get("error_code")||fragment.get("error_code"),error=url.searchParams.get("error")||fragment.get("error");
    let initializationFailed=false;
    try{initializationFailed=Boolean((await this.client.auth.initialize())?.error);}catch{initializationFailed=true;}
    if(callback){
      // Strip credentials even when initialization fails. Keep the intended diagnosis/booking route.
      const clean=new URL(location.href);for(const key of ["code","sb_flow_id","error","error_code","error_description","sb"])clean.searchParams.delete(key);clean.hash="";
      history.replaceState(history.state,"",clean);
    }
    await this.refresh();
    if(!this.user&&(callback||initializationFailed)){
      const text=code==="flow_state_expired"||code==="flow_state_not_found"
        ?"This sign-in attempt has expired. Try Google again or request a new email sign-in link below."
        :code==="otp_expired"||(!error&&!initializationFailed)
        ?"This sign-in link has expired or cannot be used in this browser. Request a new link below and open it in the same browser."
        :error==="access_denied"&&!code
        ?"Sign-in was cancelled or declined. Try Google again or request an email sign-in link below."
        :"Sign-in could not be completed. Check your connection, then try Google again or request a new email sign-in link.";
      // Provider-supplied descriptions are untrusted and can contain sensitive details.
      this.message(text,true);
    }
  }
  message(text,error=false){const target=this.gate.querySelector("[data-account-status]");if(target){target.textContent=text;target.setAttribute("role",error?"alert":"status");}}
  async run(button,fn){
    const original=button.textContent;button.disabled=true;button.textContent="Please wait…";
    try{await fn();}catch(error){this.message(error.message||"Could not complete this step. Your input is kept.",true);}
    finally{button.disabled=false;button.textContent=original;}
  }
  show(html){this.root.hidden=true;this.toolbar.hidden=true;this.gate.hidden=false;this.gate.innerHTML=html+"<p data-account-status role='status' aria-live='polite'></p>";}
  login(){
    if(this.gate.querySelector("[data-login]")&&!this.gate.hidden)return;
    this.show("<h1>Log in to Admit Strategy</h1><p>Your classes, next actions, and coaching in one private workspace.</p><div data-google-login></div><form data-login class='portal-form'><label>Email<input name='email' type='email' autocomplete='email' required maxlength='254'></label><button class='btn' type='submit'>Email me a sign-in link</button></form><p class='form-help'>We’ll send a secure link. Open it in this browser to continue.</p><p><a href='index.html?diagnosis=1'>Start with the 60-second diagnosis</a> · <a href='privacy.html'>Privacy</a></p>");
    if(this.diagnosis){
      this.gate.querySelector("h1").textContent="Save your diagnosis and book your first meeting";
      this.gate.querySelector("input[name=email]").value=this.diagnosis.email;
      this.gate.querySelector("input[name=email]").readOnly=true;
      const note=document.createElement("p");note.textContent="Sign in with the student’s account. Your diagnosis is kept in this browser for up to 24 hours while you finish. Guardian approval happens separately from the guardian’s own account.";this.gate.querySelector("form").before(note);
    }else if(this.diagnosisId){this.message("This diagnosis draft has expired or is unavailable in this browser. You can sign in to your existing workspace, or start the diagnosis again.",true);}
    if(this.config.googleEnabled){this.gate.querySelector("[data-google-login]").append(action("Continue with Google",async event=>this.run(event.currentTarget,async()=>{
      const recovering=Boolean(this.suspendedView);
      const {data,error}=await this.client.auth.signInWithOAuth({provider:"google",options:{redirectTo:this.redirectUrl(),queryParams:{prompt:"select_account"},...(recovering?{skipBrowserRedirect:true}:{})}});if(error)throw error;
      if(recovering){
        const link=document.createElement("a");link.href=data.url;link.target="_blank";link.rel="noopener noreferrer";link.className="btn";link.textContent="Open Google sign-in in another tab";
        this.gate.querySelector("[data-google-login]").replaceChildren(link);
      }
    })));}
    if(this.suspendedView){const note=document.createElement("p");note.textContent="Your unfinished work is kept in this tab. Leave it open and sign in with the same account in another tab of this browser, then return here.";this.gate.querySelector("form").before(note);}
    const form=this.gate.querySelector("[data-login]");form.onsubmit=event=>{event.preventDefault();this.run(form.querySelector("button"),async()=>{
      if(!form.reportValidity())return;
      const {error}=await this.client.auth.signInWithOtp({email:form.elements.email.value.trim(),options:{emailRedirectTo:this.redirectUrl()}});if(error)throw error;
      this.message("Check your email for the sign-in link. You can keep this page open.");
    });};
  }
  redirectUrl(){const next=new URL("portal.html",location.href);if(this.diagnosis)next.searchParams.set("diagnosis",this.diagnosis.id);else if(new URL(location.href).searchParams.get("book")==="1")next.searchParams.set("book","1");return next.href;}
  suspendSession(){
    if(this.user&&!this.suspendedView&&(!this.root.hidden||(!this.gate.hidden&&this.coach?.content?.isConnected)))this.suspendedView={actorId:this.user.id,nodes:Array.from(this.gate.childNodes),gateHidden:this.gate.hidden,rootHidden:this.root.hidden,toolbarHidden:this.toolbar.hidden};
    this.user=null;
    this.onSessionChange?.("suspended");
    if(this.coach?.sync)this.coach.sync.hidden=true;
    this.login();
  }
  async refresh(){
    if(this.refreshing)return this.refreshing;
    this.refreshing=this.refreshAccount().catch(error=>{this.suspendSession();this.message(error.message||"Could not load your account. Try again.",true);}).finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async refreshAccount(){
    const {data,error}=await this.client.auth.getUser();
    if(error||!data.user){this.suspendSession();return;}
    const user=data.user;
    const previousActor=this.suspendedView?.actorId||this.loadedUser||this.user?.id;
    if(previousActor&&previousActor!==user.id){
      this.suspendedView=null;this.loadedUser=null;this.user=null;
      this.coach?.dispose();this.coach=null;this.access?.dispose();this.meetings?.dispose();this.meetings=null;
      this.onSessionChange?.("cleared");this.root.replaceChildren();
      this.portal=new PortalData(this.client,{onAuthRequired:()=>this.suspendSession()});
    }
    if(this.diagnosis && user.email?.toLowerCase()!==this.diagnosis.email){
      this.user=user;
      this.show("<h1>Use the student’s account</h1><p>This diagnosis belongs to the student email you entered. Sign out of the current account, then sign in with that email to keep each student’s records separate.</p>");
      this.gate.append(action("Log out and continue",()=>this.logout()),action("Return to website",()=>location.assign("index.html"),true));return;
    }
    if(this.suspendedView?.actorId===user.id&&!this.diagnosis){
      const view=this.suspendedView;this.suspendedView=null;this.user=user;
      this.gate.replaceChildren(...view.nodes);this.gate.hidden=view.gateHidden;this.root.hidden=view.rootHidden;this.toolbar.hidden=view.toolbarHidden;
      if(this.coach?.sync)this.coach.sync.hidden=!this.coach.unsaved.length;
      this.onSessionChange?.("resumed");return;
    }
    // Supabase can announce SIGNED_IN again when a tab regains focus.
    // Keep the current coaching form and its drafts for the same verified actor.
    if(this.user?.id===user.id && this.coach?.content?.isConnected && !this.gate.hidden && !this.diagnosis)return;
    if(this.loadedUser===user.id && this.portal.studentId&&!this.diagnosis){this.user=user;this.gate.hidden=true;this.root.hidden=false;this.toolbar.hidden=false;return;}
    this.show("<h1>Opening your workspace…</h1><p>Checking your account and permissions.</p>");
    const account=await this.portal.rpc("bootstrap_account",{p_display_name:"New account"});this.account=account;
    const roles=await this.portal.result(this.client.from("profile_roles").select("roles(code)").eq("profile_id",account.profile_id).is("archived_at",null));
    this.roles=roles.map(r=>r.roles?.code).filter(Boolean);this.user=user;
    if(this.diagnosis){await this.finishDiagnosis();return;}
    if(this.roles.some(r=>["coach","admin"].includes(r))){
      // Coaching access is not guardian consent. Show only invitations addressed
      // to this verified identity, never the coach's whole student directory.
      const requests=await this.portal.rpc("guardian_requests",{});
      if(requests.length){this.guardianHome([],requests);return;}
      await this.adminHome();return;
    }
    const students=await this.portal.result(this.client.from("students").select("id,profile_id,grade,summary,status,profiles!inner(display_name)").is("archived_at",null).limit(20));
    const own=students.find(s=>s.profile_id===account.profile_id);
    const requests=await this.portal.rpc("guardian_requests",{});
    // An existing personal workspace must not hide a guardian invitation or
    // another explicitly authorized family workspace.
    if(requests.length||students.some(s=>s.profile_id!==account.profile_id)){this.guardianHome(students,requests);return;}
    if(own){await this.openStudent(own);return;}
    this.onboarding();
  }
  async finishDiagnosis(){
    this.show("<h1>Saving your diagnosis…</h1><p>Finding or creating your student workspace.</p>");
    try{
      const requestId=this.diagnosis.id;
      const result=await this.portal.rpc("complete_diagnosis",diagnosisRequest(this.diagnosis,this.user.email));
      if(result?.ok!==true||!result.student_id)throw new Error("The saved diagnosis could not be confirmed. Retry the same request.");
      const student=await this.portal.result(this.client.from("students").select("id,profile_id,grade,summary,status,profiles!inner(display_name)").eq("id",result.student_id).single());
      this.roles=Array.from(new Set([...this.roles,"student"]));
      await this.openStudent(student);
      const summary=this.diagnosis.answers.result_summary;
      try{clearDiagnosisDraft(localStorage,this.diagnosis.id);}catch{}
      this.diagnosis=null;this.diagnosisId=null;
      const clean=new URL(location.href);clean.searchParams.delete("diagnosis");clean.searchParams.delete("book");clean.searchParams.delete("code");history.replaceState(history.state,"",clean);
      this.show("<h1>Your diagnosis is saved</h1><p>"+safe(summary)+"</p><p>"+(result.reused?"Your existing workspace is ready.":"Your student workspace is ready.")+" Book your free first meeting to choose the next practical steps.</p>"+(student.status==="pending_guardian"?"<p>Your guardian can log in using the email you supplied to approve academic editing. You can book the meeting now.</p>":""));
      this.gate.append(action("Book your free first meeting",()=>this.booking()),action("Open your portal",()=>this.showWorkspace(),true));
      celebrate("diagnosis:"+requestId);
    }catch(error){
      this.show("<h1>Your diagnosis is kept</h1><p>We could not confirm that it was saved. Retry to check the same request safely.</p>");this.message(error.message,true);
      this.gate.append(action("Retry saving diagnosis",event=>this.run(event.currentTarget,()=>this.finishDiagnosis())),action("Log out",()=>this.logout(),true));
    }
  }
  legacyNotice(){
    return this.account?.legacy_review_pending?"<p class='info-box'>Older records may be available to import after ownership verification. You can use this workspace now; older records remain private until reviewed. Guardian approval is separate.</p>":"";
  }
  onboarding(){
    let draft={};try{draft=JSON.parse(sessionStorage.getItem("admit-onboarding")||"{}");}catch{}
    this.show("<h1>Start your student workspace</h1><p>One account. One workspace. We’ll reuse it whenever you return.</p>"+this.legacyNotice()+"<form data-onboarding class='portal-form'><label>Student name<input name='name' autocomplete='name' maxlength='120' required value='"+safe(draft.name)+"'></label><label>Grade<select name='grade' required>"+[6,7,8,9,10,11,12].map(n=>"<option value='"+n+"'"+(Number(draft.grade)===n?" selected":"")+">Grade "+n+"</option>").join("")+"</select></label><label>Parent or guardian email<input name='guardian' type='email' autocomplete='off' maxlength='254' required value='"+safe(draft.guardian)+"'></label><p class='form-help'>Use a different email from your own. Your guardian must approve academic editing from their own account.</p><button class='btn' type='submit'>Create or open my workspace</button></form>");
    const form=this.gate.querySelector("form");
    form.oninput=()=>{try{sessionStorage.setItem("admit-onboarding",JSON.stringify({name:form.elements.name.value,grade:form.elements.grade.value,guardian:form.elements.guardian.value}));}catch{/* The form remains usable when browser storage is unavailable. */}};
    form.onsubmit=event=>{event.preventDefault();this.run(form.querySelector("button"),async()=>{
      if(!form.reportValidity())return;
      const payload={p_name:form.elements.name.value.trim(),p_grade:Number(form.elements.grade.value),p_guardian_email:form.elements.guardian.value.trim()};
      const signature=JSON.stringify(payload);if(this.onboardingSignature!==signature){this.onboardingSignature=signature;this.onboardingKey=crypto.randomUUID();}
      const result=await this.portal.rpc("complete_student_onboarding",{...payload,p_request_key:this.onboardingKey});
      const student=await this.portal.result(this.client.from("students").select("id,profile_id,grade,summary,status,profiles!inner(display_name)").eq("id",result.student_id).single());
      await this.openStudent(student);try{sessionStorage.removeItem("admit-onboarding");}catch{}this.booking();
    });};
    this.gate.append(action("Log out",()=>this.logout(),true));
  }
  guardianHome(students,requests){
    this.show("<h1>Your family’s workspaces</h1><p>Only students who authorize you appear here.</p>"+this.legacyNotice());
    if(!students.some(student=>student.profile_id===this.account.profile_id)&&!this.roles.some(role=>["coach","admin"].includes(role)))this.gate.append(action("Start my student workspace",()=>this.onboarding(),true));
    if(this.roles.some(r=>["coach","admin"].includes(r)))this.gate.append(action("Coach Admin",()=>this.adminHome(),true));
    for(const student of students)this.gate.append(action("Open "+student.profiles.display_name,()=>this.openStudent(student)));
    for(const request of requests){const card=document.createElement("div");card.className="card";card.innerHTML="<h2>"+safe(request.student_name)+" · Grade "+safe(request.grade)+"</h2><label><input type='checkbox'> I am this student’s parent or authorized guardian and approve the use of Admit Strategy under its <a href='privacy.html'>privacy notice</a>.</label>";
      card.append(action("Approve workspace",event=>this.run(event.currentTarget,async()=>{if(!card.querySelector("input").checked)throw new Error("Confirm that you are the authorized guardian first.");await this.portal.rpc("approve_guardian_request",{p_request_id:request.request_id,p_authorized_guardian:true});await this.refreshAccount();})));this.gate.append(card);
    }
    this.gate.append(action("Log out",()=>this.logout(),true));
  }
  async openStudent(student){
    const generation=this.workspaceGeneration=(this.workspaceGeneration||0)+1,actor=this.user.id;
    this.show("<h1>Opening Today…</h1><p>Loading your next assessment and actions.</p>");
    // A new adapter binds in-flight work to its original student. Sharing one
    // mutable adapter across coach/guardian workspaces can retarget a retry.
    const adapter=new PortalData(this.client,{onAuthRequired:()=>this.suspendSession()});
    const data=await adapter.open(student);
    if(generation!==this.workspaceGeneration||actor!==this.user?.id)return;
    this.portal=adapter;this.loadedUser=this.user.id;
    this.ownStudentId=student.profile_id===this.account.profile_id?student.id:null;
    this.portal.canEdit=this.roles.some(r=>["coach","admin"].includes(r)) || (student.profile_id===this.account.profile_id && student.status==="active");
    this.onPortal(data,this.portal);this.gate.hidden=true;this.root.hidden=false;this.toolbar.hidden=false;
    this.toolbar.replaceChildren(action("Log out",()=>this.logout(),true));
    if(student.profile_id===this.account.profile_id||this.roles.some(r=>["coach","admin"].includes(r)))this.toolbar.prepend(action("Meetings",()=>this.booking()));
    if(this.roles.includes("guardian"))this.toolbar.prepend(action("Family workspaces",()=>{this.loadedUser=null;this.refresh();},true));
    if(this.roles.some(r=>["coach","admin"].includes(r))){
      this.toolbar.prepend(action("Coach Admin",()=>this.adminHome(),true));
      this.toolbar.prepend(action("Coaching record",()=>this.coach?.studentHome(student),true));
    }
    if(student.profile_id===this.account.profile_id&&this.account.legacy_review_pending){
      const notice=document.createElement("div");notice.innerHTML=this.legacyNotice();this.root.prepend(notice);
    }
    if(student.status==="pending_guardian"){
      const note=document.createElement("div");note.className="info-box";note.textContent="Your workspace is ready. Academic editing opens after your guardian logs in with the email you provided and approves access.";note.append(action("Check or correct guardian approval",()=>this.accountAccess(student.id),true));this.root.prepend(note);
    }
    this.onAccountChange(this);
    performance.measure("admit-today-useful",{start:0,end:performance.now()});
    this.root.dataset.todayUsefulMs=String(Math.round(performance.now()));
    if(!this.diagnosis)this.recordWorkspaceEvent("portal_activated");
    if(!this.diagnosis&&new URL(location.href).searchParams.get("book")==="1"){
      const clean=new URL(location.href);clean.searchParams.delete("book");history.replaceState(history.state,"",clean);this.booking();
    }
  }
  async logout(){
    if(this.access&&!this.access.canLeave())return;
    if(this.meetings&&!this.meetings.canLeave())return;
    if((this.hasPendingChanges()||this.coach?.unsaved.length||document.querySelector("form[data-dirty]"))&&!window.confirm("You have unsaved or unconfirmed changes. Stay here to finish saving, or log out and discard local input?"))return;
    const {error}=await this.client.auth.signOut();if(error){this.message("Could not log out. Please try again.",true);return;}
    this.workspaceGeneration=(this.workspaceGeneration||0)+1;
    this.access?.dispose();
    this.meetings?.dispose();this.meetings=null;
    this.coach?.dispose();this.coach=null;
    this.suspendedView=null;this.onSessionChange?.("cleared");
    this.loadedUser=null;this.user=null;this.portal.studentId=null;this.portal.data=null;this.root.replaceChildren();this.toolbar.replaceChildren();this.gate.replaceChildren();this.login();
  }
  recordWorkspaceEvent(name){
    if(this.portal.studentId&&this.portal.studentId===this.ownStudentId)this.portal.rpc("record_workspace_event",{p_student_id:this.portal.studentId,p_event:name,p_request_key:crypto.randomUUID()}).catch(()=>{});
  }
  showWorkspace(){this.gate.hidden=true;this.root.hidden=false;this.toolbar.hidden=false;this.recordWorkspaceEvent("portal_activated");}
  async accountAccess(studentId=this.portal.studentId){
    const actor=this.user?.id;const {openAccountAccess}=await import("./account-access.js");
    if(this.user?.id===actor)openAccountAccess(this,studentId);
  }
  async booking(){
    const studentId=this.portal.studentId,actor=this.user?.id;if(!studentId)return;
    this.recordWorkspaceEvent("meeting_booking_started");
    const {openMeetings}=await import("./meetings.js");
    if(this.user?.id===actor&&this.portal.studentId===studentId)openMeetings(this,{studentId,coaching:this.roles.some(r=>["coach","admin"].includes(r))});
  }
  async meetingChanged(record){
    const adapter=this.portal,actor=this.user?.id;if(adapter.studentId!==record.student_id)return;
    const current=()=>adapter===this.portal&&adapter.data&&adapter.studentId===record.student_id&&this.user?.id===actor;
    try{
      const rows=await adapter.result(this.client.from("bookings").select("starts_at").eq("student_id",record.student_id).is("archived_at",null).eq("status","booked").gte("starts_at",new Date().toISOString()).order("starts_at").limit(1));
      if(!current())return;
      adapter.data.nextMeeting=rows[0]?new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Qatar"}).format(new Date(rows[0].starts_at))+" (Qatar time)":"";
      this.onMeetingChange(adapter.data,adapter);
    }catch{if(current()){adapter.data.nextMeeting="Open Meetings to check the latest time.";this.onMeetingChange(adapter.data,adapter);}}
  }
  async adminHome(){
    this.loadedUser=null;
    const {CoachAdmin}=await import("./coach.js");
    if(!this.coach||this.coach.actorId!==this.user.id){this.coach?.dispose();this.coach=new CoachAdmin(this);}await this.coach.home();
  }
}
