import {saveDiagnosisDraft} from "./diagnosis.js";

window.AdmitMarketing={
  continueDiagnosis(lead){
    let draft;
    try{draft=saveDiagnosisDraft(localStorage,lead);}catch(error){throw new Error(error.message||"Allow this site to save your diagnosis while you sign in, then try again.");}
    const next=new URL("portal.html",location.href);next.searchParams.set("diagnosis",draft.id);location.assign(next.href);
  }
};
// Account code is fetched after the marketing content has rendered.
if(window.ADMIT_CONFIG?.backend==="supabase"){
  const booking=document.getElementById("bookingForm");
  booking.hidden=true;
  const box=document.createElement("div");box.className="card";
  box.innerHTML="<h3>Book your free first meeting</h3><p>Sign in to choose a time with your student details already filled in.</p><a class='btn primary' href='portal.html?book=1'>Continue to booking</a>";
  booking.before(box);
  document.getElementById("backendBox").hidden=true;
  import("./marketing-account.js").then(module=>module.updateAccountHeader()).catch(()=>{/* Login remains available when the connection fails. */});
}
