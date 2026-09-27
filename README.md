# parksafeapp.com

The ParkSafe website: home, privacy policy, terms, support, and `app-ads.txt`. It will grow into the ParkSafe web app. Built with [Astro](https://astro.build) and served from a private S3 bucket behind CloudFront.

## Local development

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # static site in dist/
npm run preview      # serve dist/ locally
```

Checks (CI runs both on every push and pull request):

```bash
npm run test:edge                          # CloudFront viewer-request function
npm run check:urls                         # against npm run preview
npm run check:urls -- https://parksafeapp.com
```

## Layout

- `src/pages/` — one Markdown file per page, built to `<page>/index.html`
- `src/layouts/` — page shell (header, footer, meta tags)
- `public/` — copied as-is. `app-ads.txt` is read by AdMob and has to stay byte-for-byte the same.
- `infra/` — hosting stack and deploy scripts

## URLs that must keep working

The App Store listing and the iOS app link to `/privacy`, `/terms` and `/support`, and AdMob verifies `/app-ads.txt`. `npm run check:urls` covers all of them, with and without the trailing slash.

## Hosting

```
Cloudflare DNS (DNS only) → CloudFront (Free flat-rate plan) → private S3 bucket
```

- `infra/site.yml` — the bucket, the CloudFront distribution, the viewer-request function (www → apex redirect, `/privacy` → `/privacy/index.html`), and the IAM role GitHub Actions uses to publish
- `infra/deploy.sh` — creates or updates that stack, including the TLS certificate
- `infra/publish.sh` — uploads `dist/` and clears the CloudFront cache

Pushes to `main` publish automatically (`.github/workflows/deploy.yml`) once the repository variables `AWS_DEPLOY_ROLE_ARN`, `SITE_BUCKET` and `DISTRIBUTION_ID` are set.

## Moving parksafeapp.com off GitHub Pages

Don't merge this into `main` while GitHub Pages still serves the site: Pages would build the new layout with Jekyll and break it.

1. Run `infra/deploy.sh`. When it prints two CNAME records, add them in Cloudflare as **DNS only**. It waits for the certificate, then creates the stack (CloudFront takes a few minutes).
2. In the CloudFront console, open the distribution and subscribe it to the **Free** flat-rate plan. The plan attaches a WAF web ACL; later runs of `deploy.sh` keep it attached.
3. Publish from this branch: `npm run build && infra/publish.sh`.
4. Test on CloudFront's own domain: `npm run check:urls -- https://<distribution>.cloudfront.net`.
5. In Cloudflare, point the domain at CloudFront, both records **DNS only**:
   - `parksafeapp.com`: replace the four GitHub Pages `A` records with `CNAME` → `<distribution>.cloudfront.net`
   - `www`: change the `CNAME` from `jonwein.github.io` to `<distribution>.cloudfront.net`

   Leave the `google-site-verification` TXT record alone.
6. Once DNS has updated, run `npm run check:urls -- https://parksafeapp.com` and check that `https://www.parksafeapp.com/privacy` redirects to `https://parksafeapp.com/privacy`.
7. Turn off GitHub Pages (Settings → Pages).
8. Set the repository variables with the `gh variable set` commands `deploy.sh` printed, then merge.
