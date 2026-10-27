// Isolated Elprisv2 PWA push client. Never load this module on the public deployment.
const API="https://elpris-push-isolated-test.jrlysdesign.workers.dev";
const TOKEN_KEY="elprisv2_isolated_push_token_v1";
const $=id=>document.getElementById(id);
const say=s=>{$("pushStatus").textContent=s};
const b64=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const allowed=()=>location.protocol==="https:" && location.hostname!=="jrlysdesign-beep.github.io" && location.origin!==API;
const installed=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
let token="";
function auth(){if(!token)throw Error("Registrér push på denne installation først.");return {"Authorization":"Bearer "+token}}
async function call(path,opts={}) {
 const response=await fetch(API+path,{mode:"cors",credentials:"omit",cache:"no-store",...opts});
 let data;try{data=await response.json()}catch{throw Error("Push-serveren svarede ikke korrekt.")}
 if(!response.ok)throw Error(data.error||"HTTP "+response.status);
 return data;
}
async function list(){
 const root=$("pushList");root.replaceChildren();
 if(!token){root.textContent="Ingen registrering på denne installation endnu.";return}
 const alarms=await call("/api/alarms",{headers:auth()});
 if(!Array.isArray(alarms))throw Error("Uventet svar fra push-serveren.");
 if(!alarms.length){root.textContent="Ingen pushalarmer endnu.";return}
 for(const a of alarms){
  const row=document.createElement("div");row.className="alarm-row";
  const label=document.createElement("div");label.textContent=a.area+" · under "+Number(a.threshold).toLocaleString("da-DK")+" kr./kWh · "+a.notice_hours+" timer før";
  const del=document.createElement("button");del.type="button";del.textContent="Slet";
  del.onclick=async()=>{del.disabled=true;try{await call("/api/alarms/"+encodeURIComponent(a.id),{method:"DELETE",headers:auth()});await list();say("Pushalarm slettet.")}catch(e){say(e.message);del.disabled=false}};
  row.append(label,del);root.append(row);
 }
}
async function register(){
 if(!allowed())throw Error("Push er spærret på den offentlige adresse. Kræver særskilt HTTPS-testdomæne.");
 if(!installed())throw Error("På iPhone: installer testappen på hjemmeskærmen og åbn den derfra.");
 if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))throw Error("Web Push understøttes ikke her.");
 if(await Notification.requestPermission()!=="granted")throw Error("Notifikationer blev ikke tilladt.");
 const reg=await navigator.serviceWorker.ready;
 if(new URL(reg.scope).origin!==location.origin)throw Error("Service worker tilhører forkert domæne.");
 const {publicKey}=await call("/api/vapid");
 const existing=await reg.pushManager.getSubscription();
 const sub=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(publicKey)});
 const result=await call("/api/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subscription:sub})});
 if(typeof result.token!=="string")throw Error("Registrering mangler adgangsnøgle.");
 token=result.token;localStorage.setItem(TOKEN_KEY,token);
 await list();say("Push registreret på denne testinstallation.");
}
async function save(){
 const area=$("pushArea").value,threshold=Number($("pushThreshold").value.replace(",",".")),noticeHours=Number($("pushNotice").value);
 if(!["DK1","DK2"].includes(area)||!Number.isFinite(threshold)||threshold<0||threshold>50||!Number.isInteger(noticeHours)||noticeHours<0||noticeHours>24)throw Error("Ugyldige alarmindstillinger.");
 await call("/api/alarms",{method:"POST",headers:{"content-type":"application/json",...auth()},body:JSON.stringify({area,threshold,noticeHours})});
 await list();say("Pushalarm gemt.");
}
function handler(fn){return async()=>{try{await fn()}catch(e){say("Push: "+e.message)}}}
if($("pushRegister")){
 token=localStorage.getItem(TOKEN_KEY)||"";
 $("pushRegister").onclick=handler(register);
 $("pushSave").onclick=handler(save);
 $("pushRefresh").onclick=handler(list);
 if(!allowed()){
  $("pushRegister").disabled=true;$("pushSave").disabled=true;$("pushRefresh").disabled=true;
  say("Sikkerhedslås: kræver isoleret HTTPS-testadresse. Ingen API-adgang fra offentlig app.");
 }else{say("Klar til isoleret test. API kræver godkendt CORS-origin.");}
}
