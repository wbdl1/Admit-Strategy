// Optional browser-native, on-device transcription only. Never falls back to a remote engine.
export class LocalDictation {
 constructor({Recognition=globalThis.SpeechRecognition,onText=()=>{},onInterim=()=>{},onStatus=()=>{},isActive=()=>true}={}){Object.assign(this,{Recognition,onText,onInterim,onStatus,isActive});}
 get supported(){return !!this.Recognition&&'processLocally' in this.Recognition.prototype&&typeof this.Recognition.available==='function';}
 async start(lang='en-US'){
  if(this.active||this.checking)return;this.checking=true;const generation=this.generation||0;
  try{
   if(!this.supported||await this.Recognition.available({langs:[lang],processLocally:true})!=='available'){this.onStatus('Speech input isn’t available on this device (on-device recognition unavailable). Type your explanation instead. No audio was sent.');return;}
   if(generation!==(this.generation||0)||!this.isActive())return;
   const r=new this.Recognition();r.processLocally=true;r.lang=lang;r.continuous=true;r.interimResults=true;this.recognition=r;
   r.onresult=e=>{if(!this.isActive()){this.stop();return;}let interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)this.onText(e.results[i][0].transcript);else interim+=e.results[i][0].transcript+' ';}this.onInterim(interim.trim());};
   r.onerror=()=>{this.onStatus('Dictation stopped. Your text is kept; type to continue.');this.stop();};
   r.onend=()=>{this.active=false;clearTimeout(this.timer);clearInterval(this.contextTimer);this.onStatus('Dictation stopped. Check your text and save your draft.');};
   r.start();this.active=true;this.onStatus('Listening on this device. Stop when finished; check the transcript before saving.');this.timer=setTimeout(()=>this.stop(),60000);this.contextTimer=setInterval(()=>{if(!this.isActive())this.stop();},500);
  }catch{this.onStatus('On-device dictation could not start. Type your explanation instead.');}finally{this.checking=false;}
 }
 stop(){this.generation=(this.generation||0)+1;clearTimeout(this.timer);clearInterval(this.contextTimer);try{this.recognition?.stop();}catch{}this.active=false;}
}
