// Current schedule and demonstrated recall are deliberately separate.
// A manual Box move must never invent a learning result.
export const strengthLabel = card => ({1:'Weak',2:'Learning',3:'Improving',4:'Strong',5:'Strong'}[Number(card.box)] || 'Not scheduled');
export const needsPractice = card => ['missed','partly'].includes(card.last_rating);
export const recallLabel = card => ({missed:'Needs practice',partly:'Improving',knew:'Recalled'}[card.last_rating] || 'Not studied yet');
export const resultLabel = rating => ({missed:'Didn’t know',partly:'Partly knew',knew:'Knew it'}[rating] || 'Not studied yet');
export function recommendStudy(cards, assessments, links, today, assessmentId='') {
 const available=cards.filter(c=>!c.archived_at), ids=new Set(available.map(c=>c.unit_id));
 const test=assessments.filter(a=>a.status==='upcoming'&&!a.archived_at&&a.due_date>=today&&(!assessmentId||a.id===assessmentId)&&links.some(l=>l.assessment_id===a.id&&ids.has(l.unit_id))).sort((a,b)=>a.due_date.localeCompare(b.due_date))[0];
 const relevant=test?available.filter(c=>links.some(l=>l.assessment_id===test.id&&l.unit_id===c.unit_id)):available;
 const due=relevant.filter(c=>c.next_review?c.next_review<=today:!c.last_reviewed_at), weak=relevant.filter(needsPractice);
 const urgent=new Set([...due,...weak].map(c=>c.id));
 const selected=(urgent.size?relevant.filter(c=>urgent.has(c.id)):relevant).sort((a,b)=>String(a.next_review||'').localeCompare(String(b.next_review||''))||String(a.last_reviewed_at||'').localeCompare(String(b.last_reviewed_at||''))).slice(0,24);
 return {test,due:due.length,weak:weak.length,cards:selected,minutes:Math.max(1,Math.ceil(selected.length*.5)),method:weak.length?'learn':test?'quiz_choice':'flashcard'};
}
