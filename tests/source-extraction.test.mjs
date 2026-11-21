import test from 'node:test';import assert from 'node:assert/strict';import {zipSync,strToU8} from 'fflate';
import {explicitPairs,extractOffice,finishExtraction,officeParagraphs} from '../src/source-extraction.js';
import {projectCreationMarkup,projectCardsMarkup,projectTodayMarkup} from '../src/projects.js';
test('plain text proposals require explicit pairs and retain source references',()=>{
 const sections=[{locator:'Page 4',text:'Cell: A basic unit\nCELL: A basic unit\nA paragraph about plants, without a question or expected answer.\nhttps://example.com\nATP\tEnergy carrier'}];
 const result=finishExtraction(sections);assert.equal(result.items.length,2);assert.equal(result.items[0].locator,'Page 4');assert.equal(result.items[0].excerpt,'Cell: A basic unit');assert.match(result.note,/do not identify importance/);
 assert.equal(finishExtraction([{locator:'Page 1',text:''}]).items.length,0);assert.match(finishExtraction([]).note,/No readable text/);
 assert.equal(explicitPairs([{locator:'Text',text:'term,answer\nNucleus,Stores DNA'}],{csv:true}).length,1);
});
test('school vocabulary dash separators extract explicit pairs without treating equations as recall cards',()=>{
 const result=finishExtraction([{locator:'Page 2',text:'Carrying capacity — maximum population an environment can sustainably support\nLimiting factor – limits population growth\nLong-term memory - recall: later - again\n5x - 7 = 18\n2x – 3 < 9'}]);
 assert.equal(result.items.length,3);assert.equal(result.items[0].term,'Carrying capacity');assert.equal(result.items[2].answer,'recall: later - again');assert.ok(result.items.every(i=>i.locator==='Page 2'));
});
test('Office extraction reads text only, keeps slide order and ignores links and executable content',()=>{
 const file=zipSync({'ppt/slides/slide2.xml':strToU8('<a:p><a:r><a:t>ATP: Energy carrier</a:t></a:r></a:p>'),'ppt/slides/slide1.xml':strToU8('<a:p><a:r><a:t>Cell: Unit &amp; structure</a:t></a:r></a:p>'),'ppt/_rels/slides.xml.rels':strToU8('https://do-not-fetch.invalid')});
 const result=extractOffice(file,'pptx');assert.equal(result.length,2);assert.equal(result[0].locator,'Slide 1');assert.equal(result[0].text,'Cell: Unit & structure');assert.equal(finishExtraction(result).items.length,2);
 assert.throws(()=>officeParagraphs('<!ENTITY bad>', 'w'),/unsupported XML/);
});
const paragraph=(prefix,text)=>`<${prefix}:p><${prefix}:r><${prefix}:t>${text}</${prefix}:t></${prefix}:r></${prefix}:p>`;
const table=(prefix,rows)=>`<${prefix}:tbl>${rows.map(row=>`<${prefix}:tr>${row.map(cell=>`<${prefix}:tc>${paragraph(prefix,cell)}</${prefix}:tc>`).join('')}</${prefix}:tr>`).join('')}</${prefix}:tbl>`;
const officeResult=(extension,xml)=>finishExtraction(extractOffice(zipSync({[extension==='docx'?'word/document.xml':'ppt/slides/slide3.xml']:strToU8(xml)}),extension));
test('Word and slide tables preserve explicit pairs, row provenance and original source text',()=>{
 for(const [extension,prefix,locator] of [['docx','w','Document'],['pptx','a','Slide 3']]){
  const xml=paragraph(prefix,'Outside: Plain pair')+table(prefix,[['Question','Answer'],['Where is DNA stored?','Nucleus &amp; chromosomes'],['ATP','Energy carrier']]);
  const result=officeResult(extension,xml);
  assert.equal(result.items.length,3);assert.deepEqual(result.items[0],{term:'Where is DNA stored?',answer:'Nucleus & chromosomes',locator:locator+' · Table 1 · Row 2',excerpt:'Where is DNA stored?\tNucleus & chromosomes'});
  assert.equal(result.items[2].term,'Outside');assert.match(result.sections[0].text,/Question\nAnswer\nWhere/);
  assert.deepEqual(Object.keys(result.sections[0]).sort(),['locator','text']);assert.equal(result.sections.length,1);
 }
});
test('only clearly labelled two-column unmerged tables produce suggestions',()=>{
 for(const [extension,prefix] of [['docx','w'],['pptx','a']]){
  const unsupported=[table(prefix,[['Planet','Mass'],['Term: misleading','Answer: unrelated']]),table(prefix,[['Term','Definition','Notes'],['Cell','Unit','Extra']]),table(prefix,[['Term','Definition'],['Only one cell']]),table(prefix,[['Term','Definition'],['Cell',table(prefix,[['Question','Answer'],['Nested','No']])]])];
  const merged=table(prefix,[['Term','Definition'],['Cell','Unit']]).replace('<'+prefix+':tc>',prefix==='w'?'<w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>':'<a:tc rowSpan="2">');
  for(const xml of [...unsupported,merged]){const r=officeResult(extension,xml);assert.equal(r.items.length,0);assert.ok(r.sections[0].text);}
  const valid=officeResult(extension,unsupported[0]+table(prefix,[['Term','Definition'],['Cell','Basic unit']]));
  assert.match(valid.items[0].locator,/Table 2 · Row 2$/);
 }
});
test('table cells preserve rich text and paragraphs without creating incidental colon proposals',()=>{
 const rich=table('w',[['Concept','Meaning'],['Cell','First sentence.']]).replace('First sentence.','First</w:t></w:r><w:r><w:t> sentence.').replace('</w:tc></w:tr></w:tbl>',paragraph('w','Example: a plant cell')+'</w:tc></w:tr></w:tbl>');
 const result=officeResult('docx',rich);assert.equal(result.items.length,1);assert.equal(result.items[0].answer,'First sentence.\nExample: a plant cell');
 assert.throws(()=>officeResult('docx','<w:tbl><w:tr>'),/incomplete table/);
});
test('table suggestions use existing deduplication, limits and header rejection',()=>{
 const rows=[['Term','Definition'],['Word','Meaning'],['Cell','Basic unit'],['CELL','Basic unit'],['','Empty'],['x'.repeat(161),'Too long'],['Long','x'.repeat(2001)],...Array.from({length:205},(_,i)=>['Concept '+i,'Answer '+i])];
 const result=officeResult('docx',table('w',rows)+paragraph('w','Cell: Basic unit'));
 assert.equal(result.items.length,200);assert.equal(result.items.filter(i=>i.term.toLowerCase()==='cell').length,1);assert.equal(result.sections.length,1);
 assert.ok(!result.items.some(i=>i.term==='Word'||i.term==='Long'));
});
test('project creation stays brief, and Today surfaces only meaningful scheduled work',()=>{
 assert.equal((projectCreationMarkup().match(/<label>/g)||[]).length,3);
 const projects=[{id:'due',title:'Workshop',status:'In progress',nextAction:'Send invitation',targetDate:'2026-10-26'},{id:'unscheduled',title:'Robotics',status:'In progress',nextAction:'Build'},{id:'done',title:'Done',status:'Completed',nextAction:'Old',targetDate:'2026-10-25'}];
 const today=projectTodayMarkup({projects},'2026-10-26');assert.match(today,/Send invitation/);assert.ok(!today.includes('Robotics'));assert.ok(!today.includes('Old'));
 const cards=projectCardsMarkup(projects,{today:'2026-10-26'});assert.match(cards,/completeproject/);assert.match(cards,/Outputs &amp; evidence/);assert.match(cards,/Activity history/);
});


test('project forms stay unique across activities, outputs and multiple milestones',()=>{
 const html=projectCardsMarkup([{id:'a',status:'In progress'},{id:'b',status:'In progress'}],{events:[{id:'m1',projectId:'a',kind:'milestone',title:'First'},{id:'m2',projectId:'a',kind:'milestone',title:'Second'}]});
 const ids=[...html.matchAll(/<form id="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);assert.ok(ids.includes('project-form-addevidence-a'));assert.ok(ids.includes('project-form-addevidence-b'));
});
