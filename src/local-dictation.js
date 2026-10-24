// Optional on-device speech only. No remote fallback or automatic language download.
export const speechMessages={
 unsupported:"Speech input isn’t available on this device yet. You can type your explanation instead.",
 unavailable:"On-device English speech recognition isn’t available in this browser. You can type your explanation instead.",
 downloadable:"The English on-device language pack isn’t installed. You can type your explanation instead.",
 downloading:"The English on-device language pack is still downloading. Type now, or check again when it finishes.",
 blocked:"Microphone access is blocked. Allow microphone access or type your explanation instead.",
 policy:"This browser blocks on-device speech recognition here. You can type your explanation instead.",
 error:"Speech input couldn’t start. Your text is kept; you can type or try again.",
 available:"Speech stays on this device. Your words appear below; save when you’re finished."
};
export class LocalDictation {
 constructor({Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition,onText=()=>{},onInterim=()=>{},onStatus=()=>{},onState=()=>{},isActive=()=>true,permissions=globalThis.navigator?.permissions}={}){Object.assign(this,{Recognition,onText,onInterim,onStatus,onState,isActive,permissions});}
 get supported(){return !!this.Recognition&&'processLocally' in this.Recognition.prototype&&typeof this.Recognition.available==='function';}
 async probe(lang='en-US'){
  if(!this.supported)return {state:'unsupported',message:speechMessages.unsupported};
  try{const permission=await this.permissions?.query({name:'microphone'});if(permission?.state==='denied')return {state:'blocked',message:speechMessages.blocked};}catch{/* Browser may not support permission inspection. */}
  try{const state=await this.Recognition.available({langs:[lang],processLocally:true});return {state,message:speechMessages[state]||speechMessages.unavailable};}
  catch(error){const state=['NotAllowedError','SecurityError'].includes(error.name)?'policy':'error';return {state,message:speechMessages[state]};}
 }
 async start(lang='en-US'){
  if(this.active||this.checking)return;this.checking=true;this.endMessage='';const generation=this.generation||0;
  try{
   const support=await this.probe(lang);if(generation!==(this.generation||0)||!this.isActive())return;
   if(support.state!=='available'){this.onState(support.state);this.onStatus(support.message);return;}
   const r=new this.Recognition();r.processLocally=true;
   if(r.processLocally!==true)throw new Error('On-device processing unavailable');
   r.lang=lang;r.continuous=true;r.interimResults=true;this.recognition=r;
   r.onstart=()=>{if(!this.isActive()){this.stop();return;}this.onState('listening');this.onStatus('Listening…');};
   r.onresult=e=>{if(!this.isActive()){this.stop();return;}let interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)this.onText(e.results[i][0].transcript);else interim+=e.results[i][0].transcript+' ';}this.onInterim(interim.trim());};
   r.onerror=e=>{this.endMessage=['not-allowed','service-not-allowed'].includes(e.error)?speechMessages.blocked:e.error==='language-not-supported'?speechMessages.downloadable:e.error==='no-speech'?'No speech was heard. Try again, or type your explanation.':speechMessages.error;this.onStatus(this.endMessage);this.onState(['not-allowed','service-not-allowed'].includes(e.error)?'blocked':'error');this.stop();};
   r.onend=()=>{this.active=false;clearTimeout(this.timer);clearInterval(this.contextTimer);this.onState('stopped');this.onStatus(this.endMessage||'Stopped. Your transcript is kept. Check it, then save your explanation.');};
   this.onState('starting');this.onStatus('Starting microphone…');r.start();this.active=true;
   this.timer=setTimeout(()=>this.stop(),60000);this.contextTimer=setInterval(()=>{if(!this.isActive())this.stop();},500);
  }catch{this.onState('error');this.onStatus(speechMessages.error);}finally{this.checking=false;}
 }
 stop(){this.generation=(this.generation||0)+1;clearTimeout(this.timer);clearInterval(this.contextTimer);try{this.recognition?.stop();}catch{}this.active=false;}
}
