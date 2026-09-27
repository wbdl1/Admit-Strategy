import {createdPage,splitPage,assessmentPage,splitAssessmentPage} from "./page-cursor.js";
const collections={classes:"classes",assessments:"assessments",tasks:"tasks",study_blocks:"planner",study_materials:"materials",review_cards:"reviewCards",weak_points:"weakPoints",projects:"projects",evidence:"evidenceWins",sessions:"sessionNotes",progress_scores:"progressHistory",calendar_sources:"calendarSources",calendar_events:"calendarEvents"};
const operationTables={class:"classes",assessment:"assessments",task:"tasks",planner:"study_blocks",material:"study_materials",reviewcard:"review_cards",weakpoint:"weak_points",project:"projects",evidence:"evidence"};
const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
const label=s=>String(s||"").replaceAll("_"," ").replace(/^./,c=>c.toUpperCase());
const status=s=>String(s||"").trim().toLowerCase().replaceAll(" ","_");
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Qatar",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export const currentEvidenceReview=proof=>proof.evidence_reviews?.find(review=>!review.archived_at&&Number(review.evidence_version)===Number(proof.row_version));

export function normalizeRecord(table,row,classes=[]){
  const record=Object.fromEntries(Object.entries(row).map(([key,value])=>[camel(key),value]));
  record._version=Number(row.row_version);record.status=label(row.status);
  record.subject=classes.find(c=>c.id===row.class_id)?.name||"";
  if(table==="classes")Object.assign(record,{defaultMinutes:row.default_minutes,status:row.archived_at?"Archived":"Active",intervals:{1:row.box1_days,2:row.box2_days,3:row.box3_days,4:row.box4_days}});
  if(table==="assessments")Object.assign(record,{date:row.due_date,time:row.due_time?.slice(0,5)||"",type:label(row.kind),classificationStatus:label(row.classification_status),confidence:label(row.confidence),importance:label(row.importance),difficulty:label(row.difficulty),sourceType:"Manual"});
  if(table==="study_blocks")Object.assign(record,{startTime:row.start_time?.slice(0,5)||"",endTime:row.end_time?.slice(0,5)||"",timeHint:row.time_hint||""});
  if(["tasks","study_blocks"].includes(table)&&row.evidence?.length){
    const proof=row.evidence[0],review=currentEvidenceReview(proof);
    Object.assign(record,{proofNote:proof.proof_text,proofUrl:proof.proof_url,coachReview:review?label(review.status):"Pending",coachFeedback:review?.feedback||""});
  }
  if(table==="study_materials")Object.assign(record,{url:row.external_url||"",fileId:row.file_id,status:row.archived_at?"Archived":"Active"});
  if(table==="evidence"){
    const review=currentEvidenceReview(row);
    Object.assign(record,{whatIDid:row.what_i_did,evidence:row.proof_text,coachReview:row.status==="draft"?"Draft":review?label(review.status):"Pending",coachFeedback:review?.feedback||""});
  }
  if(table==="sessions")Object.assign(record,{detail:[row.shared_summary,row.next_actions?"Next actions: "+row.next_actions:""].filter(Boolean).join("\n\n"),status:"Completed"});
  if(table==="progress_scores")Object.assign(record,{title:label(row.metric),sessionDate:row.scored_at.slice(0,10),progress:{[camel(row.metric)]:row.score}});
  if(table==="calendar_sources")Object.assign(record,{calendarName:row.name,provider:label(row.kind),lastSyncAt:row.last_import_at,lastSyncStatus:row.last_error_code?"Reconnect this calendar":""});
  if(table==="calendar_events")Object.assign(record,{date:row.start_date||row.starts_at?.slice(0,10),endDate:row.end_date,description:row.description});
  return record;
}

export class PortalData {
  constructor(client,{onAuthRequired=()=>{}}={}){
    this.client=client;this.onAuthRequired=onAuthRequired;this.raw=new Map();this.requests=new Map();this.conflicts=new Map();this.loaded=new Set();this.loading=new Map();
  }
  async result(query){
    const result=await query;
    if(!result.error)return result.data;
    const code=result.error.code||"NETWORK_ERROR",http=result.status||0;
    if(http===401||code==="PGRST301")this.onAuthRequired();
    const retryable=!http||http===401||http===429||http>=500;
    const rejected=!retryable;
    const message=code==="P0409"?(result.error.message||"This record changed. Review the latest version before saving again."):http===401?"Sign in again to finish saving.":retryable?"The connection was interrupted. Your changes are kept here.":result.error.message||"This change could not be saved.";
    throw Object.assign(new Error(message),{code,retryable,rejected,traceId:crypto.randomUUID()});
  }
  rpc(name,args){return this.result(this.client.rpc(name,args));}
  async open(student){
    this.studentId=student.id;this.student=student;this.raw.clear();this.loaded.clear();this.loading.clear();
    this.assessmentCursor=undefined;this.assessmentsFrom=today();this.assessmentLoading=null;
    this.data={student:{id:student.id,name:student.profiles?.display_name||"Student",summary:student.summary||"",grade:student.grade},accountStatus:student.status,plan:"Free",planStatus:"Active",progress:{},progressHistory:[],portalReminders:false};
    Object.values(collections).forEach(key=>this.data[key]=[]);
    await this.read("classes",{limit:100});
    await Promise.all([
      this.loadUpcomingAssessments(60),
      this.read("tasks",{order:"due_date",limit:60,filter:q=>q.or('status.in.(not_started,in_progress,submitted),and(status.eq.completed,proof_required.neq."")')}),
      this.read("review_cards",{order:"next_review",limit:60,filter:q=>q.lt("box",5)}),
      this.read("study_blocks",{order:"date",limit:60,filter:q=>q.gte("date",today())})
    ]);
    this.loaded.add("today");return this.data;
  }
  async loadUpcomingAssessments(size=25){
    if(this.assessmentCursor===null)return;
    if(this.assessmentLoading)return this.assessmentLoading;
    this.assessmentLoading=(async()=>{
      const query=this.query('assessments').eq('status','upcoming').eq('classification_status','confirmed').gte('due_date',this.assessmentsFrom);
      const page=splitAssessmentPage(await this.result(assessmentPage(query,this.assessmentCursor,size)),size);
      this.ingest('assessments',page.records);this.assessmentCursor=page.cursor;
    })();
    try{await this.assessmentLoading;}finally{this.assessmentLoading=null;}
  }
  ingest(table,rows,{confirmed=false}={}){
    if(!collections[table])return;
    const list=this.data[collections[table]];
    for(const row of rows){
      const cached=this.raw.get(table+":"+row.id);
      if(!confirmed && (Number(cached?.row_version)>Number(row.row_version) || this.isPending?.(row.id)))continue;
      this.raw.set(table+":"+row.id,row);
      const normalized=normalizeRecord(table,row,this.data.classes),index=list.findIndex(r=>r.id===row.id);
      if(index<0)list.push(normalized);else Object.assign(list[index],normalized);
    }
    return rows.map(row=>normalizeRecord(table,row,this.data.classes));
  }
  query(table){
    if(!Object.hasOwn(collections,table))throw new Error("Unknown workspace collection");
    const withProof=["tasks","study_blocks"].includes(table);
    let query=this.client.from(table).select(withProof?"*,evidence(id,row_version,proof_text,proof_url,created_at,evidence_reviews(status,feedback,created_at,evidence_version))":table==='evidence'?'*,evidence_reviews(*)':"*").eq("student_id",this.studentId).is("archived_at",null);
    if(withProof)query=query.is("evidence.archived_at",null).eq("evidence.status","submitted").order("created_at",{referencedTable:"evidence",ascending:false}).limit(1,{referencedTable:"evidence"}).is("evidence.evidence_reviews.archived_at",null).order("created_at",{referencedTable:"evidence.evidence_reviews",ascending:false}).limit(1,{referencedTable:"evidence.evidence_reviews"});
    return query;
  }
  async read(table,{order="created_at",limit=100,filter=q=>q,ascending=true}={}){
    const query=this.query(table).order(order,{ascending,nullsFirst:false}).order("id").limit(limit);
    const rows=await this.result(filter(query));
    this.ingest(table,rows);return rows;
  }
  async readPage(table,cursor=null){
    const page=splitPage(await this.result(createdPage(this.query(table),cursor)));
    const missing=[...new Set(page.records.map(row=>row.class_id).filter(id=>id&&!this.data.classes.some(c=>c.id===id)))];
    if(missing.length)this.ingest("classes",await this.result(this.query("classes").in("id",missing).limit(25)));
    this.ingest(table,page.records);
    return {...page,records:page.records.map(row=>this.data[collections[table]].find(record=>record.id===row.id))};
  }
  historyRecords(table,ids){
    return ids.map(id=>this.data[collections[table]]?.find(record=>record.id===id)).filter(Boolean);
  }
  async loadView(view){
    if(this.loaded.has(view))return;
    if(this.loading.has(view))return this.loading.get(view);
    const promise=(async()=>{
      const tables={classes:["study_materials","weak_points","evidence"],assessments:[],calendar:[],materials:["study_materials"],progress:["weak_points","projects","evidence","sessions"]}[view]||[];
      await Promise.all(tables.map(t=>this.read(t)));
      if(view==="progress"){
        const [scores,parents,bookings]=await Promise.all([
          this.result(this.client.from("progress_scores").select("*").eq("student_id",this.studentId).is("archived_at",null).order("scored_at",{ascending:false}).limit(100)),
          this.result(this.client.from("parent_updates").select("body").eq("student_id",this.studentId).in("status",["approved","sent"]).is("archived_at",null).order("created_at",{ascending:false}).limit(1)),
          this.result(this.client.from("bookings").select("starts_at").eq("student_id",this.studentId).eq("status","booked").gte("starts_at",new Date().toISOString()).order("starts_at").limit(1))
        ]);
        this.ingest("progress_scores",scores);
        for(const score of scores)if(this.data.progress[camel(score.metric)]==null)this.data.progress[camel(score.metric)]=score.score;
        this.data.parentUpdate=parents[0]?.body||"";
        this.data.nextMeeting=bookings[0]?new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Qatar"}).format(new Date(bookings[0].starts_at))+" (Qatar time)":"";
      }
      this.loaded.add(view);
    })();this.loading.set(view,promise);
    try{await promise;}finally{this.loading.delete(view);}
  }
  classId(subject,required=false){
    const found=this.data.classes.find(c=>c.name.trim().toLowerCase()===String(subject||"").trim().toLowerCase());
    if(required&&!found)throw Object.assign(new Error("Add this class first, then select it here."),{retryable:false,rejected:true});
    if(subject&&!found)throw Object.assign(new Error("Choose an existing class, or add it in Classes."),{retryable:false,rejected:true});
    return found?.id||null;
  }
  values(table,v){
    const fields={
      classes:{name:"name",teacher:"teacher",color:"color",defaultMinutes:"default_minutes",box1Days:"box1_days",box2Days:"box2_days",box3Days:"box3_days",box4Days:"box4_days"},
      assessments:{name:"name",date:"due_date",time:"due_time",type:"kind",status:"status",topics:"topics",notes:"notes",prepTarget:"prep_target",prepCompleted:"prep_completed",confidence:"confidence",difficulty:"difficulty",importance:"importance"},
      tasks:{title:"title",detail:"detail",dueDate:"due_date",status:"status",proofRequired:"proof_required"},
      study_blocks:{date:"date",startTime:"start_time",endTime:"end_time",title:"title",method:"method",goal:"goal",status:"status",proofRequired:"proof_required"},
      study_materials:{title:"title",url:"external_url",fileType:"file_type",notes:"notes"},
      review_cards:{unit:"unit",term:"term",prompt:"prompt",answer:"answer"},
      weak_points:{title:"title",detail:"detail",mistake:"mistake",cause:"cause",fix:"fix",retry:"retry",nextReview:"next_review",lastReviewedAt:"last_reviewed_at",status:"status"},
      projects:{title:"title",detail:"detail",role:"role",stage:"stage",currentGoal:"current_goal",nextAction:"next_action",output:"output",impact:"impact",longTermDirection:"long_term_direction",status:"status"},
      evidence:{date:"date",activity:"activity",whatIDid:"what_i_did",evidence:"proof_text",proofUrl:"proof_url",result:"result",reflection:"reflection"}
    }[table];
    const record={};for(const [source,target] of Object.entries(fields))if(v[source]!==undefined){
      let value=v[source];
      if(["status","kind","confidence","difficulty","importance"].includes(target))value=status(value)||null;
      if(target==="kind"&&value==="project_deadline")value="deadline";
      if(["due_date","due_time","start_time","end_time","next_review","proof_url"].includes(target))value=value||null;
      if(["default_minutes","box1_days","box2_days","box3_days","box4_days","prep_target","prep_completed"].includes(target))value=Number(value);
      record[target]=value;
    }
    if(v.subject!==undefined)record.class_id=this.classId(v.subject,["assessments","review_cards"].includes(table));
    if(table==="classes"&&!record.color)delete record.color;
    if(table==="evidence")record.proof_text=record.proof_text||record.what_i_did||"";
    return record;
  }
  async send(values,id){
    let prepared=this.requests.get(id);
    if(!prepared){
      const operation=values.operation;
      if(operation==="movereviewcard"){
        const row=this.raw.get("review_cards:"+values.recordId);
        prepared={name:"review_card",table:"review_cards",args:{p_card_id:values.recordId,p_box:Number(values.box),p_expected_version:row?.row_version,p_request_key:id}};
      }else if(operation==="submittaskproof"){
        const row=this.raw.get("tasks:"+values.recordId);
        prepared={name:"submit_task_proof",table:"tasks",args:{p_task_id:values.recordId,p_note:values.proofNote||"",p_url:values.proofUrl||"",p_reflection:values.reflection||"",p_expected_version:row?.row_version,p_request_key:id}};
      }else if(operation==="updateplanner"){
        const row=this.raw.get("study_blocks:"+values.recordId);
        prepared={name:"save_study_block_with_proof",table:"study_blocks",args:{p_block_id:values.recordId,p_values:this.values("study_blocks",values),p_note:values.proofNote||"",p_url:values.proofUrl||"",p_expected_version:row?.row_version,p_request_key:id}};
      }else if(operation==="classifyassessment"){
        if(!["Confirmed","Dismissed"].includes(values.decision))throw Object.assign(new Error("Choose whether this is an assessment."),{retryable:false,rejected:true});
        const row=this.raw.get("assessments:"+values.recordId);
        prepared={name:"save_record",table:"assessments",args:{p_table:"assessments",p_student_id:this.studentId,p_record_id:values.recordId,p_values:{classification_status:status(values.decision)},p_expected_version:row?.row_version,p_request_key:id}};
      }else{
        const table=operationTables[operation.replace(/^(add|update|review)/,"")];
        if(!table)throw Object.assign(new Error("This action is not available yet in the local release."),{retryable:false,rejected:true});
        const row=values.recordId?this.raw.get(table+":"+values.recordId):null;
        const input=operation==="reviewweakpoint"?{...values,lastReviewedAt:new Date().toISOString(),nextReview:values.status==="Mastered"?"":values.nextReview}:values;
        prepared={name:"save_record",table,args:{p_table:table,p_student_id:this.studentId,p_record_id:values.recordId||id,p_values:this.values(table,input),p_expected_version:row?.row_version??null,p_request_key:id}};
      }
      prepared.studentId=this.studentId;
      prepared.recordId=values.recordId||id;
      this.requests.set(id,prepared);
    }
    const key=prepared.table+":"+prepared.recordId;
    if(this.conflicts.has(key))throw Object.assign(new Error("Review the latest saved version before saving this record again."),{code:"P0409",retryable:false,rejected:true});
    let response;
    try{response=await this.rpc(prepared.name,prepared.args);}
    catch(error){if(error.code==="P0409")this.conflicts.set(key,true);throw error;}
    const record=response.record;
    this.raw.set(prepared.table+":"+record.id,record);
    if(response.evidence){this.ingest("evidence",[response.evidence],{confirmed:true});record.evidence=[response.evidence];}
    return {ok:true,changed:{recordId:record.id,values:normalizeRecord(prepared.table,record,this.data.classes)}};
  }
  async compareConflict(id){
    const prepared=this.requests.get(id);
    if(!prepared||prepared.studentId!==this.studentId||!this.conflicts.has(prepared.table+":"+prepared.recordId))throw new Error("This comparison is no longer current.");
    // A targeted authorized read does not change the save base or erase a draft.
    const row=await this.result(this.query(prepared.table).eq("id",prepared.recordId).maybeSingle());
    if(prepared.studentId!==this.studentId)throw new Error("This workspace is closed.");
    const latest=row?normalizeRecord(prepared.table,row,this.data.classes):null;
    return {latest,accept:()=>{
      if(prepared.studentId!==this.studentId||!this.conflicts.has(prepared.table+":"+prepared.recordId))throw new Error("This comparison is no longer current.");
      const cached=this.raw.get(prepared.table+":"+prepared.recordId);
      if(row&&Number(cached?.row_version)>Number(row.row_version))throw new Error("A newer version arrived. Compare again before saving.");
      if(row)this.ingest(prepared.table,[row],{confirmed:true});
      else{
        const list=this.data[collections[prepared.table]],index=list.findIndex(r=>r.id===prepared.recordId);
        if(index>=0)list.splice(index,1);
        this.raw.delete(prepared.table+":"+prepared.recordId);
      }
      this.conflicts.delete(prepared.table+":"+prepared.recordId);
    }};
  }
}
