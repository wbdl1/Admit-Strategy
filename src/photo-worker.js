import {createWorker} from 'tesseract.js';
import {PHOTO_TEXT_LIMIT} from './photo-review.js';
import {photoDimensions} from './photo-size.js';
// Only this worker loads OCR. All engine/language assets must be same-origin.
let running=false;
self.onmessage=async({data})=>{
 if(running)return;running=true;let worker,bitmap;
 try{
  const paths=Object.fromEntries(['workerPath','corePath','langPath'].map(key=>{
   const url=new URL(data[key],self.location.href);
   if(url.origin!==self.location.origin)throw new Error('Photo reading assets must be hosted by Admit Strategy.');
   return [key,url.href];
  }));
  if(data.bytes.byteLength>20*1024*1024)throw new Error('Use an image under 20 MB.');
  if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')throw new Error('Photo reading is not available in this browser. Try an updated browser, type the text, or use this image as a Model.');
  photoDimensions(data.bytes);
  bitmap=await createImageBitmap(new Blob([data.bytes],{type:data.mime}));
  if(bitmap.width*bitmap.height>24000000)throw new Error('This photo is too large. Crop it to one page or use an image under 24 megapixels.');
  const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
  const canvas=new OffscreenCanvas(Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=null;
  const image=await canvas.convertToBlob({type:'image/png'});
  worker=await createWorker('eng',1,{...paths,workerBlobURL:false,cacheMethod:'none',logger:m=>self.postMessage({type:'source-progress',stage:m.status,progress:m.progress}),errorHandler:()=>{}});
  const {data:result}=await worker.recognize(new Uint8Array(await image.arrayBuffer()));
  if(result.text.length>PHOTO_TEXT_LIMIT)throw new Error('Too much text for one photo. Crop it to one page and try again.');
  self.postMessage({type:'source-result',ok:true,extraction:{photo:true,text:result.text,rawText:result.text,confidence:result.confidence}});
 }catch(error){self.postMessage({type:'source-result',ok:false,error:error.message||'This photo could not be read. Try a clearer image or type the text.'});}
 finally{bitmap?.close();await worker?.terminate();running=false;}
};
