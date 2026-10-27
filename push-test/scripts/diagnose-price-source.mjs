// Diagnostic only: read-only requests, no tokens, DB, push or deployment.
const now=new Date();
const date=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Copenhagen",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
const previous=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Copenhagen",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now.getTime()-86400000));
const datasets=[
 {name:"Elspotprices",time:"HourUTC",price:"SpotPriceDKK"},
 {name:"DayAheadPrices",time:"TimeUTC",price:"DayAheadPriceDKK"}
];
const report={mode:"diagnostic-read-only",sent:0,dbWrites:0,liveAppChanges:0,checkedAt:now.toISOString(),datasets:{}};
for(const dataset of datasets){
 const url=new URL("https://api.energidataservice.dk/dataset/"+dataset.name);
 url.searchParams.set("start",previous);
 url.searchParams.set("filter",JSON.stringify({PriceArea:["DK1","DK2"]}));
 url.searchParams.set("sort",dataset.time+" desc");
 url.searchParams.set("limit","400");
 const entry={endpoint:dataset.name,start:previous,httpStatus:null,returned:0,areas:{},sampleFields:[],timeRange:null,futureIntervals:{DK1:0,DK2:0}};
 report.datasets[dataset.name]=entry;
 try{
  const response=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(12000)});
  entry.httpStatus=response.status;
  if(!response.ok){entry.error="Provider HTTP "+response.status;continue;}
  const body=await response.json();
  if(!Array.isArray(body.records)){entry.error="No records array";continue;}
  entry.returned=body.records.length;
  const timestamps=[];
  for(const row of body.records){
   const area=row.PriceArea||"unknown";entry.areas[area]=(entry.areas[area]||0)+1;
   const raw=row[dataset.time];if(typeof raw==="string"){
    const t=Date.parse(/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:raw+"Z");
    if(Number.isFinite(t)){timestamps.push(t);if(t>now.getTime()&&area in entry.futureIntervals)entry.futureIntervals[area]++;}
   }
  }
  entry.sampleFields=body.records.length?Object.keys(body.records[0]).sort():[];
  if(timestamps.length)entry.timeRange={firstUtc:new Date(Math.min(...timestamps)).toISOString(),lastUtc:new Date(Math.max(...timestamps)).toISOString()};
  entry.dataset=body.dataset||null;
 }catch(e){entry.error=e.name==="TimeoutError"?"Provider timeout":String(e.message).slice(0,120);}
}
console.log(JSON.stringify(report,null,2));
// Diagnostics do not assert availability; they expose facts for a safe decision.
