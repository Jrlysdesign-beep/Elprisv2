import test from "node:test";
import assert from "node:assert/strict";
import {validateFeed,dueAlarms,uniqueCandidates} from "../src/price-engine.js";
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
 assert.equal(dueAlarms(a,h,now+60000).length,0);
 assert.equal(dueAlarms([{...a[0],threshold:0.49}],h,now).length,0);
});
