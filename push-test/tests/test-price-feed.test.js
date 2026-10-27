import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSpotRecords,fetchTestFeed,fetchTestFeeds} from "../src/test-price-feed.js";
const record=(time,area="DK2",price=500)=>({TimeUTC:time,PriceArea:area,DayAheadPriceDKK:price});
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
 const fetcher=async(url)=>{request=new URL(url);return {ok:true,json:async()=>({records:[record("2026-07-10T09:00:00","DK1",250),record("2026-07-10T09:00:00","DK2",500)]})};};
 const a=await fetchTestFeed("DK1",now,fetcher);
 assert.equal(a.validatedHours,1);
 assert.equal(request.hostname,"api.energidataservice.dk");
 assert.match(request.searchParams.get("filter"),/DK1/);
});

test("both regions fetched in exactly one request",async()=>{
 let calls=0;
 const now=Date.parse("2026-07-10T08:00:00Z");
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({records:[record("2026-07-10T09:00:00","DK1",250),record("2026-07-10T09:00:00","DK2",500)]})};};
 const feeds=await fetchTestFeeds(now,fetcher);
 assert.equal(calls,1);assert.equal(feeds.DK1.hours[0].price,0.25);assert.equal(feeds.DK2.hours[0].price,0.5);
});
test("provider 429 blocks both regions safely",async()=>{
 const fetcher=async()=>({ok:false,status:429});
 await assert.rejects(fetchTestFeeds(Date.parse("2026-07-10T08:00:00Z"),fetcher),/HTTP 429/);
});
test("missing DK2 in combined response is rejected",async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({records:[record("2026-07-10T09:00:00","DK1",250)]})});
 await assert.rejects(fetchTestFeeds(Date.parse("2026-07-10T08:00:00Z"),fetcher),/No future prices for DK2/);
});

test("historical-only feed is rejected",()=>{
 const now=Date.parse("2026-07-10T10:00:00Z");
 assert.throws(()=>normalizeSpotRecords([record("2026-07-10T09:00:00","DK1",250)],"DK1",now),/No future prices/);
});

test("15-minute intervals stay distinct and convert correctly",()=>{
 const now=Date.parse("2026-10-27T08:00:00Z");
 const rows=[record("2026-10-27T09:00:00","DK1",250),record("2026-10-27T09:15:00","DK1",300),record("2026-10-27T09:30:00","DK1",350),record("2026-10-27T09:45:00","DK1",400)];
 const feed=normalizeSpotRecords(rows,"DK1",now);
 assert.equal(feed.validatedHours,4);
 assert.deepEqual(feed.hours.map(x=>x.price),[0.25,0.3,0.35,0.4]);
 assert.deepEqual(feed.hours.map(x=>x.time.slice(11,16)),["10:00","10:15","10:30","10:45"]);
});
