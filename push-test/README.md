# Isoleret Web Push-test til Elprisv2

**Kun udviklingskode. Ikke deployet. Ingen ændringer i main, GitHub Pages eller eksisterende Workers.**

Denne mappe er en selvstændig prototype. Den kræver ny Cloudflare Worker, ny D1 database og VAPID-nøgler. Den er ikke integreret i brugerfladen endnu og er ikke afprøvet på iPhone.

## Før deployment
1. Opret en helt ny D1 database `elpris-push-isolated-test-db` og indsæt dens ID i wrangler.jsonc.
2. Generér et VAPID-nøglepar sikkert; læg privat nøgle i Worker-secret `VAPID_PRIVATE_KEY`, offentlig nøgle i `VAPID_PUBLIC_KEY`, og kontaktadresse i `VAPID_SUBJECT`.
3. Gennemgå den aktuelle prisdatastruktur og tidszoner. Testfeedet skal levere ISO-tidspunkter med UTC-offset samt priser i kr/kWh og område. Den eksisterende prices.json er ikke verificeret kompatibel.
4. Kør D1 schema.sql mod **testdatabasen alene**.
5. Test API, krypteret push, tidsplan, dubletbeskyttelse og iPhone-hjemmeskærm i separat testudgivelse før nogen produktionsændring.

## Sikkerhed
Abonnementer knyttes til tilfældige klienttokens. Ingen login. Registrering er kun mulig fra godkendt origin; dette er ikke fuld misbrugsbeskyttelse, og før offentlig lancering skal der tilføjes rate limiting, validering, oprydning af ugyldige abonnementer og passende privatlivsinformation. Token skal ikke logges. 

## Begrænsninger
Cloudflare Workers-kompatibilitet med `web-push` under `nodejs_compat` skal testes. Priser og tidszoner skal verificeres. Ingen garanti for præcis leveringstid fra Apple Push Service.
