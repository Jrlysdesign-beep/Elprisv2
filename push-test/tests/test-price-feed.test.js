import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSpotRecords,fetchTestFeed} from "../src/test-price-feed.js";
const record=(time,area="DK2",price=500)=>({HourUTC:time,PriceArea:area,SpotPriceDKK:price});
test("DK1 and DK2 independent and DKK/MWh converts to kr/kWh",()=>{
 const now=Date.parse("2026-07-10T08:00:00Z");
 const rows=[record("2026-07-10T09:00:00","DK1",250),record("2026-07-10T09:00:00","DK2",500)];
 const a=normalizeSpotRecords(rows,"DK1",now),b=normalizeSpotRecords(rows,"DK2",now);
 assert.equal(a.hours[0].price,0.25);assert.equal(b.hours[0].price,0.5);
 assert.equal(a.hours[0].time,"2026-07-10T11:00:00+02:00");
});
test("autumn repeated hour remains distinct",()=>{
 const now=Date.parse("2026-10-24T23:00:00Z");
 const a=normalizeSpotRecords([record("2026-10-25T00:00:00"),record("2026-10-25T01:00:00")],"DK2",now);
 assert.deepEqual(a.hours.map(x=>x.time),["2026-10-25T02:00:00+02:00","2026-10-25T02:00:00+01:00"]);
});
test("spring skip never invents 02:00",()=>{
 const now=Date.parse("2026-03-28T23:00:00Z");
 const a=normalizeSpotRecords([record("2026-03-29T00:00:00"),record("2026-03-29T01:00:00")],"DK2",now);
 assert.deepEqual(a.hours.map(x=>x.time),["2026-03-29T01:00:00+01:00","2026-03-29T03:00:00+02:00"]);
});
test("missing data and bad prices fail closed",()=>{
 assert.throws(()=>normalizeSpotRecords([],"DK1",Date.now()));
 assert.throws(()=>normalizeSpotRecords([record("2026-07-10T09:00:00","DK2",null)],"DK2",Date.parse("2026-07-10T08:00:00Z")));
});
test("fetches isolated upstream URL without writing or sending",async()=>{
 const now=Date.parse("2026-07-10T08:00:00Z");
 let request;
 const fetcher=async(url)=>{request=new URL(url);return {ok:true,json:async()=>({records:[record("2026-07-10T09:00:00","DK1",250)]})};};
 const a=await fetchTestFeed("DK1",now,fetcher);
 assert.equal(a.validatedHours,1);
 assert.equal(request.hostname,"api.energidataservice.dk");
 assert.match(request.searchParams.get("filter"),/DK1/);
});
