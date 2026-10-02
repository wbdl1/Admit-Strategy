import {saveDiagnosisDraft} from "./diagnosis.js";
import {celebrate} from "./celebration.js";
import {marketingAuthCallbackUrl} from "./auth-callback.js";

const authCallback=window.ADMIT_CONFIG?.backend==="supabase"?marketingAuthCallbackUrl(location.href):null;
if(authCallback)location.replace(authCallback);

window.AdmitMarketing={
  celebrate,
  continueDiagnosis(lead){
    let draft;
    try{draft=saveDiagnosisDraft(localStorage,lead);}catch(error){throw new Error(error.message||"Allow this site to save your diagnosis while you sign in, then try again.");}
    const next=new URL("portal.html",location.href);next.searchParams.set("diagnosis",draft.id);location.assign(next.href);
  }
};
// Account code is fetched after the marketing content has rendered.
if(window.ADMIT_CONFIG?.backend==="supabase"&&!authCallback){
  const explain=(id,text)=>{const node=document.getElementById(id);if(node)node.textContent=text;};
  explain("privacy-access-summary","Return through Log in with your verified account. Your workspace is shared only with your authorized guardian and coach. Contact Ryan to request access, correction or deletion.");
  explain("account-access-faq","Use Log in to return to the same workspace with your verified account. A student workspace is created once, and a guardian approves access from their own account. Your diagnosis is linked after sign-in.");
  explain("google-login-faq",window.ADMIT_CONFIG.googleEnabled?"Yes. Choose Continue with Google on the login screen, or use an email sign-in link. Google only shares the identity information needed to sign you in; it does not connect your calendar or school files.":"Email sign-in is available. Google sign-in will appear here after its configuration has been verified.");
  explain("calendar-faq","Add events manually or import an .ics calendar file. Confirm any assessment suggestions before they join your assessment list. Automatic Google or Microsoft calendar syncing is not active.");

  const booking=document.getElementById("bookingForm");
  booking.hidden=true;
  const box=document.createElement("div");box.className="card";
  box.innerHTML="<h3>Book your free first meeting</h3><p>Sign in to choose a time with your student details already filled in.</p><a class='btn primary' href='portal.html?book=1'>Continue to booking</a>";
  booking.before(box);
  document.getElementById("backendBox").hidden=true;
  import("./marketing-account.js").then(module=>module.updateAccountHeader()).catch(()=>{/* Login remains available when the connection fails. */});
}
