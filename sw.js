const C="elpris-v5";self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png"]))) });self.addEventListener("activate",e=>e.waitUntil(clients.claim()));self.addEventListener("fetch",e=>{if(e.request.url.includes("prices.json"))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))})
// Prepared for the isolated installed PWA only. A push subscription is origin-bound.
self.addEventListener("push",event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const title=typeof data.title==="string"?data.title.slice(0,100):"Elpris prisalarm";
 const body=typeof data.body==="string"?data.body.slice(0,250):"Ny prisalarm";
 event.waitUntil(self.registration.showNotification(title,{body,tag:"elprisv2-price-alert",data:{url:"./index.html"}}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
  const own=list.find(c=>new URL(c.url).origin===self.location.origin);
  return own?own.focus():clients.openWindow(new URL("./index.html",self.registration.scope).href);
 }));
});
