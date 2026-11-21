import {unzipSync,strFromU8} from 'fflate';
export const SOURCE_TEXT_LIMIT=500000;
import {explicitPairs,isPairHeader} from './source-pairs.js';
export {explicitPairs} from './source-pairs.js';
const entities=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e)=>{if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[e];});
export function officeParagraphs(xml,prefix){
 if(xml.includes('<!DOCTYPE')||xml.includes('<!ENTITY'))throw new Error('This document contains unsupported XML. Export it as PDF or plain text.');
 const paragraphs=xml.match(new RegExp('<'+prefix+':p(?:\\s[^>]*)?>[\\s\\S]*?<\\/'+prefix+':p>','g'))||[];
 return paragraphs.map(p=>[...p.matchAll(new RegExp('<'+prefix+':t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+prefix+':t>|<'+prefix+':tab\\s*\\/>','g'))].map(m=>m[1]===undefined?'\t':entities(m[1])).join('')).join('\n');
}
// Retain table boundaries: flattening cells into paragraphs loses which answer
// belongs to which question. Nested/merged/unlabelled tables are not inferred.
function officeTables(xml,prefix,locator){
 const ranges=[];let depth=0,start=0,nested=false;
 for(const match of xml.matchAll(new RegExp('<(/?)'+prefix+':tbl\\b[^>]*>','g'))){
  const closing=!!match[1],empty=/\/\s*>$/.test(match[0]);
  if(!closing){if(!depth){start=match.index;nested=false;}else nested=true;depth++;}
  if(closing||empty){depth--;if(depth<0)throw new Error('This document has an incomplete table. Export it as PDF or plain text.');if(!depth)ranges.push({start,end:match.index+match[0].length,nested});}
 }
 if(depth)throw new Error('This document has an incomplete table. Export it as PDF or plain text.');
 const pairs=[];let pairXml='',previous=0;
 for(const [index,range] of ranges.entries()){
  pairXml+=xml.slice(previous,range.start);previous=range.end;
  const table=xml.slice(range.start,range.end);
  if(range.nested||/<w:(?:gridSpan|vMerge|hMerge|gridBefore|gridAfter)\b/.test(table)||/<a:tc\b[^>]*\b(?:gridSpan|rowSpan|hMerge|vMerge)\s*=/.test(table))continue;
  const rows=[...table.matchAll(new RegExp('<'+prefix+':tr(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+prefix+':tr>','g'))].map(row=>[...row[1].matchAll(new RegExp('<'+prefix+':tc(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+prefix+':tc>','g'))].map(cell=>officeParagraphs(cell[1],prefix).trim()));
  if(!rows.length||rows.some(row=>row.length!==2)||!isPairHeader(...rows[0]))continue;
  for(let r=1;r<rows.length;r++){
   const [term,answer]=rows[r];
   pairs.push({term,answer,locator:locator+' · Table '+(index+1)+' · Row '+(r+1),excerpt:term+'\t'+answer});
  }
 }
 return {tablePairs:pairs,pairText:officeParagraphs(pairXml+xml.slice(previous),prefix)};
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
 return Object.entries(files).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([name,data])=>{
  const locator=extension==='docx'?'Document':'Slide '+name.match(/slide(\d+)/)[1],prefix=extension==='docx'?'w':'a',xml=strFromU8(data);
  const text=officeParagraphs(xml,prefix);
  return {locator,text,...officeTables(xml,prefix,locator)};
 });
}
export function finishExtraction(sections,note='',csv=false){
 if(sections.reduce((n,s)=>n+s.text.length,0)>SOURCE_TEXT_LIMIT)throw new Error('This source has too much text. Split it into smaller files.');
 const items=explicitPairs(sections,{csv});
 return {method:'explicit_pairs_v1',sections:sections.map(({locator,text})=>({locator,text})),items,note:note||(sections.some(s=>s.text.trim())?'Text extracted. Suggestions use explicit term–answer pairs, including clearly labeled two-column tables; they do not identify importance or understand the document. Review every suggestion.':'No readable text was found. Scanned pages and images need you to add concepts or create a Model. No OCR or AI is used.')};
}
