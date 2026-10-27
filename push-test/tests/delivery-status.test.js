import test from "node:test";
import assert from "node:assert/strict";
import {classifyPushOutcome,DELIVERY_STATES} from "../src/delivery-status.js";
test("delivery status vocabulary is explicit",()=>{
 assert.deepEqual(DELIVERY_STATES,["reserved","accepted","failed","uncertain"]);
});
test("permanent 404 and 410 subscription failures do not retry",()=>{
 for(const statusCode of [400,401,403,404,410,413]){
  assert.deepEqual(classifyPushOutcome({statusCode}),{status:"failed",httpStatus:statusCode});
 }
});
test("timeout, rate limiting, server failure and unknown network errors remain uncertain",()=>{
 for(const statusCode of [408,429,500,502,503,504]){
  assert.deepEqual(classifyPushOutcome({statusCode}),{status:"uncertain",httpStatus:statusCode});
 }
 assert.deepEqual(classifyPushOutcome(new Error("network timeout")),{status:"uncertain",httpStatus:null});
});
test("malformed response status cannot be treated as a confirmed failure",()=>{
 assert.deepEqual(classifyPushOutcome({statusCode:"410"}),{status:"uncertain",httpStatus:null});
});
