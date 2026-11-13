// Read-only check against the existing LOCAL PostgreSQL function. Never hosted.
import assert from 'node:assert/strict';
import {localConnection} from '../../backend/scripts/local-connection.mjs';
import {checkAnswer} from '../src/study-checking.js';
const db=await localConnection();let checked=0;
try {
 const values=['Stores DNA',' STORES   DNA!? ','Genetic material','DNA','nucleus DNA','unknown','',' ','\t','\nLife\n','célula','CÉLULA.','mañana','üBER','\u00a0hello\u00a0','µ²º','a-b','-a-'];
 const cases=[];
 for(const checking of ['normal','strict','loose'])for(const response of values)cases.push({expected:'Stores DNA',aliases:['Genetic material','célula'],keywords:['DNA','nucleus'],response,checking});
 for(const expected of values)for(const checking of ['normal','strict','loose'])cases.push({expected,aliases:[],keywords:[expected],response:expected.toUpperCase(),checking});
 for(const keyword of values)for(const response of values)cases.push({expected:'canonical',aliases:[],keywords:[keyword],response,checking:'loose'});
 for(const input of cases){const preview=checkAnswer(input);if(preview===null)continue;
  const {rows}=await db.query('select private.check_study_answer($1,$2,$3,$4,$5) as rating',[input.expected,input.aliases,input.keywords,input.response,input.checking]);
  assert.equal(preview,rows[0].rating,JSON.stringify(input));checked++;
 }
 console.log(`${checked} local/server grading parity cases passed; no writes.`);
}finally{await db.close();}
