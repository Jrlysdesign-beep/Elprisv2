import {parseRegistration,MAX_REGISTER_BYTES,RATE_LIMITS,bucketId} from "./api-security.js";
import {fetchTestFeed} from "./test-price-feed.js";
import {classifyPushOutcome} from "./delivery-status.js";
import {validateFeed,dueAlarms,HOURLY_WINDOW_MS} from "./price-engine.js";
import testClient from "./test-client.js";
import webpush from "web-push";
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json",...headers}});
const cors=(req,env)=>({"access-control-allow-origin":env.ALLOWED_ORIGIN,"access-control-allow-methods":"GET,POST,DELETE,OPTIONS","access-control-allow-headers":"content-type,authorization","vary":"Origin"});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const token=req=>req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
async function limitRequest(env,action,subject){
 const now=Date.now(),bucket=await hash(bucketId(action,subject,now));
 // Single atomic UPSERT: parallel requests cannot bypass the hourly quota.
 const result=await env.DB.prepare("INSERT INTO api_rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits").bind(bucket,Math.floor(now/3600000+1)*3600000).first();
 return result&&result.hits<=RATE_LIMITS[action];
}
async function api(req,env){
 const url=new URL(req.url),h=cors(req,env);
 if(req.method==="GET"&&url.pathname==="/push-test")return new Response(`<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#102030"><link rel="manifest" href="/push-manifest.webmanifest"><title>Elpris Push Test</title><style>body{font:17px system-ui;background:#102030;color:white;max-width:540px;margin:30px auto;padding:20px}button{display:block;width:100%;padding:16px;margin:15px 0;border:0;border-radius:12px;font-size:17px}dialog{border:0;border-radius:16px;padding:20px;width:min(90vw,500px);background:#f8fafc;color:#102030}dialog label{display:block;margin:12px 0}dialog input,dialog select{display:block;width:100%;font-size:17px;padding:10px;box-sizing:border-box}.alarm{border-top:1px solid #bbb;padding:8px}.delete{width:auto;padding:8px;font-size:14px}#status{white-space:pre-wrap}</style></head><body><h1>Elpris – Push test</h1><p>Separat test. Tilføj siden til hjemmeskærmen i Safari, åbn den derfra, og tillad notifikationer.</p><button id="enable">Aktivér notifikationer</button><button id="test">Send testbesked</button><button id="show-alarms">Prisalarmer ⚙</button><dialog id="alarm-dialog"><h2>Prisalarmer</h2><label>Prisområde <select id="area"><option value="DK2">DK2 – Østdanmark</option><option value="DK1">DK1 – Vestdanmark</option></select></label><label>Giv besked når prisen er under (kr/kWh) <input id="threshold" type="number" min="0" max="50" step="0.01" value="0.50"></label><label>Varsling <select id="notice">${Array.from({length:25},(_,i)=>`<option value="${i}" ${i===3?"selected":""}>${i} timer før</option>`).join("")}</select></label><button id="save-alarm">Gem alarm</button><h3>Gemte alarmer</h3><div id="alarms"></div><button id="close-alarms">Luk</button><p>Testtilstand: Automatisk afsendelse er ikke aktiveret.</p></dialog><p id="status">Klar til test</p><script type="module" src="/push-test-client.js"></script></body></html>`,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
 if(req.method==="GET"&&url.pathname==="/push-manifest.webmanifest")return json({name:"Elpris Push Test",short_name:"Push test",start_url:"/push-test",scope:"/",display:"standalone",background_color:"#102030",theme_color:"#102030"});
 if(req.method==="GET"&&url.pathname==="/push-sw.js")return new Response(`self.addEventListener("push",event=>{let data={};try{data=event.data?.json()||{}}catch{}event.waitUntil(self.registration.showNotification(data.title||"Elpris test",{body:data.body||"Testbesked",data:{url:"/push-test"}}))});self.addEventListener("notificationclick",event=>{event.notification.close();event.waitUntil(clients.openWindow("/push-test"))});`,{headers:{"content-type":"text/javascript","cache-control":"no-store","service-worker-allowed":"/"}});
 if(req.method==="GET"&&url.pathname==="/push-test-client.js")return new Response(testClient,{headers:{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store"}});
 if(req.method==="GET"&&url.pathname==="/health")return json({ok:true,service:"elpris-push-isolated-test",pushConfigured:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT)},200,{"cache-control":"no-store"});
 const origin=req.headers.get("origin");
 const sameOrigin=origin===url.origin;
 const allowedExternal=origin===env.ALLOWED_ORIGIN;
 // Same-origin GET requests often have no Origin header. Reject cross-origin callers.
 if(req.method==="GET" ? (origin!==null&&!sameOrigin&&!allowedExternal) : (!sameOrigin&&!allowedExternal))
  return json({error:"Origin not allowed"},403,h);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 if(req.method==="GET"&&url.pathname==="/api/test-price-feed"){
  const area=url.searchParams.get("area");
  if(!["DK1","DK2"].includes(area))return json({error:"Choose DK1 or DK2"},400,h);
  try{
   const feed=await fetchTestFeed(area);
   return json(feed,200,{...h,"cache-control":"no-store"});
  }catch(e){console.error("Test feed unavailable",e.message);return json({error:"Test price feed unavailable"},503,h);}
 }
 if(req.method==="GET"&&url.pathname==="/api/vapid")return env.VAPID_PUBLIC_KEY?json({publicKey:env.VAPID_PUBLIC_KEY},200,h):json({error:"Push not configured"},503,h);
 if(req.method==="POST"&&url.pathname==="/api/register"){
  if(!env.VAPID_PRIVATE_KEY||!env.VAPID_PUBLIC_KEY)return json({error:"Push not configured"},503,h);
  const ip=req.headers.get("cf-connecting-ip");
  if(!ip)return json({error:"Client identity unavailable"},503,h);
  const length=Number(req.headers.get("content-length"));
  if(Number.isFinite(length)&&length>MAX_REGISTER_BYTES)return json({error:"Payload too large"},413,h);
  let raw;
  try{raw=await req.text()}catch{return json({error:"Invalid body"},400,h)}
  if(new TextEncoder().encode(raw).length>MAX_REGISTER_BYTES)return json({error:"Payload too large"},413,h);
  let subscription;
  try{subscription=parseRegistration(raw)}catch(e){return json({error:e.message},e.message==="Payload too large"?413:400,h)}
  if(!await limitRequest(env,"register",ip))return json({error:"Registration rate limit exceeded"},429,{...h,"retry-after":"3600"});
  const t=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-",""),id=crypto.randomUUID();
  try{
   await env.DB.prepare("INSERT INTO subscriptions(id,endpoint,subscription_json,token_hash,created_at) VALUES(?,?,?,?,?)").bind(id,subscription.endpoint,JSON.stringify(subscription),await hash(t),Date.now()).run();
  }catch(e){
   if(/UNIQUE constraint failed/i.test(String(e.message)))return json({error:"Subscription already registered"},409,h);
   throw e;
  }
  return json({token:t},201,h);
 }
 const t=token(req);if(!t)return json({error:"Authorization required"},401,h);
 const sub=await env.DB.prepare("SELECT id FROM subscriptions WHERE token_hash=?").bind(await hash(t)).first();
 if(!sub)return json({error:"Unknown subscription"},401,h);
 if(req.method==="POST"&&url.pathname==="/api/test-push"){
  if(!await limitRequest(env,"testPush",sub.id))return json({error:"Test push rate limit exceeded"},429,{...h,"retry-after":"3600"});
  if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)return json({error:"Push not configured"},503,h);
  const record=await env.DB.prepare("SELECT subscription_json FROM subscriptions WHERE id=?").bind(sub.id).first();
  if(!record)return json({error:"Subscription missing"},404,h);
  webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  try{await webpush.sendNotification(JSON.parse(record.subscription_json),JSON.stringify({title:"Elpris test",body:"Din iPhone kan modtage pushbeskeder."}));return json({ok:true},200,h)}
  catch(e){console.error("Test push failed",e.statusCode||"unknown");return json({error:"Push delivery failed"},502,h)}
 }
 if(req.method==="POST"&&url.pathname==="/api/alarms"){
  const b=await req.json();if(!["DK1","DK2"].includes(b.area)||!Number.isFinite(b.threshold)||b.threshold<0||b.threshold>50||!Number.isInteger(b.noticeHours)||b.noticeHours<0||b.noticeHours>24)return json({error:"Invalid alarm"},400,h);
  const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO alarms(id,subscription_id,area,threshold,notice_hours) VALUES(?,?,?,?,?)").bind(id,sub.id,b.area,b.threshold,b.noticeHours).run();return json({id},201,h);
 }
 if(req.method==="GET"&&url.pathname==="/api/alarms"){const r=await env.DB.prepare("SELECT id,area,threshold,notice_hours,enabled FROM alarms WHERE subscription_id=?").bind(sub.id).all();return json(r.results,200,h)}
 if(req.method==="DELETE"&&url.pathname.startsWith("/api/alarms/")){await env.DB.prepare("DELETE FROM alarms WHERE id=? AND subscription_id=?").bind(url.pathname.split("/").pop(),sub.id).run();return json({ok:true},200,h)}
 return json({error:"Not found"},404,h);
}
async function scheduled(env){
 if(env.ENABLE_AUTOMATIC_PRICE_PUSH!=="true")return;
 if(!env.VAPID_SUBJECT||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)throw Error("Push keys not configured");
 // Each area uses the separate, timezone-aware test feed.
 for(const area of ["DK1","DK2"]){
 const data=await fetchTestFeed(area);
 const hours=validateFeed(data,area);
 webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
 const alarms=await env.DB.prepare("SELECT a.*,s.subscription_json FROM alarms a JOIN subscriptions s ON a.subscription_id=s.id WHERE a.enabled=1 AND a.area=?").bind(area).all();
 const now=Date.now();
 const candidates=dueAlarms(alarms.results,hours,now,HOURLY_WINDOW_MS);
 for(const candidate of candidates){
  const alarm=alarms.results.find(a=>a.id===candidate.alarmId);
  const reserved=await env.DB.prepare("INSERT OR IGNORE INTO deliveries(alarm_id,start_time,end_time,status,attempted_at) SELECT ?,?,?,'reserved',? WHERE NOT EXISTS (SELECT 1 FROM deliveries WHERE alarm_id=? AND start_time<? AND COALESCE(end_time,strftime('%Y-%m-%dT%H:%M:%fZ',start_time,'+15 minutes'))>?)").bind(alarm.id,candidate.startTime,candidate.endTime,Date.now(),alarm.id,candidate.endTime,candidate.startTime).run();
  if(!reserved.meta.changes)continue;
  try{
   const response=await webpush.sendNotification(JSON.parse(alarm.subscription_json),JSON.stringify({title:"Elpris-alarm",body:`Strømpris ${candidate.price.toFixed(2)} kr/kWh kl. ${new Date(candidate.startTime).toLocaleTimeString("da-DK",{timeZone:"Europe/Copenhagen",hour:"2-digit",minute:"2-digit"})}`,url:"/push-test"}));
   await env.DB.prepare("UPDATE deliveries SET status='accepted',completed_at=?,http_status=? WHERE alarm_id=? AND start_time=? AND status='reserved'").bind(Date.now(),response.statusCode||201,alarm.id,candidate.startTime).run();
  }catch(e){
   // An uncertain error may already have delivered. Never retry automatically.
   const {status:state,httpStatus:code}=classifyPushOutcome(e);
   try{
    await env.DB.prepare("UPDATE deliveries SET status=?,completed_at=?,http_status=? WHERE alarm_id=? AND start_time=? AND status='reserved'").bind(state,Date.now(),code,alarm.id,candidate.startTime).run();
   }catch(dbError){console.error("Delivery status update failed",dbError.message);}
   console.error("Push delivery",state,code||"unknown");
  }
 }
 }
}
export default {fetch:api,scheduled:(_event,env,ctx)=>ctx.waitUntil(scheduled(env))};
