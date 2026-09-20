import test from 'node:test';
import assert from 'node:assert/strict';
import {createdPage,splitPage,assessmentPage,splitAssessmentPage} from '../src/page-cursor.js';
import {normalizeRecord} from '../src/portal-data.js';

test('pagination keeps timestamp precision and UUID tie breakers without repeating the lookahead row',()=>{
  const rows=Array.from({length:26},(_,n)=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),created_at:'2026-09-13T11:23:45.123456+00:00'}));
  const page=splitPage(rows);assert.equal(page.records.length,25);assert.equal(page.cursor.id,rows[24].id);
  const calls=[],query={order(...args){calls.push(['order',...args]);return this;},limit(n){assert.equal(n,26);return this;},or(text){calls.push(['or',text]);return this;}};
  createdPage(query,page.cursor);assert.match(calls.at(-1)[1],/123456/);assert.match(calls.at(-1)[1],new RegExp('id.lt.'+rows[24].id));
  assert.deepEqual(calls.slice(0,2),[['order','created_at',{ascending:false}],['order','id',{ascending:false}]]);
  assert.equal(splitPage(rows.slice(0,3)).cursor,null);
  assert.throws(()=>createdPage(query,{...page.cursor,created_at:'2026",id.gt.0'}),/Invalid page cursor/);
});

test('assessment cursors preserve optional times and reject filter injection',()=>{
  const row={id:'00000000-0000-4000-8000-000000000001',due_date:'2026-09-25',due_time:'10:00:00.123456'};
  const calls=[],query={order(...v){calls.push(v);return this;},limit(n){assert.equal(n,26);return this;},or(v){calls.push(v);return this;}};
  assessmentPage(query,row);assert.match(calls.at(-1),/due_time.gt.10:00:00.123456/);assert.match(calls.at(-1),/due_time.is.null/);
  assessmentPage(query,{...row,due_time:null});assert.match(calls.at(-1),/due_time.is.null,id.gt/);
  const page=splitAssessmentPage(Array.from({length:26},()=>row));assert.deepEqual(page.cursor,row);assert.equal(page.records.length,25);
  assert.equal(splitAssessmentPage([row]).cursor,null);
  for(const field of ['id','due_date','due_time'])assert.throws(()=>assessmentPage(query,{...row,[field]:'x),id.gt.0'}),/Invalid assessment cursor/);
});

test('proof changes cannot inherit an approval or feedback from an older version',()=>{
  const evidence={row_version:3,status:'submitted',proof_text:'Updated proof',evidence_reviews:[{evidence_version:2,status:'approved',feedback:'Earlier proof feedback'}]};
  for(const table of ['tasks','study_blocks','evidence']){
    const row=normalizeRecord(table,table==='evidence'?evidence:{evidence:[evidence]});
    assert.equal(row.coachReview,'Pending');assert.equal(row.coachFeedback,'');
  }
  evidence.evidence_reviews[0].evidence_version=3;
  assert.equal(normalizeRecord('evidence',evidence).coachReview,'Approved');
  evidence.evidence_reviews[0].archived_at='2026-09-13';
  assert.equal(normalizeRecord('evidence',evidence).coachReview,'Pending');
});
