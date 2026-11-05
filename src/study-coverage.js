// A transparent phrase comparison, never a claim to understand an explanation.
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('en').replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const uncertain=/\b(?:not|never|no|dont|doesnt|didnt|cannot|cant|couldnt|unsure|uncertain|forgot|forget)\b/;
const generic=new Set(['a','an','the','it','is','of','to','in','yes','no','true','false']);
const meaningful=value=>value.length>=2&&!generic.has(value);
const contains=(text,phrase)=>meaningful(phrase)&&(' '+text+' ').includes(' '+phrase+' ');

export function compareCoverage(card,text,prompts=[]){
 const responses=prompts.filter(p=>p.review_card_id===card.id&&p.answered_at).map(p=>p.response||'');
 const clauses=[text,...responses].join('\n').split(/[.!?;\n]+/).map(normalize).filter(Boolean);
 const certain=clauses.filter(clause=>!uncertain.test(clause));
 const answers=[card.answer,...(card.accepted_answers||[])].map(normalize).filter(meaningful);
 const keywords=(card.required_keywords||[]).map(normalize).filter(meaningful);
 const term=normalize(card.term);
 let rating='missed',reason='No clear phrase match';
 if(answers.some(answer=>certain.some(clause=>contains(clause,answer)))){rating='knew';reason='Saved answer phrase found';}
 else if(keywords.length&&keywords.every(word=>certain.some(clause=>contains(clause,word)))){rating='knew';reason='Saved keywords found';}
 else if(certain.some(clause=>contains(clause,term))){rating='partly';reason='Name mentioned; check the explanation';}
 else if(clauses.some(clause=>contains(clause,term))){reason='Mentioned with uncertainty or negation';}
 const reflection=prompts.filter(p=>p.review_card_id===card.id&&p.answered_at&&['missed','partly'].includes(p.self_rating));
 if(reflection.some(p=>p.self_rating==='missed')){rating='missed';reason='You marked a question as difficult';}
 else if(reflection.length&&rating==='knew'){rating='partly';reason='You marked a question as partly explained';}
 return {rating,reason,matched:rating!=='missed'};
}

export function coverageRows(state,draft={}){
 return state.items.filter(i=>!i.answered_at&&!i.skipped_at).flatMap(item=>{
  const card=state.cards.find(c=>c.id===item.review_card_id);if(!card)return [];
  const match=compareCoverage(card,state.session.reflection_text,state.prompts);
  return [{item,card,...match,rating:['knew','partly','missed'].includes(draft[item.id])?draft[item.id]:match.rating}];
 });
}
