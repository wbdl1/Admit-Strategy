// Fast preview of private.check_study_answer. Persistence and scheduling always
// use the server's result. Unverified Unicode/collation cases defer to it.
const supported = value => typeof value === 'string' && /^[\u0000-\u00ff]*$/.test(value);
const trim = value => value.replace(/^ +| +$/g, '');
const normalize = (value, strict) => {
 const text=trim(value).replace(/[\t\n\v\f\r ]+/g,' ');
 return strict?text:text.toLowerCase().replace(/[.!?]+$/g,'');
};
const words=value=>value.toLowerCase().split(/[^a-z0-9]+/);
export function checkAnswer({expected,aliases=[],keywords=[],response,checking='normal'}){
 if(response==null||trim(response)==='')return 'missed';
 if([expected,...aliases].some(value=>value===response))return 'knew';
 if(![expected,...aliases,...keywords,response].every(supported))return null;
 if([expected,...aliases].some(value=>normalize(value,checking==='strict')===normalize(response,checking==='strict')))return 'knew';
 if(checking!=='loose'||!keywords.length)return 'missed';
 if(![response,...keywords].every(value=>/^[\u0000-\u007f]*$/.test(value)))return null;
 const parts=new Set(words(response)),hits=keywords.filter(phrase=>words(trim(phrase)).every(word=>parts.has(word))).length;
 return hits===keywords.length?'knew':hits?'partly':'missed';
}
export function checkStudyItem(card,item,session,response){
 if(!['written','choice','label'].includes(item.presentation))return null;
 const label=item.presentation==='label',choice=item.presentation==='choice';
 return checkAnswer({expected:label?card.term:card.answer,aliases:label?[]:card.accepted_answers||[],keywords:label||choice?[]:card.required_keywords||[],response,checking:label||choice?'normal':session.checking_mode||'normal'});
}
export const verdictLabel=rating=>({knew:'✓ Correct',partly:'△ Partly correct',missed:'✕ Incorrect'}[rating]||'Checking answer…');
