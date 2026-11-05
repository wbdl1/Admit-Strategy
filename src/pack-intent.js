const key='admit-pending-pack';
export function capturePendingPack(){
 const fragment=new URLSearchParams(location.hash.slice(1)),code=fragment.get('pack');
 if(!/^[a-f0-9]{64}$/.test(code||''))return;
 try{sessionStorage.setItem(key,JSON.stringify({code,at:Date.now()}));}catch{}
 const url=new URL(location.href);url.hash='';history.replaceState(history.state,'',url);
}
export function takePendingPack(){
 try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved&&Date.now()-saved.at<86400000&&/^[a-f0-9]{64}$/.test(saved.code))return saved.code;sessionStorage.removeItem(key);}catch{}return null;
}
