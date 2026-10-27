import {validateFeed,dueAlarms,uniqueCandidates} from "../src/price-engine.js";

const PRICE_URL="https://jrlysdesign-beep.github.io/Elprisv2/prices.json";
const now=Date.now();
const alarms=[{id:"dry-run-DK2",enabled:1,threshold:0.5,notice_hours:3}];
const summary={mode:"dry-run",sent:0,dbWrites:0,liveAppChanges:0,feedUrl:PRICE_URL,checkedAt:new Date(now).toISOString(),tests:{}};
function check(name,fn){try{summary.tests[name]=fn();}catch(e){summary.tests[name]={status:"rejected",reason:e.message};}}
check("winterOffset",()=>({status:"accepted",hours:validateFeed({area:"DK2",hours:[{time:"2026-01-10T09:00:00+01:00",price:0.4}]},"DK2").length}));
check("summerOffset",()=>({status:"accepted",hours:validateFeed({area:"DK2",hours:[{time:"2026-07-10T09:00:00+02:00",price:0.4}]},"DK2").length}));
check("autumnRepeatedHour",()=>{
 const hours=validateFeed({area:"DK2",hours:[{time:"2026-10-25T02:00:00+02:00",price:0.4},{time:"2026-10-25T02:00:00+01:00",price:0.4}]},"DK2");
 if(hours[0].startTime===hours[1].startTime)throw Error("Repeated hour collapsed");
 return {status:"accepted",distinctInstants:hours.length};
});
check("springMissingHour",()=>{
 try{validateFeed({area:"DK2",hours:[{time:"2026-03-29T02:00:00+01:00",price:0.4}]},"DK2");throw Error("Invalid hour accepted");}
 catch(e){if(e.message==="Invalid hour accepted")throw e;return {status:"correctly rejected"};}
});
check("alarmAndDuplicate",()=>{
 const hours=validateFeed({area:"DK2",hours:[{time:"2026-10-27T15:00:00+01:00",price:0.49}]},"DK2");
 const due=dueAlarms(alarms,hours,Date.parse("2026-10-27T11:00:30Z"));
 if(due.length!==1||uniqueCandidates(due,new Set(["dry-run-DK2|"+due[0].startTime])).length!==0)throw Error("Alarm/dedup failure");
 return {status:"passed",candidates:due.length,afterDuplicateFilter:0};
});
try{
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
 let response;
 try{response=await fetch(PRICE_URL,{headers:{accept:"application/json"},signal:controller.signal});}
 finally{clearTimeout(timeout);}
 summary.feedHttpStatus=response.status;
 if(!response.ok)throw Error("HTTP "+response.status);
 const data=await response.json();
 summary.feedShape={topLevelKeys:Object.keys(data).slice(0,12),area:data?.area??null,hoursCount:Array.isArray(data?.hours)?data.hours.length:null};
 for(const area of ["DK1","DK2"]){
  try{
   const hours=validateFeed(data,area);
   summary.tests["liveFeed"+area]={status:"valid",hours:hours.length,candidates:dueAlarms(alarms.map(a=>({...a,id:"dry-run-"+area})),hours,now).length};
  }catch(e){summary.tests["liveFeed"+area]={status:"blocked",reason:e.message};}
 }
}catch(e){summary.feedError=e.message;}
console.log(JSON.stringify(summary,null,2));
if(Object.values(summary.tests).some(x=>x.status==="rejected")||summary.tests.alarmAndDuplicate?.status!=="passed")process.exitCode=1;
