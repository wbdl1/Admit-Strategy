import confetti from 'canvas-confetti';

// Reuse the original booking celebration's two-sided canvas-confetti burst.
// Bundle it locally, bound its duration, and keep it outside transaction state.
export function createCelebrator(environment=globalThis,create=confetti.create){
  const seen=new Set();let stop=()=>{};
  return key=>{
    try{
      const {document}=environment,motion=environment.matchMedia?.('(prefers-reduced-motion: reduce)');
      if(!document||document.hidden||motion?.matches||seen.has(key))return false;
      seen.add(key);if(seen.size>100)seen.delete(seen.values().next().value);stop();
      const canvas=document.createElement('canvas');let fire,timer,closed=false;
      canvas.setAttribute('aria-hidden','true');canvas.dataset.admitCelebration='true';
      Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2147483647'});
      const hidden=()=>{if(document.hidden)stop();},reduce=event=>{if(event.matches)stop();};
      stop=()=>{
        if(closed)return;closed=true;
        environment.clearTimeout(timer);
        try{fire?.reset();}catch{}finally{canvas.remove();}
        document.removeEventListener('visibilitychange',hidden);motion?.removeEventListener?.('change',reduce);
      };
      (document.querySelector('dialog[open]')||document.body).append(canvas);
      document.addEventListener('visibilitychange',hidden);motion?.addEventListener?.('change',reduce);
      fire=create(canvas,{resize:true,disableForReducedMotion:true});
      const options={particleCount:28,spread:55,ticks:90,startVelocity:32,disableForReducedMotion:true};
      fire({...options,angle:60,origin:{x:0,y:.6}});
      fire({...options,angle:120,origin:{x:1,y:.6}});
      timer=environment.setTimeout(stop,1600);return true;
    }catch{try{stop();}catch{}return false;}
  };
}
export const celebrate=createCelebrator();
