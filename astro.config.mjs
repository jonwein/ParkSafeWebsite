// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import { loadEnv } from 'vite';
import { devApi } from './scripts/dev-api.mjs';

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), 'PARKSAFE_');

// Pages build to <page>/index.html; the CloudFront viewer-request function in infra/site.yml
// maps /privacy and /privacy/ to that file so both URLs keep working.
export default defineConfig({
  site: 'https://parksafeapp.com',
  build: {
    format: 'directory',
  },
  integrations: [preact()],
  vite: {
    plugins: [devApi(env)],
    worker: { format: 'es' },
  },
});
