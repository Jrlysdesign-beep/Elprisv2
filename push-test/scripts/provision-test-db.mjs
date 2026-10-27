import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const name = "elpris-push-isolated-test-db";
const path = "wrangler.jsonc";
const run = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
if (!process.env.CLOUDFLARE_API_TOKEN) throw Error("Missing CLOUDFLARE_API_TOKEN");
if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw Error("Missing CLOUDFLARE_ACCOUNT_ID. Configure account ID as an Actions secret first.");
const cfg = JSON.parse(readFileSync(path, "utf8"));
if (cfg.name !== "elpris-push-isolated-test" || cfg.d1_databases?.[0]?.database_name !== name) throw Error("Unsafe or unexpected configuration");
let list = JSON.parse(run("d1", "list", "--json"));
if (!Array.isArray(list)) throw Error("Unexpected D1 list response");
let db = list.find(x => x.name === name);
if (!db) {
  const output = run("d1", "create", name, "--json");
  db = JSON.parse(output);
}
const id = db.uuid || db.database_id;
if (!/^[0-9a-f-]{36}$/i.test(id || "")) throw Error("Could not verify isolated D1 database UUID");
cfg.d1_databases[0].database_id = id;
writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
console.log("Configured isolated D1 database:", name);
