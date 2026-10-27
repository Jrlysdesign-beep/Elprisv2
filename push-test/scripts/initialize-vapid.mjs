import webpush from "web-push";
import { execFileSync } from "node:child_process";

const config = JSON.parse((await import("node:fs")).readFileSync("wrangler.jsonc", "utf8"));
if (config.name !== "elpris-push-isolated-test" || config.triggers?.crons?.length) {
  throw Error("Unsafe Worker configuration");
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw Error("Missing Cloudflare credentials");
}
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const subject = "mailto:jrlysdesign@gmail.com";
for (const [key, value] of Object.entries({
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: privateKey,
  VAPID_SUBJECT: subject
})) {
  execFileSync("npx", ["wrangler", "secret", "put", key, "--config", "wrangler.jsonc"], {
    input: value,
    stdio: ["pipe", "ignore", "inherit"],
    env: process.env
  });
}
console.log("VAPID key pair stored in isolated Cloudflare Worker. Key material not printed.");
