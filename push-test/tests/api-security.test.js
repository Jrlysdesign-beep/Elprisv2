import test from "node:test";
import assert from "node:assert/strict";
import {validateSubscription,parseRegistration,MAX_REGISTER_BYTES,RATE_LIMITS,bucketId} from "../src/api-security.js";
const b64=n=>Buffer.alloc(n,7).toString("base64url");
const sub=(endpoint="https://web.push.apple.com/QwErTy")=>({endpoint,keys:{p256dh:b64(65),auth:b64(16)}});
test("known HTTPS push services accepted",()=>{
 for(const host of ["web.push.apple.com","updates.push.services.mozilla.com","fcm.googleapis.com","fcm-xm.googleapis.com"])
  assert.equal(validateSubscription(sub("https://"+host+"/abc")),true,host);
});
test("unknown endpoints, SSRF, credentials and non-HTTPS rejected",()=>{
 for(const url of ["http://web.push.apple.com/abc","https://localhost/","https://127.0.0.1/","https://evil.example/","https://web.push.apple.com.evil.example/","https://user:pass@web.push.apple.com/abc","https://web.push.apple.com:444/abc","https://web.push.apple.com/abc#x"])
  assert.equal(validateSubscription(sub(url)),false,url);
});
test("malformed and truncated Web Push keys rejected",()=>{
 for(const keys of [{p256dh:"bad",auth:b64(16)},{p256dh:b64(65),auth:"bad"},{p256dh:b64(64),auth:b64(16)},{p256dh:b64(65),auth:b64(15)}])
  assert.equal(validateSubscription({...sub(),keys}),false);
});
test("valid registration and malformed JSON",()=>{
 assert.deepEqual(parseRegistration(JSON.stringify({subscription:sub()})),sub());
 assert.throws(()=>parseRegistration("{"),/Invalid JSON/);
});
test("4KB registration limit rejects large bodies including multibyte",()=>{
 assert.throws(()=>parseRegistration("a".repeat(MAX_REGISTER_BYTES+1)),/Payload too large/);
 assert.throws(()=>parseRegistration("é".repeat(MAX_REGISTER_BYTES)),/Payload too large/);
});
test("independent hourly rate buckets and quotas",()=>{
 assert.equal(RATE_LIMITS.register,5);assert.equal(RATE_LIMITS.testPush,2);
 const a=bucketId("register","client",Date.parse("2026-10-27T10:10:00Z"));
 assert.equal(a,bucketId("register","client",Date.parse("2026-10-27T10:59:59Z")));
 assert.notEqual(a,bucketId("register","client",Date.parse("2026-10-27T11:00:00Z")));
 assert.notEqual(a,bucketId("testPush","client",Date.parse("2026-10-27T10:10:00Z")));
 assert.throws(()=>bucketId("other","client",0));
});
