import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("direct UI has native controls and no iframe",()=>{
 const html=read("index.html");
 for(const id of ["pushRegister","pushArea","pushThreshold","pushNotice","pushSave","pushRefresh","pushList","pushStatus"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/<iframe/i);
 assert.match(html,/push-alarm-direct\.js/);
});
test("client is disabled except on exact isolated HTTPS origin",()=>{
 const js=read("push-alarm-direct.js");
 assert.match(js,/location\.origin===TEST_ORIGIN/);
 assert.match(js,/https:\/\/elprisv2-ui-isolated-test\.pages\.dev/);
 assert.match(js,/if\(!allowed\(\)\)/);
 assert.match(js,/credentials:"omit"/);
 assert.match(js,/navigator\.serviceWorker\.ready/);
 assert.match(js,/pushManager\.subscribe/);
 assert.match(js,/Notification\.requestPermission/);
});
test("worker CORS is restricted to explicitly configured origin",()=>{
 const worker=read("push-test/src/worker.js");
 const config=JSON.parse(read("push-test/wrangler.jsonc"));
 assert.equal(config.name,"elpris-push-isolated-test");
 assert.equal(config.vars.PUSH_UI_TEST_ORIGIN,"https://elprisv2-ui-isolated-test.pages.dev");
 assert.match(worker,/origin===env\.PUSH_UI_TEST_ORIGIN/);
 assert.match(worker,/origin===env\.ALLOWED_ORIGIN/);
});
test("service worker handles origin-bound notifications",()=>{
 const sw=read("sw.js");
 assert.match(sw,/addEventListener\("push"/);
 assert.match(sw,/addEventListener\("notificationclick"/);
 assert.match(sw,/self\.location\.origin/);
});

test("duplicate registration does not silently replace a subscription",()=>{
 const js=read("push-alarm-direct.js");
 assert.match(js,/response.status===409/);
 assert.match(js,/ændrer ikke abonnementet automatisk/);
 assert.match(js,/response.status===401/);
 assert.match(js,/localStorage.removeItem\(TOKEN_KEY\)/);
});
test("no deployment or production worker binding is introduced",()=>{
 const config=JSON.parse(read("push-test/wrangler.jsonc"));
 assert.equal(config.d1_databases[0].database_name,"elpris-push-isolated-test-db");
 assert.equal(config.d1_databases[0].database_id,"2811e53d-ee9d-45d2-94dc-d8ffed33d447");
 assert.deepEqual(config.triggers.crons,["0 * * * *"]);
});
