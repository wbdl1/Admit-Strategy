import {unzipSync,strFromU8} from 'fflate';
export const SOURCE_TEXT_LIMIT=500000;
export function explicitPairs(sections,{csv=false}={}){
 const items=[],seen=new Set();
 for(const section of sections)for(const raw of section.text.split(/\r?\n/)){
  const line=raw.trim();let pair;
  if(line.includes('\t'))pair=line.split('\t');
  else if(line.includes(' | '))pair=line.split(' | ');
  else if(/^[^:]{1,160}:\s+\S/.test(line)&&!/^https?:/i.test(line))pair=[line.slice(0,line.indexOf(':')),line.slice(line.indexOf(':')+1)];
  else if(csv&&/^"[^"\n]+","[^"\n]+"$/.test(line))pair=line.slice(1,-1).split('","');
  else if(csv&&line.split(',').length===2)pair=line.split(',');
  if(!pair||pair.length!==2)continue;
  const [term,answer]=pair.map(v=>v.trim()),key=(term+'\n'+answer).toLowerCase().replace(/\s+/g,' ');
  if(!term||!answer||term.length>160||answer.length>2000||seen.has(key)||/^(term|question|concept)$/i.test(term)&&/^(answer|definition)$/i.test(answer))continue;
  seen.add(key);items.push({term,answer,locator:section.locator,excerpt:line.slice(0,4000)});
  if(items.length===200)return items;
 }
 return items;
}
const entities=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e)=>{if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[e];});
export function officeParagraphs(xml,prefix){
 if(xml.includes('<!DOCTYPE')||xml.includes('<!ENTITY'))throw new Error('This document contains unsupported XML. Export it as PDF or plain text.');
 const paragraphs=xml.match(new RegExp('<'+prefix+':p(?:\\s[^>]*)?>[\\s\\S]*?<\\/'+prefix+':p>','g'))||[];
 return paragraphs.map(p=>[...p.matchAll(new RegExp('<'+prefix+':t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+prefix+':t>|<'+prefix+':tab\\s*\\/>','g'))].map(m=>m[1]===undefined?'\t':entities(m[1])).join('')).join('\n');
}
export function extractOffice(bytes,extension){
 let total=0,count=0;
 const files=unzipSync(bytes,{filter:file=>{
  const selected=extension==='docx'?file.name==='word/document.xml':/^ppt\/slides\/slide\d+\.xml$/.test(file.name);
  if(!selected)return false;
  total+=file.originalSize;count++;
  if(total>10*1024*1024||count>200)throw new Error('This document is too large to prepare here. Split it into smaller files.');
  return true;
 }});
 return Object.entries(files).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([name,data])=>({locator:extension==='docx'?'Document':'Slide '+name.match(/slide(\d+)/)[1],text:officeParagraphs(strFromU8(data),extension==='docx'?'w':'a')}));
}
export function finishExtraction(sections,note='',csv=false){
 if(sections.reduce((n,s)=>n+s.text.length,0)>SOURCE_TEXT_LIMIT)throw new Error('This source has too much text. Split it into smaller files.');
 const items=explicitPairs(sections,{csv});
 return {method:'explicit_pairs_v1',sections,items,note:note||(sections.some(s=>s.text.trim())?'Text extracted. Suggestions use explicit term–answer pairs only; they do not identify importance or understand the document. Review every suggestion.':'No readable text was found. Scanned pages and images need you to add concepts or create a Model. No OCR or AI is used.')};
}
