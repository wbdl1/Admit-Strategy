export const methodNames={flashcard:'Flashcards',quiz_choice:'Quiz: multiple choice',quiz_written:'Quiz: written answers',learn:'Learn',blurting:'Free recall / Blurting',diagram:'Diagram labels',feynman:'Teach / Feynman'};
export const normalizeChoice=value=>String(value||'').trim().toLocaleLowerCase().replace(/\s+/g,' ').replace(/[.!?]+$/,'');
// Same-unit alternatives only. Ambiguous, long or insufficient alternatives use written recall.
export function answerChoices(card,cards,seed=''){
 const accepted=new Set([card.answer,...(card.accepted_answers||[])].map(normalizeChoice));
 if(!card.answer?.trim()||card.answer.length>240||!card.unit_id)return [];
 const seen=new Set(accepted),pool=[];
 for(const other of cards){const value=other.answer?.trim(),key=normalizeChoice(value);
  if(other.id===card.id||other.unit_id!==card.unit_id||other.archived_at||!value||value.length>240||seen.has(key))continue;
  if(value.length<card.answer.length/4||value.length>card.answer.length*4)continue;
  seen.add(key);pool.push(value);
 }
 if(pool.length<3)return [];
 const hash=value=>[...(seed+value)].reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);
 return [...pool.sort((a,b)=>hash(a)-hash(b)).slice(0,3),card.answer].sort((a,b)=>hash('choice:'+a)-hash('choice:'+b));
}
export function latestConceptOutcomes(items){
 const last=new Map();for(const item of [...items].sort((a,b)=>a.position-b.position))if(item.answered_at&&item.review_card_id)last.set(item.review_card_id,item);
 return {concepts:last.size,knew:[...last.values()].filter(i=>i.rating==='knew').length,partly:[...last.values()].filter(i=>i.rating==='partly').length,missed:[...last.values()].filter(i=>i.rating==='missed').length};
}
