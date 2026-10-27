import testClient from "./test-client.js";
import webpush from "web-push";
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json",...headers}});
const cors=(req,env)=>({"access-control-allow-origin":env.ALLOWED_ORIGIN,"access-control-allow-methods":"GET,POST,DELETE,OPTIONS","access-control-allow-headers":"content-type,authorization","vary":"Origin"});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const token=req=>req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
async function api(req,env){
 const url=new URL(req.url),h=cors(req,env);
 if(req.method==="GET"&&url.pathname==="/push-test")return new Response(`<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#102030"><link rel="manifest" href="/push-manifest.webmanifest"><title>Elpris Push Test</title><style>body{font:17px system-ui;background:#102030;color:white;max-width:540px;margin:30px auto;padding:20px}button{display:block;width:100%;padding:16px;margin:15px 0;border:0;border-radius:12px;font-size:17px}#status{white-space:pre-wrap}</style></head><body><h1>Elpris – Push test</h1><p>Separat test. Tilføj siden til hjemmeskærmen i Safari, åbn den derfra, og tillad notifikationer.</p><button id="enable">Aktivér notifikationer</button><button id="test">Send testbesked</button><p id="status">Klar til test</p><script type="module" src="/push-test-client.js"></script></body></html>`,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
 if(req.method==="GET"&&url.pathname==="/push-manifest.webmanifest")return json({name:"Elpris Push Test",short_name:"Push test",start_url:"/push-test",scope:"/",display:"standalone",background_color:"#102030",theme_color:"#102030"});
 if(req.method==="GET"&&url.pathname==="/push-sw.js")return new Response(`self.addEventListener("push",event=>{let data={};try{data=event.data?.json()||{}}catch{}event.waitUntil(self.registration.showNotification(data.title||"Elpris test",{body:data.body||"Testbesked",data:{url:"/push-test"}}))});self.addEventListener("notificationclick",event=>{event.notification.close();event.waitUntil(clients.openWindow("/push-test"))});`,{headers:{"content-type":"text/javascript","cache-control":"no-store","service-worker-allowed":"/"}});
 if(req.method==="GET"&&url.pathname==="/push-test-client.js")return new Response(testClient,{headers:{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store"}});
 if(req.method==="GET"&&url.pathname==="/health")return json({ok:true,service:"elpris-push-isolated-test",pushConfigured:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT)},200,{"cache-control":"no-store"});
 if(req.headers.get("origin")!==env.ALLOWED_ORIGIN)return json({error:"Origin not allowed"},403,h);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 if(req.method==="GET"&&url.pathname==="/api/vapid")return env.VAPID_PUBLIC_KEY?json({publicKey:env.VAPID_PUBLIC_KEY},200,h):json({error:"Push not configured"},503,h);
 if(req.method==="POST"&&url.pathname==="/api/register"){
  if(!env.VAPID_PRIVATE_KEY||!env.VAPID_PUBLIC_KEY)return json({error:"Push not configured"},503,h);
  const body=await req.json();if(!body.subscription?.endpoint?.startsWith("https://")||!body.subscription?.keys?.p256dh||!body.subscription?.keys?.auth)return json({error:"Invalid subscription"},400,h);
  const t=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-",""),id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO subscriptions(id,endpoint,subscription_json,token_hash,created_at) VALUES(?,?,?,?,?)").bind(id,body.subscription.endpoint,JSON.stringify(body.subscription),await hash(t),Date.now()).run();
  return json({token:t},201,h);
 }
 const t=token(req);if(!t)return json({error:"Authorization required"},401,h);
 const sub=await env.DB.prepare("SELECT id FROM subscriptions WHERE token_hash=?").bind(await hash(t)).first();
 if(!sub)return json({error:"Unknown subscription"},401,h);
 if(req.method==="POST"&&url.pathname==="/api/test-push"){
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
 if(!env.VAPID_SUBJECT||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)throw Error("Push keys not configured");
 const response=await fetch(env.PRICE_URL,{headers:{"accept":"application/json"}});if(!response.ok)throw Error("Price feed unavailable");
 const data=await response.json();
 // Fail closed until a timezone-aware, area-specific feed has been verified.
 if(!Array.isArray(data.hours)||!data.hours.every(x=>typeof x.time==="string"&&/(Z|[+-]\\d{2}:\\d{2})$/.test(x.time)&&Number.isFinite(x.price)))throw Error("Unverified price feed timestamps");
 const area=data.area;if(!["DK1","DK2"].includes(area))throw Error("Unknown area");
 webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
 const alarms=await env.DB.prepare("SELECT a.*,s.subscription_json FROM alarms a JOIN subscriptions s ON a.subscription_id=s.id WHERE a.enabled=1 AND a.area=?").bind(area).all();
 const now=Date.now();
 for(const a of alarms.results)for(const p of data.hours){
  const start=Date.parse(p.time),due=start-a.notice_hours*3600000;
  if(!Number.isFinite(start)||p.price>=a.threshold||now<due||now>=due+60000)continue;
  const reserved=await env.DB.prepare("INSERT OR IGNORE INTO deliveries(alarm_id,start_time) VALUES(?,?)").bind(a.id,p.time).run();
  if(!reserved.meta.changes)continue;
  try{await webpush.sendNotification(JSON.parse(a.subscription_json),JSON.stringify({title:"Elpris-alarm",body:`Strømpris ${p.price.toFixed(2)} kr/kWh kl. ${new Date(start).toLocaleTimeString("da-DK",{timeZone:"Europe/Copenhagen",hour:"2-digit",minute:"2-digit"})}`,url:"/Elprisv2/"}));}
  catch(e){await env.DB.prepare("DELETE FROM deliveries WHERE alarm_id=? AND start_time=?").bind(a.id,p.time).run();console.error("Push delivery failed",e.statusCode||"unknown")}
 }
}
export default {fetch:api,scheduled:(_event,env,ctx)=>ctx.waitUntil(scheduled(env))};
