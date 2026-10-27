const API = location.origin;
const out = document.getElementById("status");
const say = s => out.textContent = s;
function base64ToBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4-s.length%4)%4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
document.getElementById("enable").addEventListener("click", async () => {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw Error("Denne browser understøtter ikke Web Push.");
    if (matchMedia("(display-mode: standalone)").matches === false) throw Error("Åbn først denne testside fra hjemmeskærmen på iPhone.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw Error("Notifikationer blev ikke tilladt.");
    const reg = await navigator.serviceWorker.register("/push-sw.js", {scope:"/"});
    await navigator.serviceWorker.ready;
    const response = await fetch("/api/vapid");
    if (!response.ok) throw Error("Kunne ikke hente push-nøglen.");
    const {publicKey} = await response.json();
    const sub = await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(publicKey)});
    const saved = await fetch("/api/register", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subscription:sub})});
    if (!saved.ok) throw Error("Kunne ikke registrere telefonen ("+saved.status+").");
    const {token} = await saved.json();
    localStorage.setItem("elpris_push_test_token",token);
    say("Telefonen er registreret. Nu kan du sende en testbesked.");
  } catch(e) {say("Fejl: "+e.message);}
});
document.getElementById("test").addEventListener("click",async()=>{
  try {
    const token=localStorage.getItem("elpris_push_test_token");
    if(!token) throw Error("Aktivér først notifikationer.");
    const res=await fetch("/api/test-push",{method:"POST",headers:{authorization:"Bearer "+token}});
    const data=await res.json();
    if(!res.ok)throw Error(data.error||"Kunne ikke sende.");
    say("Testbesked sendt. Kontrollér din iPhones notifikationer.");
  }catch(e){say("Fejl: "+e.message);}
});
