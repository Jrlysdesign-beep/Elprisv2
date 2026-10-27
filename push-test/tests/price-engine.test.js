import test from "node:test";
import assert from "node:assert/strict";
import {validateFeed,dueAlarms,uniqueCandidates,cheapPeriods} from "../src/price-engine.js";
const feed=(hours)=>({area:"DK2",hours});
test("rejects production feed without explicit offset",()=>{
 assert.throws(()=>validateFeed(feed([{time:"2026-10-27T09:00:00",price:0.2}]),"DK2"));
});
test("accepts Danish winter and summer offsets",()=>{
 assert.equal(validateFeed(feed([{time:"2026-01-10T09:00:00+01:00",price:0.2}]),"DK2").length,1);
 assert.equal(validateFeed(feed([{time:"2026-07-10T09:00:00+02:00",price:0.2}]),"DK2").length,1);
 assert.throws(()=>validateFeed(feed([{time:"2026-07-10T09:00:00+01:00",price:0.2}]),"DK2"));
});
test("fall DST repeated hour has distinct UTC timestamps",()=>{
 const h=validateFeed(feed([{time:"2026-10-25T02:00:00+02:00",price:0.2},{time:"2026-10-25T02:00:00+01:00",price:0.3}]),"DK2");
 assert.equal(h.length,2);assert.notEqual(h[0].startTime,h[1].startTime);
});
test("rejects spring DST nonexistent local hour",()=>{
 assert.throws(()=>validateFeed(feed([{time:"2026-03-29T02:00:00+01:00",price:0.2}]),"DK2"));
});
test("fires at lead time only, strictly below threshold, without duplicates",()=>{
 const h=validateFeed(feed([{time:"2026-10-27T15:00:00+01:00",price:0.49}]),"DK2");
 const a=[{id:"alarm1",enabled:1,threshold:0.5,notice_hours:3}];
 const now=Date.parse("2026-10-27T11:00:30Z");
 const due=dueAlarms(a,h,now);assert.equal(due.length,1);
 assert.equal(uniqueCandidates(due,new Set(["alarm1|"+due[0].startTime])).length,0);
 assert.equal(dueAlarms(a,h,now+900000).length,0);
 assert.equal(dueAlarms([{...a[0],threshold:0.49}],h,now).length,0);
});

const alarm=(overrides={})=>({id:"quarter-alarm",enabled:1,threshold:0.5,notice_hours:3,...overrides});
const quarter=(time,price)=>({time,price});
test("four consecutive cheap quarters yield one alarm period",()=>{
 const hours=validateFeed(feed([
  quarter("2026-10-27T15:00:00+01:00",0.40),
  quarter("2026-10-27T15:15:00+01:00",0.41),
  quarter("2026-10-27T15:30:00+01:00",0.42),
  quarter("2026-10-27T15:45:00+01:00",0.43)
 ]),"DK2");
 const periods=cheapPeriods(hours,0.5);
 assert.equal(periods.length,1);assert.equal(periods[0].slots,4);
 const first=dueAlarms([alarm()],hours,Date.parse("2026-10-27T11:00:30Z"));
 assert.equal(first.length,1);assert.equal(first[0].slots,4);
 const delivered=new Set([first[0].alarmId+"|"+first[0].startTime]);
 assert.equal(uniqueCandidates(first,delivered).length,0);
 for(let i=1;i<4;i++)
  assert.equal(dueAlarms([alarm()],hours,Date.parse("2026-10-27T11:00:30Z")+i*900000).length,0);
});
test("threshold boundary separates two cheap periods",()=>{
 const hours=validateFeed(feed([
  quarter("2026-10-27T15:00:00+01:00",0.4),
  quarter("2026-10-27T15:15:00+01:00",0.5),
  quarter("2026-10-27T15:30:00+01:00",0.3)
 ]),"DK2");
 const periods=cheapPeriods(hours,0.5);
 assert.equal(periods.length,2);
 assert.equal(periods[0].slots,1);assert.equal(periods[1].slots,1);
});
test("missing quarter separates periods rather than inventing prices",()=>{
 const hours=validateFeed(feed([
  quarter("2026-10-27T15:00:00+01:00",0.4),
  quarter("2026-10-27T15:30:00+01:00",0.3)
 ]),"DK2");
 assert.equal(cheapPeriods(hours,0.5).length,2);
});
test("fall DST continuous UTC quarters remain one period",()=>{
 const hours=validateFeed(feed([
  quarter("2026-10-25T02:45:00+02:00",0.4),
  quarter("2026-10-25T02:00:00+01:00",0.4)
 ]),"DK2");
 assert.equal(cheapPeriods(hours,0.5).length,1);
});
test("exact due window boundaries and late execution fail closed",()=>{
 const hours=validateFeed(feed([quarter("2026-10-27T15:15:00+01:00",0.4)]),"DK2");
 const due=Date.parse("2026-10-27T11:15:00Z");
 assert.equal(dueAlarms([alarm()],hours,due-1).length,0);
 assert.equal(dueAlarms([alarm()],hours,due).length,1);
 assert.equal(dueAlarms([alarm()],hours,due+59999).length,1);
 assert.equal(dueAlarms([alarm()],hours,due+60000).length,1);
 assert.equal(dueAlarms([alarm()],hours,due+900000).length,0);
});
test("disabled alarms, invalid lead time, and threshold equality do not trigger",()=>{
 const hours=validateFeed(feed([quarter("2026-10-27T15:00:00+01:00",0.5)]),"DK2");
 const now=Date.parse("2026-10-27T11:00:00Z");
 assert.equal(dueAlarms([alarm({threshold:0.5})],hours,now).length,0);
 assert.equal(dueAlarms([alarm({enabled:0,threshold:0.6})],hours,now).length,0);
 assert.equal(dueAlarms([alarm({notice_hours:25,threshold:0.6})],hours,now).length,0);
 assert.equal(dueAlarms([alarm({notice_hours:1.5,threshold:0.6})],hours,now).length,0);
});
test("DK1 and DK2 data cannot be confused",()=>{
 assert.throws(()=>validateFeed({area:"DK1",hours:[quarter("2026-10-27T15:00:00+01:00",0.4)]},"DK2"),/Invalid area/);
});
test("duplicate quarter timestamps are rejected, even when presented in different offsets",()=>{
 assert.throws(()=>validateFeed(feed([quarter("2026-10-27T15:00:00+01:00",0.4),quarter("2026-10-27T14:00:00Z",0.4)]),"DK2"),/duplicate timestamp/);
});
test("fall DST quarters in repeated 02:00 hour remain independent",()=>{
 const hours=validateFeed(feed([quarter("2026-10-25T02:15:00+02:00",0.4),quarter("2026-10-25T02:15:00+01:00",0.4)]),"DK2");
 assert.equal(hours.length,2);assert.equal(hours[1].startMs-hours[0].startMs,3600000);
});
test("one alarm and one interval share a stable deduplication key across reruns",()=>{
 const hours=validateFeed(feed([quarter("2026-10-27T15:00:00+01:00",0.4)]),"DK2");
 const now=Date.parse("2026-10-27T11:00:30Z");
 const first=dueAlarms([alarm()],hours,now);
 const keys=new Set(first.map(x=>x.alarmId+"|"+x.startTime));
 assert.equal(uniqueCandidates(dueAlarms([alarm()],hours,now),keys).length,0);
 assert.equal(uniqueCandidates(dueAlarms([alarm({id:"other-alarm"})],hours,now),keys).length,1);
});

test("288 quarter-hour records over three days are accepted",()=>{
 const start=Date.parse("2026-10-26T00:00:00Z");
 const clock=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Copenhagen",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const offset=(ms)=>{const p=Object.fromEntries(clock.formatToParts(new Date(ms)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));const local=`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;const naive=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);const m=Math.round((naive-ms)/60000),sign=m>=0?"+":"-",abs=Math.abs(m);return local+sign+String(Math.floor(abs/60)).padStart(2,"0")+":"+String(abs%60).padStart(2,"0");};
 const hours=Array.from({length:288},(_,i)=>({time:offset(start+i*900000),price:0.4}));
 assert.equal(validateFeed({area:"DK2",hours},"DK2").length,288);
 assert.equal(cheapPeriods(validateFeed({area:"DK2",hours},"DK2"),0.5).length,1);
});
test("oversized price feed is rejected",()=>{
 const time="2026-10-27T15:00:00+01:00";
 assert.throws(()=>validateFeed({area:"DK2",hours:Array.from({length:1001},()=>({time,price:0.4}))},"DK2"),/Invalid area or hours/);
});

test("late scheduler fires once within 15 minutes but never after start",()=>{
 const hours=validateFeed(feed([quarter("2026-10-27T15:00:00+01:00",0.4)]),"DK2");
 const due=Date.parse("2026-10-27T11:00:00Z");
 assert.equal(dueAlarms([alarm()],hours,due+14*60000+59000).length,1);
 assert.equal(dueAlarms([alarm()],hours,due+15*60000).length,0);
 assert.equal(dueAlarms([alarm({notice_hours:0})],hours,Date.parse("2026-10-27T14:00:00Z")).length,1);\n assert.equal(dueAlarms([alarm({notice_hours:0})],hours,Date.parse("2026-10-27T14:15:00Z")).length,0);
});
test("same complete price period keeps identical delivery key across feed refresh",()=>{
 const original=validateFeed(feed([
 quarter("2026-10-27T15:00:00+01:00",0.4),quarter("2026-10-27T15:15:00+01:00",0.45)
 ]),"DK2");
 const refreshed=validateFeed(feed([
 quarter("2026-10-27T15:00:00+01:00",0.41),quarter("2026-10-27T15:15:00+01:00",0.42),quarter("2026-10-27T15:30:00+01:00",0.43)
 ]),"DK2");
 const now=Date.parse("2026-10-27T11:00:30Z");
 const first=dueAlarms([alarm()],original,now);
 const second=dueAlarms([alarm()],refreshed,now);
 assert.equal(first[0].startTime,second[0].startTime);
 assert.equal(uniqueCandidates(second,new Set([first[0].alarmId+"|"+first[0].startTime])).length,0);
});

test("zero-hour alert is due at the cheap period start, not beforehand",()=>{
 const hours=validateFeed(feed([quarter("2026-10-27T15:00:00+01:00",0.4)]),"DK2");
 const start=Date.parse("2026-10-27T14:00:00Z");
 assert.equal(dueAlarms([alarm({notice_hours:0})],hours,start-1).length,0);
 assert.equal(dueAlarms([alarm({notice_hours:0})],hours,start).length,1);
 assert.equal(dueAlarms([alarm({notice_hours:0})],hours,start+5*60000).length,1);
 assert.equal(dueAlarms([alarm({notice_hours:0})],hours,start+15*60000).length,0);
});
