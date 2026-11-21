export const isPairHeader=(term,answer)=>/^(term|question|concept|word|vocabulary)$/i.test(term)&&/^(answer|definition|meaning)$/i.test(answer);
export function explicitPairs(sections,{csv=false}={}){
 const items=[],seen=new Set();
 for(const section of sections){
 const candidates=[...(section.tablePairs||[])];
 for(const raw of (section.pairText??section.text).split(/\r?\n/)){
  const line=raw.trim();let pair;
  if(line.includes('\t'))pair=line.split('\t');
  else if(line.includes(' | '))pair=line.split(' | ');
  else if(!csv&&!/^https?:/i.test(line)){
   const separator=/:\s+|\s+[-–—]\s+/.exec(line);
   if(separator&&(separator[0].startsWith(':')||!/[=<>≤≥]/.test(line)))pair=[line.slice(0,separator.index),line.slice(separator.index+separator[0].length)];
  }
  else if(csv&&/^"[^"\n]+","[^"\n]+"$/.test(line))pair=line.slice(1,-1).split('","');
  else if(csv&&line.split(',').length===2)pair=line.split(',');
  if(!pair||pair.length!==2)continue;
  candidates.push({term:pair[0],answer:pair[1],locator:section.locator,excerpt:line.slice(0,4000)});
 }
 for(const candidate of candidates){
  const term=candidate.term.trim(),answer=candidate.answer.trim(),key=(term+'\n'+answer).toLowerCase().replace(/\s+/g,' ');
  if(!term||!answer||term.length>160||answer.length>2000||seen.has(key)||isPairHeader(term,answer))continue;
  seen.add(key);items.push({...candidate,term,answer});
  if(items.length===200)return items;
 }
 }
 return items;
}
