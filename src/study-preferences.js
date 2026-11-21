const methods=['flashcard','quiz_choice','quiz_written','learn','blurting','feynman'];
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);
// Only UI choices and opaque IDs; never answers, private text or learner state.
export class StudyPreferences {
 constructor(actor,student,storage){this.key=actor&&student?`admit-study-preferences:v1:${actor}:${student}`:null;this.storage=storage;}
 read(){try{return this.key?JSON.parse((this.storage||localStorage).getItem(this.key)||'{}'):{};}catch{return {};}}
 class(id){const value=this.read()?.classes?.[id]||{};return {method:methods.includes(value.method)?value.method:'flashcard',quizFormat:['quiz_choice','quiz_written'].includes(value.quizFormat)?value.quizFormat:'quiz_choice',checking:['normal','strict','loose'].includes(value.checking)?value.checking:'normal',unit:typeof value.unit==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value.unit)?value.unit:'all'};}
 lastClass(){const value=this.read()?.lastClass;return id(value)?value:'';}
 save(classId,value={}){if(!this.key||!id(classId))return;try{const old=this.read(),classes={...old?.classes,[classId]:{...this.class(classId),...value}};const checked=this.classFrom(classes[classId]);(this.storage||localStorage).setItem(this.key,JSON.stringify({lastClass:classId,classes:{...Object.fromEntries(Object.entries(classes).slice(-100)),[classId]:checked}}));}catch{/* Private browsing/storage disabled: practice still works. */}}
 classFrom(value){return {method:methods.includes(value.method)?value.method:'flashcard',quizFormat:['quiz_choice','quiz_written'].includes(value.quizFormat)?value.quizFormat:'quiz_choice',checking:['normal','strict','loose'].includes(value.checking)?value.checking:'normal',unit:id(value.unit)?value.unit:'all'};}
}
