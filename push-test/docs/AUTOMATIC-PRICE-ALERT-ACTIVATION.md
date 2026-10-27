# Automatic price alerts — isolated test only (NOT ACTIVATED)

Current state: the Worker implements scheduled price checks, but `push-test/wrangler.jsonc` deliberately has **no cron trigger**, and `ENABLE_AUTOMATIC_PRICE_PUSH` is not set to `true`. No automatic push can run until both are explicitly configured and the isolated Worker is deployed.

## What already works in source
- Fetch DK1/DK2 quarter-hour spot prices from Energi Data Service, validate Danish timezone and offsets.
- Evaluate each enabled alarm's threshold and 0–24-hour notice period.
- Reserve each cheap period atomically in D1, avoiding repeated sends across overlapping intervals.
- Record accepted, rejected or uncertain push delivery without automatic retry.
- Zero-hour alarms may trigger at the beginning of a cheap period (15-minute late window).

## Safe prerequisites before activation
1. Run the manual read-only GitHub audit and confirm the updated price-engine unit tests pass.
2. Verify the migrated isolated D1 schema and an existing saved alarm in the isolated test UI.
3. Confirm isolated Worker VAPID credentials and the test iPhone subscription are valid.
4. Confirm the alarm threshold is for **spot price excluding VAT, electricity tax and network tariffs**, not the household total.
5. Ensure the target is exactly `elpris-push-isolated-test`, database `elpris-push-isolated-test-db` (`2811e53d-ee9d-45d2-94dc-d8ffed33d447`). Never change the public site or its Worker.
6. Obtain separate explicit authorization to enable automatic push. Activation requires adding a cron trigger (suggested every 5 minutes, `*/5 * * * *`) to the isolated Worker config, setting `ENABLE_AUTOMATIC_PRICE_PUSH=true` only on the isolated Worker, and deploying it. This document does **not** perform any of those steps.
7. After authorization, test one real low-risk alert and inspect delivery records, then verify no duplicates. Monitor provider failures.

## Stop / rollback
To disable automatic sends, remove/disable the isolated cron trigger and unset `ENABLE_AUTOMATIC_PRICE_PUSH` on the isolated Worker. These are Cloudflare operations and require explicit approval. The existing manual test-push endpoint is independent of the scheduled trigger.

## Important limitation
A failed price feed or missed scheduler window can cause an alert to be missed; the system intentionally does not send old or uncertain notifications. A 5-minute cron reduces scheduling delays but does not guarantee delivery. No automatic push has been enabled by this preparation.
