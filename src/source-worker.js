import {extractOffice,finishExtraction} from './source-extraction.js';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
self.onmessage=async({data})=>{
 let document,pdfWorker;
 try{
  const {bytes,name,pdfWorkerUrl}=data,extension=name.split('.').at(-1).toLowerCase();let sections=[];
  if(['txt','md','csv'].includes(extension))sections=[{locator:'Text',text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)}];
  else if(['docx','pptx'].includes(extension))sections=extractOffice(new Uint8Array(bytes),extension);
  else if(extension==='pdf'){
   // Use an explicit nested worker: pdf.js otherwise expects window and can
   // fall back to a worker imported into this extraction worker's message port.
   pdfWorker=new Worker(pdfWorkerUrl,{type:'module'});GlobalWorkerOptions.workerPort=pdfWorker;
   document=await getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,enableXfa:false}).promise;
   if(document.numPages>200)throw new Error('Use a PDF with 200 pages or fewer, or split it into smaller files.');
   for(let page=1;page<=document.numPages;page++){
    const p=await document.getPage(page),content=await p.getTextContent();
    sections.push({locator:'Page '+page,text:content.items.map(i=>(i.str||'')+(i.hasEOL?'\n':' ')).join('')});p.cleanup();
   }
  }
  self.postMessage({type:'source-result',ok:true,extraction:finishExtraction(sections,'',extension==='csv')});
 }catch(error){self.postMessage({type:'source-result',ok:false,error:error.name==='PasswordException'?'This PDF is password protected. Upload an unlocked copy or add concepts manually.':error.message||'Text could not be read. You can still add concepts manually.'});}
 finally{await document?.destroy();pdfWorker?.terminate();}
};
