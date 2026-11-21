import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createWorker} from 'tesseract.js';
import {photoDimensions} from '../src/photo-size.js';
import {photoExtraction} from '../src/photo-review.js';

test('local English reader extracts actual worksheet pixels and handles a blank image', {timeout:45000}, async () => {
 const language = fileURLToPath(new URL('../node_modules/@tesseract.js-data/eng/4.0.0_best_int/',import.meta.url));
 const worker = await createWorker('eng', 1, {langPath:language, cacheMethod:'none'});
 try {
  for (const file of ['biology-printed.jpg', 'biology-tilted.jpg','algebra-printed.png','blank.png']) {
   const bytes = await readFile(new URL('./fixtures/photos/'+file,import.meta.url));
   assert.ok(photoDimensions(bytes).width >= 800);
   const {data} = await worker.recognize(bytes);
   if(file==='blank.png') { assert.equal(data.text.trim(),''); continue; }
   const result = photoExtraction(data.text);
   if(file.startsWith('biology')) {
    for(const term of ['Nucleus','Cell membrane','Cytoplasm','Mitochondria']) assert.ok(result.items.some(i=>i.term===term),file+' '+term);
   } else {
    assert.equal(result.items.length,0);
    assert.ok(result.sections[0].targets.length>=3,'printed algebra skills');
   }
  }
 } finally { await worker.terminate(); }
});
test('oversized photo dimensions fail before bitmap decoding',async()=>{
 const bytes=Buffer.from(await readFile(new URL('./fixtures/photos/blank.png',import.meta.url)));
 bytes.writeUInt32BE(16000,16);
 assert.throws(()=>photoDimensions(bytes),/too large/);
});
