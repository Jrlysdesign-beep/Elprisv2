// Pure, side-effect-free delivery reservation model used in safety tests.
// The production worker uses INSERT OR IGNORE with a unique (alarm_id,start_time) key.
// No network, database or push operations are performed here.
export function deliveryKey(alarmId,startTime){
 if(typeof alarmId!=="string"||!alarmId||typeof startTime!=="string"||!Number.isFinite(Date.parse(startTime)))throw Error("Invalid delivery identity");
 return alarmId+"|"+new Date(startTime).toISOString();
}
export function simulateDelivery(attempts,{sendResult="success"}={}){
 const reserved=new Set(),events=[];
 for(const attempt of attempts){
  const key=deliveryKey(attempt.alarmId,attempt.startTime);
  if(reserved.has(key)){events.push({key,status:"duplicate-blocked"});continue;}
  reserved.add(key);
  events.push({key,status:sendResult==="success"?"send-attempted":"reserved-but-delivery-uncertain"});
 }
 return {events,reservedCount:reserved.size,sendAttempts:events.filter(x=>x.status!=="duplicate-blocked").length};
}
