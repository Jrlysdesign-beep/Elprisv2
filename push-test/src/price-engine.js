// Isolated price alarm engine. No external side effects.
export const OFFSET_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
const dkClock = new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Copenhagen",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
export function validateFeed(data,area){
 if(!data||data.area!==area||!["DK1","DK2"].includes(area)||!Array.isArray(data.hours)||!data.hours.length||data.hours.length>240)throw Error("Invalid area or hours");
 const seen=new Set();
 return data.hours.map(p=>{
  if(typeof p.time!=="string"||!OFFSET_TIME.test(p.time)||!Number.isFinite(p.price)||p.price< -10||p.price>100)throw Error("Invalid time or price");
  const utc=Date.parse(p.time);if(!Number.isFinite(utc)||seen.has(utc))throw Error("Invalid or duplicate timestamp");seen.add(utc);
  const parts=Object.fromEntries(dkClock.formatToParts(new Date(utc)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  const local=`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  if(local!==p.time.slice(0,19))throw Error("Timestamp is not Danish local time with correct UTC offset");
  return {startMs:utc,startTime:new Date(utc).toISOString(),price:p.price};
 }).sort((a,b)=>a.startMs-b.startMs);
}
export function dueAlarms(alarms,hours,nowMs){
 if(!Number.isFinite(nowMs))throw Error("Invalid clock");
 const result=[];
 for(const alarm of alarms)for(const hour of hours){
  if(!alarm.enabled||!Number.isInteger(alarm.notice_hours)||alarm.notice_hours<0||alarm.notice_hours>24||!Number.isFinite(alarm.threshold))continue;
  const due=hour.startMs-alarm.notice_hours*3600000;
  if(hour.price<alarm.threshold && nowMs>=due && nowMs<due+60000 && hour.startMs>nowMs)
   result.push({alarmId:alarm.id,startTime:hour.startTime,price:hour.price});
 }
 return result;
}
export function uniqueCandidates(candidates,deliveredKeys){
 return candidates.filter(x=>!deliveredKeys.has(x.alarmId+"|"+x.startTime));
}
