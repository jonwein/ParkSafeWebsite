// @ts-check
import { defineConfig } from 'astro/config';

// Pages build to <page>/index.html; the CloudFront viewer-request function in infra/site.yml
// maps /privacy and /privacy/ to that file so both URLs keep working.
export default defineConfig({
  site: 'https://parksafeapp.com',
  build: {
    format: 'directory',
  },
});
