// Pure status classifier; no push, database or network access.
export function classifyPushOutcome(error){
 const status=error?.statusCode;
 if(Number.isInteger(status)&&status>=400&&status<500&&status!==408&&status!==429)return {status:"failed",httpStatus:status};
 return {status:"uncertain",httpStatus:Number.isInteger(status)?status:null};
}
export const DELIVERY_STATES=Object.freeze(["reserved","accepted","failed","uncertain"]);
