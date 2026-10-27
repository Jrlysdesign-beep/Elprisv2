// Dedicated Elprisv2 iPhone test PWA. Never register this worker on the public app.
const CACHE="elprisv2-isolated-iphone-v1";
const ASSETS=["./","./index.html","./manifest.webmanifest","./push-alarm-direct.js","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("elprisv2-isolated-iphone-")&&key!==CACHE).map(key=>caches.delete(key)))),
  self.clients.claim()
 ]));
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.endsWith("/prices.json"))return; // never cache price data
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
self.addEventListener("push",event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const title=typeof data.title==="string"?data.title.slice(0,100):"Elpris prisalarm";
 const body=typeof data.body==="string"?data.body.slice(0,250):"Ny prisalarm";
 event.waitUntil(self.registration.showNotification(title,{body,tag:"elprisv2-price-alert",data:{url:new URL("./index.html",self.registration.scope).href}}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
  const own=list.find(client=>new URL(client.url).origin===self.location.origin);
  return own?own.focus():self.clients.openWindow(new URL("./index.html",self.registration.scope).href);
 }));
});
