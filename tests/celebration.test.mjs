import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCelebrator} from '../src/celebration.js';

test('confetti respects reduced motion and repeated confirmations; cleans itself up',()=>{
  let appended=0,removed=0,finish,reset=0;const motion={matches:true},bursts=[];
  const canvas={style:{},dataset:{},setAttribute(name,value){assert.equal(name,'aria-hidden');assert.equal(value,'true');},remove:()=>removed++};
  const document={hidden:false,createElement:()=>canvas,body:{append:()=>appended++},querySelector:()=>null,addEventListener(){},removeEventListener(){}};
  const celebrate=createCelebrator({document,matchMedia:()=>motion,setTimeout(fn,ms){assert.ok(ms<=1800);finish=fn;return 2;},clearTimeout(){}},(element,options)=>{
    assert.equal(element,canvas);assert.equal(options.disableForReducedMotion,true);
    const fire=options=>bursts.push(options);fire.reset=()=>reset++;return fire;
  });
  assert.equal(celebrate('diagnosis:1'),false);assert.equal(appended,0);
  motion.matches=false;assert.equal(celebrate('diagnosis:1'),true);assert.equal(celebrate('diagnosis:1'),false);assert.equal(appended,1);assert.equal(canvas.style.pointerEvents,'none');
  assert.equal(bursts.length,2);assert.equal(bursts.reduce((n,b)=>n+b.particleCount,0),56);
  finish();assert.equal(removed,1);assert.equal(reset,1);
  document.hidden=true;assert.equal(celebrate('booking:2'),false);
});
test('diagnosis celebration follows persistence, not the questionnaire result',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html.slice(html.indexOf('function showDiagnosis('),html.indexOf('function handleLeadResponse(')),/\.celebrate\(/);
  const legacy=html.slice(html.indexOf('function handleLeadResponse('),html.indexOf('function completionActions('));
  assert.ok(legacy.indexOf('if(data.ok)')<legacy.indexOf('.celebrate('));
  const account=readFileSync(new URL('../src/account.js',import.meta.url),'utf8');
  const finish=account.slice(account.indexOf('async finishDiagnosis()'),account.indexOf('  onboarding()'));
  assert.match(finish,/result\?\.ok!==true/);
  assert.ok(finish.indexOf('await this.portal.rpc("complete_diagnosis"')<finish.indexOf('celebrate('));
  assert.ok(finish.indexOf('Your diagnosis is saved')<finish.indexOf('celebrate('));
});
test('unsupported canvas cannot turn a confirmed booking into a failed save',()=>{
  const celebrate=createCelebrator({document:{createElement(){throw new Error('Canvas unavailable');}},matchMedia:()=>({matches:false})});
  assert.equal(celebrate('booking:1'),false);
});
