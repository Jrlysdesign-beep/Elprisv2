# Separat testudgivelse — trinvis opsætning (ikke produktion)

Status: Konfiguration klargjort i GitHub, **ikke udgivet**. Der er ingen Cloudflare-adgang i denne arbejdsgang; en ny Worker og D1 skal oprettes via Cloudflare eller en autoriseret integration. Ingen ændringer i den eksisterende `Elprisv2`-live-app.

1. Opret en NY D1-database med navnet `elpris-push-isolated-test-db` i Cloudflare. Brug IKKE `elpris-live-db`.
2. Indsæt database-ID'et i `push-test/wrangler.jsonc` i denne testgren.
3. Opret VAPID-nøgler lokalt i et sikkert miljø. Gem den private nøgle KUN som Cloudflare-secret. Læg aldrig privat nøgle i GitHub.
4. Kør `npx wrangler d1 execute elpris-push-isolated-test-db --remote --file=schema.sql` fra `push-test`, når DB-bindingen er korrekt.
5. Kontroller at testens prisfeed matcher forventet skema og har korrekte tidszoner, DK1/DK2 og kr/kWh. Kør tests inden aktivering af cron.
6. Kør `npm install` og `npx wrangler deploy` fra `push-test`, når koden er gennemgået. **Denne kommando er IKKE kørt.**
7. Opret en separat frontend-testadresse og installer dens egen service worker; giv push-tilladelse via brugerklik på iPhone. Test med lukket app og låst skærm.

## Før udgivelse: blokerende problemer
- Eksisterende prisfeed er ikke verificeret mod Workerens skema.
- Pushbibliotekets kompatibilitet med Workers er ikke verificeret.
- Web Push-registrering er ikke koblet til appens popup/service worker.
- Token-/origin-beskyttelse, rate limiting og oprydning af udløbne abonnementer kræver yderligere arbejde.
- Cron skal være deaktiveret indtil testmiljøet er klart.
