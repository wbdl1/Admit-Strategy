import {boundedFetch} from "./network.js";
const types={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",txt:"text/plain",md:"text/plain",csv:"text/csv"};
const accept=Object.keys(types).map(x=>"."+x).join(",");
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
const button=(text,callback)=>{const b=element("button",text,"btn secondary");b.type="button";b.onclick=callback;return b;};
const rejected=message=>Object.assign(new Error(message),{retryable:false,rejected:true});

export function validateSelection(file){
  const extension=file.name.split(".").at(-1)?.toLowerCase(),mime=types[extension];
  if(!mime)throw rejected("Choose PDF, DOCX, PPTX, PNG, JPEG, WebP, TXT, Markdown or CSV.");
  if(file.size<1||file.size>20*1024*1024)throw rejected("Choose a file between 1 byte and 20 MB.");
  if(file.name.length>180||/[\/\\\x00-\x1f\x7f]/.test(file.name))throw rejected("Use a file name under 180 characters without slashes or control characters.");
  return mime;
}
function uploadBinary({url,token,key,file,mime,onProgress}){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open("POST",url);xhr.timeout=120000;
    xhr.setRequestHeader("Authorization","Bearer "+token);xhr.setRequestHeader("apikey",key);xhr.setRequestHeader("Content-Type",mime);xhr.setRequestHeader("x-upsert","false");
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded/event.total);};
    xhr.onload=()=>{let result={};try{result=JSON.parse(xhr.responseText);}catch{}
      if(xhr.status>=200&&xhr.status<300||Number(result.statusCode)===409||xhr.status===409)resolve();
      else reject(Object.assign(new Error(xhr.status===401?"Sign in again, then retry this upload.":"Upload was not confirmed. Retry the same file."),{retryable:true}));
    };
    xhr.onerror=xhr.ontimeout=()=>reject(Object.assign(new Error("Upload was interrupted. Your selected file is kept here for retry."),{retryable:true}));
    xhr.send(file);
  });
}

export class FileUploads {
  constructor({portal,config,onChange=()=>{},transport=uploadBinary,fetcher=boundedFetch(fetch,15000)}){
    Object.assign(this,{portal,config,onChange,transport,fetcher});this.jobs=new Map();
  }
  get unsaved(){return [...this.jobs.values()].filter(j=>j.state!=="saved"&&j.state!=="dismissed");}
  add(file,classId,material){
    const mime=validateSelection(file),job={id:crypto.randomUUID(),file,classId:classId||null,material,mime,state:"preparing",progress:0};
    this.jobs.set(job.id,job);this.onChange(job);job.done=this.run(job);return job;
  }
  async run(job){
    if(job.running)return job.done;job.running=true;
    try{
      if(!job.args){
        job.state="preparing";this.onChange(job);
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await job.file.arrayBuffer())),b=>b.toString(16).padStart(2,"0")).join("");
        job.args={p_student_id:this.portal.studentId,p_class_id:job.classId,p_name:job.file.name,p_mime:job.mime,p_size:job.file.size,p_sha256:hash,p_request_key:job.id,p_material_id:job.material?.id||null,p_material_version:job.material?._version||null};
      }
      job.state="uploading";this.onChange(job);
      const reservation=await this.portal.rpc("reserve_file_upload",job.args);job.record=reservation.file;
      const current=await this.portal.result(this.portal.client.from("files").select("state").eq("id",job.record.id).single());
      const {data,error}=await this.portal.client.auth.getSession();if(error||!data.session)throw Object.assign(new Error("Sign in again, then retry this upload."),{retryable:true});
      if(current.state!=="ready")await this.transport({url:this.config.supabaseUrl+"/storage/v1/object/student-files/"+job.record.storage_path,token:data.session.access_token,key:this.config.publishableKey,file:job.file,mime:job.mime,onProgress:progress=>{job.progress=progress;this.onChange(job);}});
      job.state="validating";job.progress=1;this.onChange(job);
      const response=await this.fetcher(this.config.supabaseUrl+"/functions/v1/file-validate",{method:"POST",headers:{Authorization:"Bearer "+data.session.access_token,apikey:this.config.publishableKey,"Content-Type":"application/json"},body:JSON.stringify({fileId:job.record.id})});
      const saved=await response.json();
      if(!response.ok||saved.ok!==true||saved.file?.state!=="ready"||!saved.material?.id)throw Object.assign(new Error(saved.error||"File validation was not confirmed. Retry."),{retryable:![400,403,422].includes(response.status),rejected:[400,403,422].includes(response.status),traceId:saved.traceId});
      this.portal.ingest("study_materials",[saved.material],{confirmed:true});job.result=saved;job.state="saved";job.file=null;
    }catch(error){job.state="failed";job.error=error;}
    finally{job.running=false;this.onChange(job);}
  }
  retry(id){const job=this.jobs.get(id);if(!job||job.running||job.state!=="failed"||job.error?.retryable===false)return;job.done=this.run(job);return job.done;}
}

export class FilesWorkspace {
  constructor({portal,config,onChange=()=>{}}){
    this.portal=portal;this.config=config;this.onChange=onChange;this.widgets=new Map();this.operationKeys=new Map();
    this.uploads=new FileUploads({portal,config,onChange:()=>{this.refreshAll();this.onChange();}});
  }
  mountAll(){
    for(const root of document.querySelectorAll("[data-file-workspace]")){
      if(!this.widgets.has(root))this.mount(root);
    }
    for(const root of this.widgets.keys())if(!root.isConnected)this.widgets.delete(root);
    this.refreshAll();
  }
  mount(root){
    const classId=root.dataset.fileClass||null,heading=element("h3","Files"),list=element("div",null,"list"),jobs=element("div",null,"file-jobs"),status=element("p",null,"form-help");status.setAttribute("role","status");
    root.append(heading,list);const widget={root,classId,materialId:root.dataset.fileMaterial||null,list,jobs,status};this.widgets.set(root,widget);
    if(this.portal.canEdit){
      const drop=element("div",null,"file-drop"),label=element("label","Upload schoolwork"),picker=element("input");picker.type="file";picker.accept=accept;label.append(picker);
      drop.append(label,element("p","Choose a file or drop it here. Up to 20 MB. PDF, Word, PowerPoint, images or text.","form-help"));
      const add=file=>{if(!file)return;try{this.uploads.add(file,classId);status.textContent="";}catch(error){status.textContent=error.message;status.setAttribute("role","alert");}};
      picker.onchange=()=>{add(picker.files[0]);picker.value="";};
      drop.ondragover=event=>{event.preventDefault();drop.classList.add("drag-over");};drop.ondragleave=()=>drop.classList.remove("drag-over");
      drop.ondrop=event=>{event.preventDefault();drop.classList.remove("drag-over");const files=[...event.dataTransfer.files];if(files.length!==1){status.textContent="Drop one file at a time.";return;}add(files[0]);};
      root.append(drop,jobs);
      const trash=element("details"),summary=element("summary","Recently removed files"),trashList=element("div");trash.append(summary,trashList);root.append(trash);
      trash.ontoggle=()=>{if(trash.open)this.loadTrash(widget,trashList);};
    }
    root.append(status);this.refresh(widget);
  }
  refreshAll(){for(const widget of this.widgets.values())if(widget.root.isConnected)this.refresh(widget);}
  refresh(widget){
    const records=this.portal.data.materials.filter(m=>m.fileId&&m.status!=="Archived"&&(!widget.classId||m.classId===widget.classId)&&(!widget.materialId||m.id===widget.materialId));
    const wanted=new Set(records.map(r=>r.id));
    for(const row of widget.list.querySelectorAll("[data-file-row]"))if(!wanted.has(row.dataset.fileRow))row.remove();
    const empty=widget.list.querySelector("[data-file-empty]");if(records.length)empty?.remove();else if(!empty){const note=element("p","No files uploaded yet.","empty");note.dataset.fileEmpty="";widget.list.append(note);}
    for(const record of records){
      let row=[...widget.list.children].find(node=>node.dataset.fileRow===record.id);
      if(!row){row=element("article",null,"item");row.dataset.fileRow=record.id;const title=element("strong"),actions=element("div",null,"record-actions");row.append(title,actions);
        actions.append(button("Download",event=>this.download(record,event.currentTarget,widget)));
        if(this.portal.canEdit){
          const picker=element("input");picker.type="file";picker.accept=accept;picker.hidden=true;picker.setAttribute("aria-label","Replacement file for "+record.title);
          picker.onchange=()=>{const file=picker.files[0];if(file)try{this.uploads.add(file,record.classId,record);}catch(error){widget.status.textContent=error.message;}picker.value="";};
          actions.append(button("Replace file",()=>picker.click()),button("Remove",event=>this.archive(record,false,event.currentTarget,widget)),picker);
        }
        widget.list.append(row);
      }
      row.querySelector("strong").textContent=record.title;
    }
    for(const job of this.uploads.jobs.values()){
      if(widget.classId&&job.classId!==widget.classId)continue;
      let row=[...widget.jobs.children].find(node=>node.dataset.uploadId===job.id);
      if(!row){row=element("div",null,"file-job");row.dataset.uploadId=job.id;row.append(element("strong",job.args?.p_name||job.file?.name),element("progress"),element("p"),button("Retry upload",()=>this.uploads.retry(job.id)));row.querySelector("progress").max=100;row.querySelector("progress").setAttribute("aria-label","Upload progress");row.querySelector("p").setAttribute("role","status");widget.jobs.append(row);}
      const labels={preparing:"Preparing file…",uploading:"Uploading… "+Math.round(job.progress*100)+"%",validating:"Upload complete. Checking the file…",saved:"Saved ✓",failed:job.error?.message||"Upload failed. Retry."};
      row.querySelector("p").textContent=labels[job.state];const progress=row.querySelector("progress");progress.value=Math.round(job.progress*100);progress.hidden=["saved","failed"].includes(job.state);
      row.querySelector("button").hidden=job.state!=="failed"||job.error?.retryable===false;
    }
  }
  async download(record,b,widget){
    b.disabled=true;widget.status.textContent="Preparing a private download…";
    try{
      const file=await this.portal.result(this.portal.client.from("files").select("storage_path,original_name").eq("id",record.fileId).eq("state","ready").is("archived_at",null).single());
      const {data,error}=await this.portal.client.storage.from("student-files").createSignedUrl(file.storage_path,60,{download:file.original_name});if(error)throw new Error("Download could not be prepared. Try again.");
      const link=element("a");link.href=data.signedUrl;link.download=file.original_name;link.rel="noopener";document.body.append(link);link.click();link.remove();widget.status.textContent="Your download is ready.";
    }catch(error){widget.status.textContent=error.message;}finally{b.disabled=false;}
  }
  async archive(record,restore,b,widget){
    const fileId=record.fileId||record.id,key=fileId+":"+restore;
    if(!this.operationKeys.has(key))this.operationKeys.set(key,crypto.randomUUID());
    b.disabled=true;widget.status.textContent=restore?"Restoring…":"Removing…";
    try{
      await this.portal.rpc("archive_file",{p_file_id:fileId,p_restore:restore,p_request_key:this.operationKeys.get(key)});
      const rows=await this.portal.result(this.portal.client.from("study_materials").select("*").eq("file_id",fileId).eq("student_id",this.portal.studentId));
      this.portal.ingest("study_materials",rows,{confirmed:true});this.refreshAll();this.onChange();widget.status.textContent=restore?"Restored ✓":"Removed. You can restore this file for 30 days.";
      this.operationKeys.delete(fileId+":"+!restore);
      if(restore)b.closest("article")?.remove();
    }catch(error){widget.status.textContent=error.message;}finally{b.disabled=false;}
  }
  async loadTrash(widget,target){
    target.replaceChildren(element("p","Loading removed files…"));
    try{
      let query=this.portal.client.from("files").select("id,original_name").eq("student_id",this.portal.studentId).eq("state","deleted").is("purged_at",null).gte("archived_at",new Date(Date.now()-30*86400000).toISOString()).order("archived_at",{ascending:false}).limit(25);
      if(widget.classId)query=query.eq("class_id",widget.classId);
      const files=await this.portal.result(query);target.replaceChildren();
      if(!files.length)target.append(element("p","No recently removed files."));
      for(const file of files){const row=element("article",null,"item");row.append(element("span",file.original_name),button("Restore",event=>this.archive(file,true,event.currentTarget,widget)));target.append(row);}
    }catch(error){target.replaceChildren(element("p",error.message),button("Retry",()=>this.loadTrash(widget,target)));}
  }
}
