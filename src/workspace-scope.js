// Capture both the adapter and account identity. Never consult a newly opened
// student's adapter to send an older queued operation.
export function bindWorkspaceMutation(adapter,{currentAdapter,currentActor,actorId}){
  const studentId=adapter.studentId;
  const active=()=>currentAdapter()===adapter&&adapter.studentId===studentId&&currentActor()===actorId;
  const assertActive=()=>{
    if(active())return;
    const recoverable=currentAdapter()===adapter&&adapter.studentId===studentId&&!currentActor();
    // A prior attempt may have reached the server. Loss of the local session
    // must not turn that uncertainty into a confirmed rejection/rollback.
    throw Object.assign(new Error(recoverable?'Sign in with the same account to finish saving.':'This workspace is closed. Reopen it to review the saved record.'),{retryable:recoverable,rejected:false});
  };
  return {active,async compareConflict(id){
    assertActive();const comparison=await adapter.compareConflict(id);assertActive();
    return {latest:comparison.latest,accept(){assertActive();comparison.accept();}};
  },send(values,id){
    assertActive();
    return adapter.send(values,id);
  }};
}
