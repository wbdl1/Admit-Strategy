import ICAL from "ical.js";

export const ICS_LIMIT=1024*1024;
const invalid=message=>{throw new Error(message);};
const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const dateString=time=>time.toString().slice(0,10);
function utc(time){
  if(time.isDate)return dateString(time);
  // Floating school-calendar times use the explicitly displayed Qatar zone.
  const value=time.zone.tzid==="floating"?time.toUnixTime()-10800:time.toUnixTime();
  return new Date(value*1000).toISOString();
}
function checkDates(component){
  for(const name of ["dtstart","dtend","recurrence-id","rdate","exdate"]){
    for(const prop of component.getAllProperties(name)){
      const tz=prop.getParameter("tzid");
      if(tz&&!component.getTimeZoneByID(tz)&&!["UTC","Etc/UTC","Asia/Qatar"].includes(tz))invalid("This calendar omits its time-zone definition ("+tz+"). Export it with time zones included.");
      for(const raw of prop.toJSON().slice(3)){
        if(typeof raw!=="string"||!day(raw.slice(0,10))||(!/^\d{4}-\d{2}-\d{2}$/.test(raw)&&!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ?$/.test(raw)))invalid("This calendar contains an invalid date or time.");
      }
      for(const value of prop.getValues()){
        if(["UTC","Etc/UTC"].includes(tz)&&!component.getTimeZoneByID(tz))value.zone=ICAL.Timezone.utcTimezone;
        if(!(value instanceof ICAL.Time))invalid("Date periods in RDATE are not supported. Export individual events.");
        if(!day(dateString(value))||value.year<2000||value.year>2100||value.hour>23||value.minute>59||value.second>59)invalid("This calendar contains an invalid date or time.");
      }
    }
  }
}

// No links/attachments are fetched, and no attendees or organizer addresses are
// retained. Hard limits bound parsing/expansion; the UI runs this in a worker.
export function parseCalendar(text,{from,to}={}){
  if(typeof text!=="string"||new TextEncoder().encode(text).length>ICS_LIMIT||text.includes("\0"))invalid("Choose a valid .ics file no larger than 1 MB.");
  if(!day(from)||!day(to)||to<=from||(Date.parse(to)-Date.parse(from))/86400000>366)invalid("Choose an import window of up to one year.");
  let calendar;
  try{calendar=new ICAL.Component(ICAL.parse(text));}catch{invalid("This file is not a valid iCalendar (.ics) document.");}
  if(calendar.name!=="vcalendar"||calendar.getFirstPropertyValue("version")!=="2.0")invalid("Choose a version 2.0 iCalendar file.");
  const components=calendar.getAllSubcomponents("vevent");
  if(!components.length||components.length>1000)invalid("Choose a calendar with 1–1,000 event definitions.");
  const masters=new Map(),exceptions=new Map();let steps=0;const events=[],seen=new Set();
  for(const component of components){
    checkDates(component);
    if(!component.hasProperty("uid")||!component.hasProperty("dtstart"))invalid("Each calendar event needs a stable UID and start date, including cancellations.");
    if(component.getAllProperties("rrule").length>1||component.hasProperty("exrule"))invalid("Multiple recurrence rules are not supported. Export individual events.");
    const rule=component.getFirstPropertyValue("rrule");
    if(rule&&(!["DAILY","WEEKLY","MONTHLY","YEARLY"].includes(rule.freq)||rule.interval<1))invalid("Import daily, weekly, monthly or yearly events; more frequent recurrences are not supported.");
    // Avoid pathological BY* combinations before constructing the iterator.
    if(rule&&Object.values(rule.parts).reduce((n,v)=>n*Math.max(1,v.length),1)>366)invalid("This recurrence rule is too complex. Export individual events.");
    const event=new ICAL.Event(component,{strictExceptions:true,exceptions:[]});
    if(event.isRecurrenceException()){
      if(event.modifiesFuture())invalid("This calendar uses a future-series change. Export the updated series as individual events.");
      const items=exceptions.get(event.uid)||[];
      if(items.some(item=>item.recurrenceId.toString()===event.recurrenceId.toString()))invalid("Conflicting recurrence exceptions in this calendar.");
      items.push(event);exceptions.set(event.uid,items);
    }else{
      if(masters.has(event.uid))invalid("Duplicate event UIDs in this calendar. Export the latest version once.");
      masters.set(event.uid,event);
    }
  }
  function add(event,start,end,key){
    const startDay=start.isDate?dateString(start):utc(start).slice(0,10);
    if(startDay<from||startDay>=to)return;
    if(start.isDate!==end.isDate)invalid("Event start and end must use the same date format.");
    const sequence=Number(event.component.getFirstPropertyValue("sequence")||0),modified=event.component.getFirstPropertyValue("last-modified")||event.component.getFirstPropertyValue("dtstamp");
    const item={source_uid:String(event.uid),occurrence_key:key,title:event.summary||"Untitled event",description:event.description||"",timezone:"Asia/Qatar",status:String(event.component.getFirstPropertyValue("status")||"").toUpperCase()==="CANCELLED"?"cancelled":"active",source_sequence:sequence,source_modified_at:modified?utc(modified):null,
      starts_at:start.isDate?null:utc(start),ends_at:start.isDate?null:utc(end),start_date:start.isDate?dateString(start):null,end_date:end.isDate?dateString(end):null};
    if(item.title.length>300||item.description.length>2000||!item.source_uid.trim()||item.source_uid.length>500||!Number.isSafeInteger(sequence)||sequence<0||sequence>2147483647)invalid("A calendar event exceeds the title, description or identifier limits. Shorten it before importing.");
    if((start.isDate?item.end_date<=item.start_date:item.ends_at<item.starts_at)||new Date(item.end_date||item.ends_at)-new Date(item.start_date||item.starts_at)>366*86400000)invalid("An event has an invalid end date.");
    const identity=JSON.stringify([item.source_uid,key]);if(seen.has(identity))return;seen.add(identity);events.push(item);
    if(events.length>500)invalid("More than 500 events fall in this window. Choose a shorter date range.");
  }
  for(const [uid,event] of masters){
    const overrides=exceptions.get(uid)||[];for(const item of overrides)event.relateException(item);
    if(event.isRecurring()){
      const iterator=event.iterator();let next;
      while((next=iterator.next())){
        if(++steps>10000)invalid("This series is too long. Export a recent date range or individual events.");
        if(dateString(next)>to)break;
        const occurrence=event.getOccurrenceDetails(next);
        add(occurrence.item,occurrence.startDate,occurrence.endDate,utc(next));
      }
      // An exception may move into the window from an original date outside it.
      for(const item of overrides)add(item,item.startDate,item.endDate,utc(item.recurrenceId));
    }else{if(overrides.length)invalid("Recurrence exceptions have no repeating series.");add(event,event.startDate,event.endDate,"");}
  }
  for(const uid of exceptions.keys())if(!masters.has(uid))invalid("An event exception is missing its original series. Export the complete calendar.");
  events.sort((a,b)=>String(a.start_date||a.starts_at).localeCompare(b.start_date||b.starts_at)||a.source_uid.localeCompare(b.source_uid));
  return {events,from,to,notice:"Times without a zone use Qatar time. Re-import into the same calendar. Events absent from this file are kept; explicit cancellations are applied. Review academic deadlines separately."};
}
