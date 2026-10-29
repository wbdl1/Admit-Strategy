import test from 'node:test';
import assert from 'node:assert/strict';
import {answerChoices,latestConceptOutcomes} from '../src/study-methods.js';
test('choices use distinct same-unit active answers, exclude aliases and fall back safely',()=>{
 const card={id:'a',unit_id:'u',answer:'Cellular energy',accepted_answers:['Energy for cells']};
 const pool=[card,{id:'b',unit_id:'u',answer:'Contains DNA'},{id:'c',unit_id:'u',answer:'Makes proteins'},{id:'d',unit_id:'u',answer:'Breaks down waste'},{id:'e',unit_id:'u',answer:'ENERGY FOR CELLS.'},{id:'f',unit_id:'other',answer:'Wrong class'},{id:'g',unit_id:'u',answer:'Archived one',archived_at:'now'}];
 const choices=answerChoices(card,pool,'session');assert.equal(choices.length,4);assert.ok(choices.includes(card.answer));assert.ok(!choices.includes('ENERGY FOR CELLS.'));assert.ok(!choices.includes('Wrong class'));assert.deepEqual(choices,answerChoices(card,pool,'session'));
 assert.deepEqual(answerChoices(card,pool.slice(0,3)),[]);assert.deepEqual(answerChoices({...card,answer:'a'.repeat(241)},pool),[]);
});
test('Learn summary distinguishes unique concepts from repeated attempts',()=>{
 assert.deepEqual(latestConceptOutcomes([{position:1,review_card_id:'a',rating:'missed',answered_at:'now'},{position:3,review_card_id:'a',rating:'knew',answered_at:'now'},{position:2,review_card_id:'b',rating:'partly',answered_at:'now'}]),{concepts:2,knew:1,partly:1,missed:0});
});
