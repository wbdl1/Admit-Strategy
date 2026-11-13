import {checkAnswer,verdictLabel} from './study-checking.js';
import {answerChoices} from './study-methods.js';
export const sampleCards=Object.freeze([
 {id:'nucleus',unit_id:'sample-cells',term:'Nucleus',prompt:'Which cell structure stores genetic information?',answer:'Nucleus'},
 {id:'membrane',unit_id:'sample-cells',term:'Cell membrane',prompt:'Which structure controls what enters and leaves the cell?',answer:'Cell membrane',accepted_answers:['The cell membrane']},
 {id:'ribosomes',unit_id:'sample-cells',term:'Ribosomes',prompt:'Which cell structures make proteins?',answer:'Ribosomes'},
 {id:'mitochondria',unit_id:'sample-cells',term:'Mitochondria',prompt:'Which cell structures release usable energy from food?',answer:'Mitochondria'}
]);
export class GuestStudy {
 constructor(method='quiz_choice'){this.method=method;this.queue=sampleCards.map(c=>c.id);this.position=0;this.results=[];this.repeats=new Set();this.revealed=false;this.feedback=null;}
 get card(){return sampleCards.find(c=>c.id===this.queue[this.position]);}
 choices(){return this.card?answerChoices(this.card,sampleCards,'guest-'+this.position):[];}
 answer(response,rating){if(!this.card||this.feedback)return;const result=this.method==='flashcard'?rating:checkAnswer({...this.card,expected:this.card.answer,aliases:this.card.accepted_answers||[],response});if(!['knew','partly','missed'].includes(result))return;
  this.feedback={rating:result,response,answer:this.card.answer};this.results.push({id:this.card.id,rating:result});
  if(this.method==='learn'&&result!=='knew'&&!this.repeats.has(this.card.id)){this.queue.push(this.card.id);this.repeats.add(this.card.id);}
 }
 next(){if(!this.feedback)return;this.position++;this.feedback=null;this.revealed=false;}
}
export function guestResultLabel(rating){return verdictLabel(rating);}
