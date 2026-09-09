// Capture both the adapter and account identity. Never consult a newly opened
// student's adapter to send an older queued operation.
export function bindWorkspaceMutation(adapter,{currentAdapter,currentActor,actorId}){
  const studentId=adapter.studentId;
  const active=()=>currentAdapter()===adapter&&adapter.studentId===studentId&&currentActor()===actorId;
  return {active,send(values,id){
    if(!active())throw Object.assign(new Error('This workspace is closed. Reopen it to review the saved record.'),{retryable:false,rejected:true});
    return adapter.send(values,id);
  }};
}
