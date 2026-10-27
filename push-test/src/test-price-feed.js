// Independent test-only feed. Prices are spot prices excluding taxes, tariffs and VAT.
// Source: Energi Data Service, Elspotprices, SpotPriceDKK (DKK/MWh).
import {validateFeed} from "./price-engine.js";
const clock=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Copenhagen",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
function localWithOffset(utcMs){
 const p=Object.fromEntries(clock.formatToParts(new Date(utcMs)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 const local=`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
 const naive=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
 const offset=Math.round((naive-utcMs)/60000);
 const sign=offset>=0?"+":"-";const abs=Math.abs(offset);
 return local+sign+String(Math.floor(abs/60)).padStart(2,"0")+":"+String(abs%60).padStart(2,"0");
}
function parseUtc(value){
 if(typeof value!=="string")throw Error("Missing UTC timestamp");
 const normalized=/Z$|[+-]\d\d:\d\d$/.test(value)?value:value+"Z";
 const ms=Date.parse(normalized);
 if(!Number.isFinite(ms)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(normalized))throw Error("Invalid UTC timestamp");
 return ms;
}
export function normalizeSpotRecords(records,area,nowMs=Date.now()){
 if(!["DK1","DK2"].includes(area)||!Array.isArray(records))throw Error("Invalid source data");
 const hours=[];
 for(const row of records){
  if(row.PriceArea!==area)continue;
  const utc=parseUtc(row.HourUTC);
  if(utc<nowMs-3600000||utc>nowMs+48*3600000)continue;
  const dkk=row.SpotPriceDKK;
  if(row.SpotPriceDKK===null||row.SpotPriceDKK===undefined||!Number.isFinite(dkk))throw Error("Invalid spot price");
  hours.push({time:localWithOffset(utc),price:dkk/1000});
 }
 const validated=validateFeed({area,hours},area);
 return {area,currency:"DKK",unit:"kr/kWh",priceType:"spot_ex_vat_tax_tariffs",source:"Energi Data Service / Elspotprices",hours:hours.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)),validatedHours:validated.length};
}
export async function fetchTestFeed(area,nowMs=Date.now(),fetcher=fetch){
 if(!["DK1","DK2"].includes(area))throw Error("Invalid price area");
 const start=new Date(nowMs-3600000).toISOString().slice(0,16);
 const end=new Date(nowMs+49*3600000).toISOString().slice(0,16);
 const url=new URL("https://api.energidataservice.dk/dataset/Elspotprices");
 // Provider start/end are interpreted as Danish local time, not UTC.
 const local=(ms)=>localWithOffset(ms).slice(0,16);
 url.searchParams.set("start",local(nowMs-3600000));url.searchParams.set("end",local(nowMs+49*3600000));
 url.searchParams.set("filter",JSON.stringify({PriceArea:[area]}));
 url.searchParams.set("sort","HourUTC ASC");url.searchParams.set("limit","200");
 const response=await fetcher(url.toString(),{headers:{accept:"application/json"},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error("Price provider HTTP "+response.status);
 const data=await response.json();
 return normalizeSpotRecords(data.records,area,nowMs);
}
