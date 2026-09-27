// Checks that every URL the App Store listing, the iOS app and AdMob depend on still works.
// Usage: npm run check:urls -- https://parksafeapp.com   (defaults to a local `npm run preview`)
import { readFileSync } from 'node:fs';

const base = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const appAds = readFileSync(new URL('../public/app-ads.txt', import.meta.url), 'utf8');

const pages = ['/', '/privacy', '/privacy/', '/terms', '/terms/', '/support', '/support/'];
let failures = 0;

function report(ok, label, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
}

for (const path of pages) {
  const res = await fetch(base + path);
  const body = await res.text();
  const title = body.match(/<title>([^<]*)<\/title>/)?.[1];
  report(res.status === 200 && Boolean(title), path, `${res.status}, title: ${title ?? 'none'}`);
}

const ads = await fetch(`${base}/app-ads.txt`);
const adsBody = await ads.text();
report(ads.status === 200 && adsBody === appAds, '/app-ads.txt', `${ads.status}, ${adsBody === appAds ? 'matches' : 'differs from'} public/app-ads.txt`);

const missing = await fetch(`${base}/no-such-page`);
report(missing.status === 404, '/no-such-page', `${missing.status}`);

if (failures) {
  console.log(`\n${failures} check(s) failed against ${base}`);
  process.exit(1);
}
console.log(`\nAll checks passed against ${base}`);
