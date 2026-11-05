import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../portal.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function localTodayPlan(data)'),html.indexOf('function todayPlanPanel(plan)'));
const plan=runInNewContext(source+';localTodayPlan',{qatarToday:()=> '2026-09-14',dayDifference:date=>date?Math.round((Date.parse(date)-Date.parse('2026-09-14'))/86400000):null});

test('Today gives a real unfinished action a next step, and stops prioritizing completed or submitted work',()=>{
  const tasks=[{id:'task',title:'Correct five biology questions',status:'In progress'}];
  assert.equal(plan({tasks}).items[0].id,'task');
  for(const status of ['Completed','Submitted','Archived'])assert.equal(plan({tasks:[{...tasks[0],status}]}).items.length,0);
});
test('Today caps competing actions, assessments and reviews at three primary priorities',()=>{
  const result=plan({tasks:Array.from({length:7},(_,n)=>({id:'task'+n,title:'Action '+n,status:'Not started',dueDate:'2026-09-14'})),reviewCards:[{id:'review',term:'Mitosis',box:1}],assessments:[{id:'test',name:'Biology test',date:'2026-09-15'}]});
  assert.equal(result.items.length,3);assert.equal(new Set(result.items.map(item=>item.id)).size,3);
});
