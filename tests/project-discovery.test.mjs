import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PortalData} from '../src/portal-data.js';

const html=readFileSync(new URL('../portal.html',import.meta.url),'utf8');
test('opening Projects first loads the existing student-scoped records once',async()=>{
  const calls=[];
  const existing={id:'existing',row_version:3,title:'Robotics club',role:'Team member',stage:'Prototype',current_goal:'Finish the arm',next_action:'Test the grip',output:'Robot',impact:'School demonstration',long_term_direction:'Engineering',status:'in_progress'};
  const client={from(table){calls.push(['from',table]);const q={};for(const method of ['select','eq','is','order','limit'])q[method]=(...args)=>{calls.push([method,...args]);return q;};q.then=resolve=>resolve({data:[existing]});return q;}};
  const portal=new PortalData(client);portal.studentId='student';portal.data={classes:[],projects:[]};
  await Promise.all([portal.loadView('projects'),portal.loadView('projects')]);
  assert.deepEqual(calls.filter(c=>c[0]==='from'),[['from','projects']]);
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='student_id'&&c[2]==='student'));
  assert.ok(calls.some(c=>c[0]==='is'&&c[1]==='archived_at'&&c[2]===null));
  assert.equal(portal.data.projects[0].currentGoal,'Finish the arm');
  assert.equal(portal.data.projects[0].longTermDirection,'Engineering');
  assert.equal(portal.raw.get('projects:existing').row_version,3);
  await portal.loadView('projects');assert.equal(calls.filter(c=>c[0]==='from').length,1);
});

test('confirmed project changes refresh Projects without rebuilding unrelated study views',()=>{
  const context={};vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function affectedViews('),html.indexOf('function renderAffectedViews(')),context);
  for(const action of ['addproject','updateproject','archiveproject','restoreproject']){
    assert.deepEqual([...context.affectedViews(action)],['projects','progress']);
  }
  assert.deepEqual([...context.affectedViews('updateevidence')],['progress']);
});

test('the Projects destination reuses existing records and forms and keeps completed work',()=>{
  const original=[{id:'done',status:'Completed'},{id:'active',status:'In progress'}];let displayed;
  const context={currentData:{projects:original},canonicalPortal:{},addProjectForm:()=>'<form>existing add form</form>',projectList:items=>{displayed=items;return 'existing project list';}};
  vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function viewMarkup('),html.indexOf('function render(data,')),context);
  const rendered=context.viewMarkup('projects');
  assert.match(rendered,/Projects &amp; Activities/);assert.match(rendered,/existing add form/);assert.match(rendered,/existing project list/);
  assert.deepEqual(displayed.map(r=>r.id),['active','done']);assert.deepEqual(original.map(r=>r.id),['done','active']);
});
