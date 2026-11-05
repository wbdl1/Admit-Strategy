import {createClient} from '@supabase/supabase-js';
import {boundedFetch} from './network.js';
import {packCode,packPreviewMarkup,showPackImages,packAsset} from './study-packs.js';
const root=document.getElementById('pack-preview'),status=document.getElementById('pack-status');
const client=createClient(window.ADMIT_CONFIG.supabaseUrl,window.ADMIT_CONFIG.publishableKey,{global:{fetch:boundedFetch()},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
let urls=[];
async function open(code){
 status.textContent='Loading pack…';root.replaceChildren();urls.forEach(URL.revokeObjectURL);urls=[];
 try{
  const {data,error}=await client.rpc('preview_study_pack',{p_code:code});if(error)throw Error(error.message||'This pack is unavailable. Ask its creator for a current link.');
  root.innerHTML=packPreviewMarkup(data.manifest);
  let visit;try{visit=sessionStorage.getItem('admit-pack-visit:'+code);if(!visit){visit=crypto.randomUUID();sessionStorage.setItem('admit-pack-visit:'+code,visit);}}catch{visit=crypto.randomUUID();}Promise.resolve(client.rpc('record_study_pack_open',{p_code:code,p_visit_key:visit})).catch(()=>{});
  const stamp=document.createElement('p');stamp.textContent='Shared '+new Date(data.published_at).toLocaleDateString();root.querySelector('header').append(stamp);
  const next=document.createElement('a');next.className='btn';next.href='portal.html#pack='+code;next.textContent='Add to my class';root.prepend(next);
  const note=document.createElement('p');note.textContent='Sign in to add an editable copy. Your results and reviews stay private.';next.after(note);
  status.textContent='';urls=await showPackImages(root,data.manifest,m=>packAsset(client,{action:'image',code,modelKey:m.key}));
 }catch(error){status.textContent=error.message;}
}
document.getElementById('pack-open').addEventListener('submit',e=>{e.preventDefault();const code=packCode(e.target.elements.code.value);if(code){const url=new URL(location.href);url.hash='pack='+code;history.replaceState(null,'',url);open(code);}else status.textContent='Paste an Admit Strategy pack link or its full code.';});
const code=packCode(location.href);if(code)open(code);else status.textContent='Paste a pack link or code to preview its material.';
