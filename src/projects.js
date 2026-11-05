const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const input=(label,name,value='',type='text',max=1200)=>`<label>${label}<input name="${name}" type="${type}" maxlength="${max}" value="${esc(value)}"></label>`;
const area=(label,name,value='')=>`<label>${label}<textarea name="${name}" maxlength="1200">${esc(value)}</textarea></label>`;
const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
const form=(operation,id,body,action,key=id||'new')=>`<form id="project-form-${esc(operation)}-${esc(key)}" class="portal-form" data-portal-form>${hidden('operation',operation)}${id?hidden('recordId',id):''}${body}<div class="form-actions"><button type="submit" class="btn">${action}</button><span class="form-help" role="status" data-class-feedback></span></div></form>`;
const details=(title,body)=>`<details class="form-panel"><summary>${title}</summary>${body}</details>`;
const row=(label,value)=>value?`<p><strong>${label}:</strong> ${esc(value)}</p>`:'';
const active=p=>!p.archivedAt&&!['Completed','Archived','Paused'].includes(p.status);
export function projectCreationMarkup(){
 return details('Add a project or activity',form('addproject',null,
  '<label>Name<input name="title" required maxlength="160" placeholder="Science outreach workshop"></label>'+area('What are you trying to achieve?','currentGoal')+area("What’s the next thing you need to do?",'nextAction')+hidden('status','In progress'),'Create project'));
}
function updateForm(p){
 const statuses=['Idea','Planning','In progress','Paused','Completed','Archived'];
 return form('updateproject',p.id,
  input('Name','title',p.title,'text',160)+area('Current goal','currentGoal',p.currentGoal)+area('Next action','nextAction',p.nextAction)+input('When will you do this? (optional)','targetDate',p.targetDate,'date')+
  details('More about this activity',input('Type','activityType',p.activityType,'text',80)+area('Why I’m doing this','detail',p.detail)+input('My role','role',p.role,'text',160)+input('Current stage','stage',p.stage,'text',100)+area('Outputs','output',p.output)+area('Impact / result','impact',p.impact)+area('Reflection','reflection',p.reflection)+area('Long-term direction','longTermDirection',p.longTermDirection))+
  `<label>Status<select name="status">${statuses.map(s=>`<option${s===p.status?' selected':''}>${s}</option>`).join('')}</select></label>`,'Save changes');
}
function evidenceForm(p,events,today){
 return form('addevidence',null,hidden('projectId',p.id)+hidden('activity',p.title)+hidden('fileId','')+input('Date','date',today,'date')+
  area('What did you make or achieve?','whatIDid')+input('Link (optional)','proofUrl','','url')+'<label class="btn secondary">Attach a file (optional)<input type="file" data-project-proof accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.txt" aria-label="Choose evidence file"></label><p data-project-file-status role="status">Up to 20 MB. A photo, document or certificate is optional.</p>'+
  `<label>Related milestone or action (optional)<select name="projectEventId"><option value="">This project</option>${events.filter(e=>['milestone','action'].includes(e.kind)).map(e=>`<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('')}</select></label>`+
  details('Result or reflection (optional)',area('Result','result')+area('Reflection','reflection')),'Save output',p.id);
}
export function projectCardsMarkup(items,{events=[],evidence=[],pages={},today='',canEdit=true,archive=()=>''}={}){
 if(!items?.filter(p=>!p.archivedAt).length)return '<div class="empty">Track an extracurricular, competition, passion project, volunteering activity, club, research project, business or other sustained activity. Start with what you want to achieve and one next action.</div>';
 return items.filter(p=>!p.archivedAt).map(p=>{
  const history=events.filter(e=>e.projectId===p.id&&!e.archivedAt),milestones=history.filter(e=>e.kind==='milestone'&&!e.completedAt).sort((a,b)=>String(a.targetDate||'9999').localeCompare(b.targetDate||'9999'));
  const outputs=evidence.filter(e=>e.projectId===p.id&&!e.archivedAt);
  const timeline=[...history,...outputs.flatMap(e=>[['output',e.whatIDid],['result',e.result],['reflection',e.reflection]].filter(([,v])=>v).map(([kind,title])=>({kind,title,completedAt:e.createdAt||e.date})))];
  const more=table=>pages[table+':'+p.id]===null?'':`<button type="button" class="btn secondary" data-project-page="${table}" data-project-id="${p.id}">${table==='evidence'?'Load more outputs':'Load more history'}</button><span role="status" data-project-page-status></span>`;
  const done=canEdit&&active(p)&&p.nextAction?form('completeproject',p.id,'','Done'):'';
  return `<article class="item project-card" id="project-${esc(p.id)}"><div class="record-head"><h3>${esc(p.title)}</h3><span class="status">${esc(p.status||'In progress')}</span></div>${row('Current goal',p.currentGoal)}<div class="project-next"><span class="muted">Next action</span><p><strong>${esc(p.nextAction||'Choose your next meaningful move.')}</strong></p>${p.targetDate?`<p>${p.targetDate<today?'Overdue · ':p.targetDate===today?'Due today · ':'Scheduled · '}${esc(p.targetDate)}</p>`:''}<div class="record-actions">${done}${canEdit?'<button class="btn secondary" type="button" data-open-editor="0" data-editor-title="Update project">Update</button>':''}</div></div>`+
   (canEdit?`<details class="form-panel edit-panel"><summary>Update project</summary>${updateForm(p)}</details>`:'')+
   `<section class="project-milestones"><h4>Next milestones</h4>${milestones.length?milestones.map(e=>`<div class="project-milestone"><p><strong>${esc(e.title)}</strong>${e.targetDate?' · '+esc(e.targetDate):''}</p>${canEdit?form('reachproject',p.id,hidden('eventId',e.id),'Mark reached',e.id):''}</div>`).join(''):'<p class="muted">A milestone is a meaningful result you’re working toward.</p>'}${canEdit?details('Add a milestone',form('milestoneproject',p.id,input('Milestone','title')+input('Target date (optional)','targetDate','','date'),'Add milestone')):''}</section>`+
   details('Outputs &amp; evidence'+(outputs.length?' · '+outputs.length:''),outputs.map(e=>`<article id="project-output-${esc(e.id)}">${row('Output',e.whatIDid)}${row('Result',e.result)}${row('Reflection',e.reflection)}${e.fileId?`<button type="button" class="btn secondary" data-project-download="${esc(e.fileId)}">Download attached evidence</button><span role="status" data-project-file-status></span>`:''}${/^https:\/\//.test(e.proofUrl||'')?`<a href="${esc(e.proofUrl)}" target="_blank" rel="noopener noreferrer">Open evidence link</a>`:''}</article>`).join('')+more('evidence')+(canEdit?evidenceForm(p,history,today):''))+
   details('Activity history',`<ol class="project-timeline">${timeline.filter(e=>e.completedAt).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt))).map(e=>`<li><strong>${esc({action:'Action completed',milestone:'Milestone reached',output:'Output',result:'Result',reflection:'Reflection'}[e.kind])}</strong><p>${esc(e.title)}</p><time>${esc(e.completedAt?.slice(0,10))}</time></li>`).join('')}<li><strong>Started</strong><p>${esc(p.title)}</p><time>${esc(p.createdAt?.slice(0,10)||'')}</time></li></ol>`+more('project_events'))+
   details('Activity details',row('Type',p.activityType)+row('Objective',p.detail)+row('Role',p.role)+row('Stage',p.stage)+row('Output',p.output)+row('Impact / result',p.impact)+row('Reflection',p.reflection)+row('Long-term direction',p.longTermDirection))+(canEdit?archive(p):'')+'</article>';
 }).join('');
}
export function projectTodayMarkup(data,today){
 const later=new Date(today+'T12:00:00Z');later.setUTCDate(later.getUTCDate()+7);const week=later.toISOString().slice(0,10);
 const projects=data.projects||[],due=projects.filter(p=>active(p)&&p.nextAction&&p.targetDate&&p.targetDate<=today);
 const milestones=(data.projectEvents||[]).filter(e=>e.kind==='milestone'&&!e.completedAt&&!e.archivedAt&&e.targetDate&&e.targetDate<=week&&projects.some(p=>p.id===e.projectId&&active(p)));
 if(!due.length&&!milestones.length)return '';
 return '<section class="today-other"><h3>Projects coming up</h3>'+due.slice(0,3).map(p=>`<article class="item"><strong>${esc(p.nextAction)}</strong><p>${esc(p.title)} · ${p.targetDate<today?'Overdue':'Due today'}</p><button type="button" class="btn secondary" data-app-view="projects">Open Projects</button></article>`).join('')+milestones.slice(0,2).map(e=>`<p><strong>${esc(e.title)}</strong> · Milestone ${esc(e.targetDate)}</p>`).join('')+'</section>';
}
