import {parseCalendar} from "./calendar-import.js";
self.onmessage=event=>{
  try{self.postMessage({ok:true,...parseCalendar(event.data.text,event.data.window)});}
  catch(error){self.postMessage({ok:false,error:error.message||"Calendar parsing failed."});}
};
