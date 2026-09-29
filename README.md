# parksafeapp.com

The ParkSafe website: an NYC parking sign map (`/map`), today's alternate side parking status (`/asp`), and the home, privacy, terms and support pages the iOS app links to. Built with [Astro](https://astro.build) and [Preact](https://preactjs.com); the map uses [MapLibre](https://maplibre.org) with [OpenFreeMap](https://openfreemap.org) base maps and [NYC GeoSearch](https://geosearch.planninglabs.nyc) for address search. Served from a private S3 bucket behind CloudFront.

## Local development

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # static site in dist/
npm run preview      # serve dist/ locally (no sign data: see below)
```

The map's data comes from the production API. For `npm run dev` to serve it, create a `.env` (gitignored) with the API's base URL and the website's key:

```bash
printf 'PARKSAFE_API_BASE_URL=%s\nPARKSAFE_API_KEY=%s\n' \
  https://g6g5ew4y5c.execute-api.us-east-1.amazonaws.com/prod \
  "$(aws ssm get-parameter --name /parksafe-web/api-key --query Parameter.Value --output text)" > .env
```

`scripts/dev-api.mjs` then answers `/tiles/*` and `/asp-calendar` the way CloudFront does in production, adding the key on the server.

Checks (CI runs them on every push and pull request):

```bash
npm test                                   # restriction logic against the iOS app's own output
npm run check                              # type-check
npm run test:edge                          # CloudFront viewer-request function
npm run check:urls                         # against npm run preview
npm run check:urls -- https://parksafeapp.com
```

## Layout

- `src/pages/` — the pages; the Markdown ones build to `<page>/index.html`
- `src/components/map/` — the map app (`MapApp.tsx`), loaded only on `/map`
- `src/lib/restrictions/` — port of the iOS app's restriction logic: sign parsing, when a sign restricts parking, New York time, the ASP calendar
- `src/lib/tiles.ts` — which sign tiles cover the map, and loading them
- `public/` — copied as-is. `app-ads.txt` is read by AdMob and has to stay byte-for-byte the same.
- `infra/` — hosting stack and deploy scripts

## Matching the iOS app

The map has to show the same status as the app for every sign. `src/lib/restrictions/fixtures/restriction-cases.json` is generated in the ParkSafe repo by compiling the app's own Swift code and running it over real signs and edge cases (overnight windows, several windows per sign, ASP suspensions, both daylight-saving changes). `npm test` checks the port against every case.

When the app's restriction code changes: run `Tools/RestrictionFixtures/generate.sh` in the ParkSafe repo, then `npm run sync:fixtures` here, and fix whatever `npm test` reports.

## How the map gets its data

```
browser ──► CloudFront ──► S3                      pages, scripts
                      ├──► API Gateway /tiles/*       sign data, one zoom-16 tile (~460m) per request
                      └──► API Gateway /asp-calendar  NYC 311 ASP calendar
```

CloudFront adds the website's API key (from SSM `/parksafe-web/api-key`) to requests it forwards, so the key never reaches browsers. Tiles are cached by path until the daily sign-data reload, so however many people look at a block, the API sees about one request per tile per day.

## URLs that must keep working

The App Store listing and the iOS app link to `/privacy`, `/terms` and `/support`, and AdMob verifies `/app-ads.txt`. `npm run check:urls` covers all of them, with and without the trailing slash.

## Hosting

```
Cloudflare DNS (DNS only) → CloudFront (Free flat-rate plan) → private S3 bucket, API Gateway
```

- `infra/site.yml` — the bucket, the CloudFront distribution (including the `/tiles/*` and `/asp-calendar` routes to the API), the viewer-request function (www → apex redirect, `/privacy` → `/privacy/index.html`), and the IAM role GitHub Actions uses to publish
- `infra/deploy.sh` — creates or updates that stack, including the TLS certificate
- `infra/publish.sh` — uploads `dist/` and clears the CloudFront cache

Pushes to `main` publish automatically (`.github/workflows/deploy.yml`, using the repository variables `AWS_DEPLOY_ROLE_ARN`, `SITE_BUCKET` and `DISTRIBUTION_ID`). Changes to `infra/site.yml` need `infra/deploy.sh`.

The distribution is on CloudFront's Free flat-rate plan, which rules out custom cache policies and a price class, so `site.yml` uses managed policies only. The plan's WAF web ACL is attached outside the template; `deploy.sh` keeps it attached.

The map needs the API set up first, from the ParkSafe repo, in this order:

1. `Backend/nyc-location/deploy.sh` — the Lambda that serves `/tiles`
2. `Backend/web-api/setup.sh` — the `/tiles` route, the website's API key and usage plan, and the key in SSM
3. `infra/deploy.sh` here — CloudFront's routes to the API (they read the key from SSM)
