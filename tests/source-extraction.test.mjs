import test from 'node:test';import assert from 'node:assert/strict';import {zipSync,strToU8} from 'fflate';
import {explicitPairs,extractOffice,finishExtraction,officeParagraphs} from '../src/source-extraction.js';
import {projectCreationMarkup,projectCardsMarkup,projectTodayMarkup} from '../src/projects.js';
test('plain text proposals require explicit pairs and retain source references',()=>{
 const sections=[{locator:'Page 4',text:'Cell: A basic unit\nCELL: A basic unit\nA paragraph about plants, without a question or expected answer.\nhttps://example.com\nATP\tEnergy carrier'}];
 const result=finishExtraction(sections);assert.equal(result.items.length,2);assert.equal(result.items[0].locator,'Page 4');assert.equal(result.items[0].excerpt,'Cell: A basic unit');assert.match(result.note,/do not identify importance/);
 assert.equal(finishExtraction([{locator:'Page 1',text:''}]).items.length,0);assert.match(finishExtraction([]).note,/No readable text/);
 assert.equal(explicitPairs([{locator:'Text',text:'term,answer\nNucleus,Stores DNA'}],{csv:true}).length,1);
});
test('Office extraction reads text only, keeps slide order and ignores links and executable content',()=>{
 const file=zipSync({'ppt/slides/slide2.xml':strToU8('<a:p><a:r><a:t>ATP: Energy carrier</a:t></a:r></a:p>'),'ppt/slides/slide1.xml':strToU8('<a:p><a:r><a:t>Cell: Unit &amp; structure</a:t></a:r></a:p>'),'ppt/_rels/slides.xml.rels':strToU8('https://do-not-fetch.invalid')});
 const result=extractOffice(file,'pptx');assert.equal(result.length,2);assert.equal(result[0].locator,'Slide 1');assert.equal(result[0].text,'Cell: Unit & structure');assert.equal(finishExtraction(result).items.length,2);
 assert.throws(()=>officeParagraphs('<!ENTITY bad>', 'w'),/unsupported XML/);
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
