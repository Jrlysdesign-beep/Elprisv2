// Isolated Worker API security helpers. Pure validation; no network calls.
const HOSTS=new Set(["web.push.apple.com","push.apple.com","updates.push.services.mozilla.com","fcm.googleapis.com","fcm-xm.googleapis.com"]);
export const MAX_REGISTER_BYTES=4096;
export function validateSubscription(value){
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 if(typeof value.endpoint!=="string"||value.endpoint.length>2048)return false;
 let url;try{url=new URL(value.endpoint)}catch{return false}
 if(url.protocol!=="https:"||!HOSTS.has(url.hostname.toLowerCase())||url.port||url.username||url.password||url.hash)return false;
 const keys=value.keys;
 if(!keys||typeof keys!=="object")return false;
 const valid=(s,bytes)=>typeof s==="string"&&/^[A-Za-z0-9_-]+={0,2}$/.test(s)&&s.length<150&&(()=>{try{const normalized=s.replace(/-/g,"+").replace(/_/g,"/");const raw=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,"="));return raw.length===bytes}catch{return false}})();
 return valid(keys.p256dh,65)&&valid(keys.auth,16);
}
export function parseRegistration(text){
 if(typeof text!=="string"||new TextEncoder().encode(text).length>MAX_REGISTER_BYTES)throw Error("Payload too large");
 let body;try{body=JSON.parse(text)}catch{throw Error("Invalid JSON")}
 if(!validateSubscription(body?.subscription))throw Error("Invalid subscription");
 return body.subscription;
}
export const RATE_LIMITS=Object.freeze({register:5,testPush:2});
export function bucketId(action,subject,nowMs){
 if(!Object.hasOwn(RATE_LIMITS,action)||typeof subject!=="string"||!subject||!Number.isFinite(nowMs))throw Error("Invalid rate limit");
 return action+":"+subject+":"+Math.floor(nowMs/3600000);
}
