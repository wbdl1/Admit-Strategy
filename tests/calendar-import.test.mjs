import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCalendar} from '../src/calendar-import.js';
const calendar=events=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Admit//Local fixture//EN\r\n'+events+'END:VCALENDAR\r\n';
const event=body=>'BEGIN:VEVENT\r\n'+body+'\r\nEND:VEVENT\r\n';
const window={from:'2026-09-01',to:'2026-10-01'};
test('ICS folding, all-day dates and UTC times preserve stable IDs',()=>{
  const text=calendar(event('UID:test-one\r\nDTSTART;VALUE=DATE:20260910\r\nSUMMARY:Biology assess\r\n ment\r\nDESCRIPTION:Bring a pencil\\, please')+event('UID:test-two\r\nDTSTART:20260911T100000Z\r\nDTEND:20260911T110000Z\r\nSUMMARY:Study group'));
  const result=parseCalendar(text,window);assert.equal(result.events.length,2);assert.equal(result.events[0].title,'Biology assessment');assert.equal(result.events[0].end_date,'2026-09-11');assert.equal(result.events[1].starts_at,'2026-09-11T10:00:00.000Z');
  assert.deepEqual(parseCalendar(text,window),result);
});
test('weekly recurrence, exclusion, moved exception and cancellation preserve occurrence identity',()=>{
  const text=calendar(event('UID:series\r\nDTSTART:20260901T100000Z\r\nDTEND:20260901T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE:20260908T100000Z\r\nSUMMARY:Math club')+event('UID:series\r\nRECURRENCE-ID:20260915T100000Z\r\nDTSTART:20260916T120000Z\r\nDTEND:20260916T130000Z\r\nSUMMARY:Moved club')+event('UID:series\r\nRECURRENCE-ID:20260922T100000Z\r\nDTSTART:20260922T100000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Cancelled club'));
  const rows=parseCalendar(text,window).events;assert.equal(rows.length,3);assert.equal(rows[1].starts_at,'2026-09-16T12:00:00.000Z');assert.equal(rows[1].occurrence_key,'2026-09-15T10:00:00.000Z');assert.equal(rows[2].status,'cancelled');
});
test('floating Qatar times and VTIMEZONE definitions convert without using the computer timezone',()=>{
  const zone='BEGIN:VTIMEZONE\r\nTZID:Custom/School\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0200\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n';
  const text=calendar(zone+event('UID:zone\r\nDTSTART;TZID=Custom/School:20260910T100000\r\nSUMMARY:Zone fixture')+event('UID:float\r\nDTSTART:20260910T100000\r\nSUMMARY:Floating fixture'));
  const rows=parseCalendar(text,window).events;assert.equal(rows.find(r=>r.source_uid==='zone').starts_at,'2026-09-10T08:00:00.000Z');assert.equal(rows.find(r=>r.source_uid==='float').starts_at,'2026-09-10T07:00:00.000Z');
});
test('invalid files, duplicate UIDs, missing timezones and explosive recurrence fail clearly',()=>{
  for(const text of ['not a calendar',calendar(event('SUMMARY:Missing ID')),calendar(event('UID:x\r\nDTSTART;TZID=Missing/Zone:20260910T100000')),calendar(event('UID:x\r\nDTSTART:20260910T100000Z\r\nRRULE:FREQ=SECONDLY')),calendar(event('UID:x\r\nDTSTART;VALUE=DATE:20260910')+event('UID:x\r\nDTSTART;VALUE=DATE:20260911'))])assert.throws(()=>parseCalendar(text,window));
  assert.throws(()=>parseCalendar('x'.repeat(1024*1024+1),window),/1 MB/);
  assert.throws(()=>parseCalendar(calendar(event('UID:x\r\nDTSTART:20260901T100000Z')), {from:'2026-09-01',to:'2030-09-01'}),/one year/);
  for(const start of ['20260231T100000Z','20260910T250000Z','20261310T100000Z'])assert.throws(()=>parseCalendar(calendar(event('UID:invalid-date\r\nDTSTART:'+start)),window),/invalid date/);
});
test('event text is preserved as text, with no attachment or attendee payload',()=>{
  const rows=parseCalendar(calendar(event('UID:x\r\nDTSTART;VALUE=DATE:20260910\r\nSUMMARY:<script>alert(1)</script>\r\nATTENDEE:mailto:private@example.invalid\r\nATTACH:https://example.invalid/untrusted')),window).events;
  assert.equal(rows[0].title,'<script>alert(1)</script>');assert.equal(JSON.stringify(rows).includes('private@example.invalid'),false);assert.equal(JSON.stringify(rows).includes('untrusted'),false);
});
