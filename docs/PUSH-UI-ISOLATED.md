# Isolated direct Web Push UI – not deployed

The integration in `index.html` uses `push-alarm-direct.js` to create, list and delete alarms through the existing isolated Worker API. No iframe is used.

## Origin and iPhone requirements
- **Planned, not provisioned:** `https://elprisv2-ui-isolated-test.pages.dev`. Both the client and Worker CORS configuration pin this exact origin. A different actual test URL requires matching edits before deployment.
- Never deploy this UI to the public GitHub Pages app. The push client refuses registration and API actions unless the origin matches the dedicated test hostname.
- On iPhone, open the dedicated HTTPS test PWA from the home screen. PushManager subscribes through that origin's registered service worker (`sw.js`).
- A push subscription created on the existing `workers.dev` push-test origin **cannot** be reused on the new PWA origin. Re-registering on the new origin creates a separate subscription and alarm list. The old subscription remains independent.
- `push-test/src/worker.js` allows the exact dedicated origin via `PUSH_UI_TEST_ORIGIN` in the branch-only `push-test/wrangler.jsonc`. Existing same-origin calls remain supported. **Do not deploy this Worker change until the test origin is confirmed and reviewed.**
- Browser storage contains the bearer token for this test origin; do not log or export it. Browser data reset can remove the token. If a push subscription exists without its token, registration may return HTTP 409 and must not silently overwrite or leak an existing token.
- The test UI is not yet deployed; iPhone behavior, CORS and end-to-end notifications have **not** been verified.

## Offline checks
Run from the repository root:
```sh
node --check push-alarm-direct.js
node --check sw.js
node --test tests/push-ui-isolation.test.mjs
```
The static tests check fail-closed origin guards, required UI elements, same-origin service-worker handling, and exact-origin CORS preparation. They do not contact Cloudflare.
