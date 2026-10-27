import test from "node:test";
import assert from "node:assert/strict";
import {deliveryKey,simulateDelivery} from "../src/delivery-safety.js";
const a={alarmId:"alarm-A",startTime:"2026-10-25T01:15:00.000Z"};
test("one reservation blocks repeated attempts for same alarm and interval",()=>{
 const r=simulateDelivery([a,a,a]);
 assert.equal(r.reservedCount,1);assert.equal(r.sendAttempts,1);
 assert.deepEqual(r.events.map(x=>x.status),["send-attempted","duplicate-blocked","duplicate-blocked"]);
});
test("different alarms reserve independently",()=>{
 const r=simulateDelivery([a,{...a,alarmId:"alarm-B"}]);
 assert.equal(r.sendAttempts,2);
});
test("different cheap periods reserve independently",()=>{
 const r=simulateDelivery([a,{...a,startTime:"2026-10-25T02:15:00.000Z"}]);
 assert.equal(r.sendAttempts,2);
});
test("DST local repeated time has distinct UTC delivery keys",()=>{
 assert.notEqual(deliveryKey("alarm-A","2026-10-25T02:15:00+02:00"),deliveryKey("alarm-A","2026-10-25T02:15:00+01:00"));
});
test("network error leaves reservation and blocks retry: at-most-once tradeoff",()=>{
 const r=simulateDelivery([a,a],{sendResult:"uncertain"});
 assert.deepEqual(r.events.map(x=>x.status),["reserved-but-delivery-uncertain","duplicate-blocked"]);
 assert.equal(r.sendAttempts,1);
});
test("invalid reservation identity fails closed",()=>{
 assert.throws(()=>deliveryKey("","2026-10-25T01:15:00Z"));
 assert.throws(()=>deliveryKey("alarm-A","invalid"));
});
test("concurrent identical reservations: database must enforce unique key",()=>{
 const keys=[a,a,a].map(x=>deliveryKey(x.alarmId,x.startTime));
 assert.equal(new Set(keys).size,1);
 // Actual D1 concurrency safety depends on UNIQUE(alarm_id,start_time)
});
