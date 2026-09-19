import {MutationQueue} from './mutation-queue.js';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
const button=(text,fn)=>{const node=el('button',text);node.type='button';node.className='btn secondary';node.onclick=fn;return node;};

export function openAccountAccess(account,studentId=account.portal.studentId){
  if(!studentId||account.access&&!account.access.canLeave())return;
  account.access?.dispose();
  const actor=account.user.id,adapter=account.portal,dialog=el('dialog'),head=el('div'),body=el('div'),title=el('h2','Account and guardian approval');
  dialog.className='editor-dialog account-access-dialog';head.className='editor-head';body.className='editor-body';title.id='account-access-title';dialog.setAttribute('aria-labelledby',title.id);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  let current,disposed=false;const forms=new Map();
  const freeze=value=>body.querySelectorAll('fieldset').forEach(field=>field.disabled=value);
  const summary=el('p');
  const describe=()=>{summary.textContent='Workspace: '+current.status.replaceAll('_',' ')+'. Account: '+(current.account_disabled?'disabled':current.account_linked?'linked':'awaiting first login')+'. Guardian: '+(current.guardian_approved?'approved':'approval required')+'.';};
  const queue=new MutationQueue({
    send:(values,id)=>{
      if(disposed||account.user?.id!==actor)throw Object.assign(new Error('Sign in with the original account before retrying.'),{rejected:true,retryable:false});
      return adapter.rpc(values.rpc,{...values.args,p_request_key:id});
    },
    optimistic:()=>{freeze(true);},
    confirm:(job,response)=>{current=response.record;describe();const form=forms.get(job.id);form?.removeAttribute('data-dirty');},
    onState:job=>{
      if(disposed)return;
      status.replaceChildren();
      if(job.state==='saved'){status.textContent='Saved ✓';freeze(false);}
      else if(job.state==='failed'){
        status.textContent=(job.error.rejected?'Not saved. ':'Save unconfirmed. ')+job.error.message+' Your input is kept.';
        if(job.error.retryable!==false)status.append(button('Retry same save',()=>queue.retry(job.id)));
        if(job.error.rejected){freeze(false);job.state='superseded';}
        if(job.error.code==='P0409')status.append(button('Check latest account status',async()=>{
          try{current=await adapter.rpc('workspace_access',{p_student_id:studentId});describe();status.textContent='Latest status loaded. Your draft is kept. Review it before saving again.';}catch(error){status.textContent=error.message;}
        }));
      }else status.textContent=job.state==='retrying'?'Saving… retrying safely.':'Saving…';
    }
  });
  const save=(form,rpc,args)=>{const id=crypto.randomUUID();forms.set(id,form);queue.enqueue({rpc,args},{id,key:studentId});};
  const addForm=(labelText,name,type,value,submit)=>{
    const form=el('form'),fieldset=el('fieldset'),label=el('label',labelText),input=el(Array.isArray(type)?'select':'input');form.className='portal-form';
    input.name=name;if(Array.isArray(type))for(const [value,title] of type){const option=el('option',title);option.value=value;input.append(option);}else{input.type=type;input.maxLength=254;}
    input.value=value||'';input.required=true;label.append(input);fieldset.append(label);const submitButton=button('Save',()=>{});submitButton.type='submit';fieldset.append(submitButton);form.append(fieldset);
    form.oninput=()=>form.dataset.dirty='true';form.onsubmit=event=>{event.preventDefault();if(form.reportValidity()&&!queue.unsaved.length)submit(input.value,form);};body.append(form);return form;
  };
  const view={
    get unsaved(){return queue.unsaved;},
    canLeave(){
      if(queue.unsaved.length){status.textContent='Finish or retry the unconfirmed save before closing.';return false;}
      return !body.querySelector('form[data-dirty]')||window.confirm('Discard the unsaved account form input?');
    },
    dispose(){disposed=true;window.removeEventListener('beforeunload',beforeUnload);dialog.remove();if(account.access===view)account.access=null;}
  };
  const beforeUnload=event=>{if(queue.unsaved.length||body.querySelector('form[data-dirty]')){event.preventDefault();event.returnValue='';}};
  const load=async()=>{
    status.textContent='Checking account status…';
    try{
      current=await adapter.rpc('workspace_access',{p_student_id:studentId});if(disposed||account.user?.id!==actor)return;
      body.replaceChildren(summary);describe();
      if(!current.guardian_approved&&['pending_guardian','review_required'].includes(current.status)){
        body.append(el('p','Your guardian must log in to Admit Strategy using the email below and approve your workspace from their own account. You can correct a typo or renew an expired request here.'));
        if(current.invitation)body.append(el('p','Current request expires '+new Date(current.invitation.expires_at).toLocaleDateString()+'.'));
        const form=addForm('Parent or guardian email','guardian','email',current.invitation?.email,(email,form)=>save(form,'replace_guardian_request',{p_student_id:studentId,p_email:email,p_expected_version:current.student_version}));
        form.querySelector('button').textContent='Update guardian request';
        body.append(el('p','Saving updates the request. It does not send an email. Ask your guardian to open Admit Strategy → Log in.'));
      }
      if(current.can_manage_status){
        addForm('Workspace access','status',[['pending_guardian','Await guardian approval'],['active','Academic editing enabled'],['suspended','Academic editing paused']],current.status,(value,form)=>save(form,'coach_update_student_status',{p_student_id:studentId,p_status:value,p_expected_version:current.student_version}));
        body.append(el('p','Enabling academic editing requires a verified linked account and active guardian approval. Pausing editing preserves records.'));
      }
      if(current.can_disable_account){
        const warning=el('label'),acknowledgement=el('input');acknowledgement.type='checkbox';
        warning.append(acknowledgement,document.createTextNode(' I understand that disabling this account immediately blocks access to student data. Records are preserved.'));
        warning.hidden=true;
        const form=addForm('Student account access','enabled',[['true','Enabled'],['false','Disabled']],String(!current.account_disabled),(value,form)=>{
          if(value==='false'&&!acknowledgement.checked){status.textContent='Confirm that you understand the access change before saving.';acknowledgement.focus();return;}
          save(form,'admin_set_student_account_enabled',{p_student_id:studentId,p_enabled:value==='true',p_expected_version:current.profile_version});
        });
        const select=form.querySelector('select');
        select.addEventListener('change',()=>{warning.hidden=select.value!=='false';acknowledgement.checked=false;});
        form.querySelector('fieldset').insertBefore(warning,form.querySelector('button'));
        warning.hidden=select.value!=='false';
        form.querySelector('button').textContent='Save account access';
      }
      body.append(button('Check approval and return',async()=>{
        if(!view.canLeave())return;
        status.textContent='Checking approval…';
        try{
          current=await adapter.rpc('workspace_access',{p_student_id:studentId});describe();
          if(account.ownStudentId===studentId){account.loadedUser=null;await account.refresh();}
          dialog.close();
        }catch(error){status.textContent=error.message;}
      }),status);status.textContent='Account status loaded.';
    }catch(error){status.replaceChildren(el('span',error.message),button('Retry account status',load));}
  };
  head.append(title,button('Close',()=>{if(view.canLeave())dialog.close();}));body.append(status);dialog.append(head,body);document.body.append(dialog);
  dialog.oncancel=event=>{if(!view.canLeave())event.preventDefault();};dialog.onclose=()=>view.dispose();window.addEventListener('beforeunload',beforeUnload);
  account.access=view;dialog.showModal();load();return view;
}
