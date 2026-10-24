// A short-lived handoff, shared with the new tab opened by an email sign-in link.
// No student identity or academic answers are put in URLs or analytics events.
const PREFIX="admit-diagnosis:";
const MAX_AGE=24*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const choices={challenge:["procrastination","forgetting","weak-class","no-plan","phone","direction"],study_method:["rereads","videos","practice","flashcards","night-before","inconsistent"],assessment_horizon:["48-hours","this-week","2-4-weeks","not-sure"],weekly_capacity:["under-2","2-4","5-plus","not-sure"]};
const email=value=>String(value||"").trim().toLowerCase();
const validEmail=value=>value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function diagnosisDraft(lead,{id=crypto.randomUUID(),now=Date.now()}={}){
  const draft={id,createdAt:now,name:String(lead.name||"").trim(),email:email(lead.email),guardian:email(lead.parentEmail),grade:Number(String(lead.grade||"").replace(/^Grade\s+/i,"")),marketing:lead.campaignOptIn==="yes",service:lead.serviceContactConsent==="yes",answers:{challenge:lead.challenge,study_method:lead.studyMethod,assessment_horizon:lead.assessmentHorizon,weekly_capacity:lead.weeklyCapacity,result_summary:String(lead.diagnosisSummary||"").trim()}};
  if(!UUID.test(id)||!draft.name||draft.name.length>120||!validEmail(draft.email)||(draft.guardian&&(!validEmail(draft.guardian)||draft.email===draft.guardian))||!Number.isInteger(draft.grade)||draft.grade<6||draft.grade>12||!draft.service)throw new Error("Enter a student name, grade 6–12, a valid student email and, if provided, a different guardian email, and accept the privacy notice.");
  for(const [key,allowed] of Object.entries(choices))if(!allowed.includes(draft.answers[key]))throw new Error("Complete all six diagnosis questions first.");
  if(!draft.answers.result_summary||draft.answers.result_summary.length>2000)throw new Error("Complete the diagnosis to get your result.");
  return draft;
}

export function saveDiagnosisDraft(storage,lead,options){
  const draft=diagnosisDraft(lead,options);
  // Bound abandoned local data; keep at most five concurrent diagnosis handoffs.
  const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>k?.startsWith(PREFIX));
  const active=[];
  for(const key of keys){const value=readDiagnosisDraft(storage,key.slice(PREFIX.length),draft.createdAt);if(value)active.push(value);}
  active.sort((a,b)=>b.createdAt-a.createdAt).slice(4).forEach(value=>storage.removeItem(PREFIX+value.id));
  storage.setItem(PREFIX+draft.id,JSON.stringify(draft));return draft;
}
export function readDiagnosisDraft(storage,id,now=Date.now()){
  if(!UUID.test(id||""))return null;
  try{
    const raw=JSON.parse(storage.getItem(PREFIX+id)||"null");
    if(!raw||raw.id!==id||!Number.isFinite(raw.createdAt)||raw.createdAt>now+60000||now-raw.createdAt>MAX_AGE)throw new Error("Expired");
    return diagnosisDraft({name:raw.name,email:raw.email,parentEmail:raw.guardian,grade:raw.grade,campaignOptIn:raw.marketing?"yes":"no",serviceContactConsent:raw.service?"yes":"no",challenge:raw.answers.challenge,studyMethod:raw.answers.study_method,assessmentHorizon:raw.answers.assessment_horizon,weeklyCapacity:raw.answers.weekly_capacity,diagnosisSummary:raw.answers.result_summary},{id,now:raw.createdAt});
  }catch{try{storage.removeItem(PREFIX+id);}catch{}return null;}
}
export function clearDiagnosisDraft(storage,id){if(UUID.test(id||""))storage.removeItem(PREFIX+id);}
export function diagnosisRequest(draft,verifiedEmail){
  if(email(verifiedEmail)!==draft.email)throw new Error("Sign in with the student email entered in this diagnosis. Your current account will not be changed.");
  return {p_name:draft.name,p_grade:draft.grade,p_guardian_email:draft.guardian,p_answers:draft.answers,p_service_consent:draft.service,p_marketing_opt_in:draft.marketing,p_request_key:draft.id};
}
