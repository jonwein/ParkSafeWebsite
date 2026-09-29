// Runs the CloudFront viewer-request function from infra/site.yml against sample requests.
// Usage: npm run test:edge
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const template = readFileSync(new URL('../infra/site.yml', import.meta.url), 'utf8').split('\n');
const start = template.findIndex((line) => line.trim() === 'FunctionCode: |');
assert.notEqual(start, -1, 'FunctionCode block not found in infra/site.yml');

// The block scalar runs until the first non-blank line indented no deeper than its key
const keyIndent = template[start].search(/\S/);
const body = [];
for (const line of template.slice(start + 1)) {
  if (line.trim() !== '' && line.search(/\S/) <= keyIndent) break;
  body.push(line);
}
const handler = new Function(`${body.join('\n')}\nreturn handler;`)();

function request(host, uri, querystring = {}) {
  return { request: { uri, querystring, headers: host ? { host: { value: host } } : {} } };
}

const rewrites = [
  ['/', '/index.html'],
  ['/privacy', '/privacy/index.html'],
  ['/privacy/', '/privacy/index.html'],
  ['/terms', '/terms/index.html'],
  ['/support/', '/support/index.html'],
  ['/app-ads.txt', '/app-ads.txt'],
  ['/404.html', '/404.html'],
  ['/_astro/page.A1b2C3.css', '/_astro/page.A1b2C3.css'],
];
for (const [uri, expected] of rewrites) {
  assert.equal(handler(request('parksafeapp.com', uri)).uri, expected, uri);
  // The *.cloudfront.net test domain is served the same way, without a redirect
  assert.equal(handler(request('d111111abcdef8.cloudfront.net', uri)).uri, expected, uri);
}

const redirect = handler(request('www.parksafeapp.com', '/privacy'));
assert.equal(redirect.statusCode, 301);
assert.equal(redirect.headers.location.value, 'https://parksafeapp.com/privacy');

const withQuery = handler(
  request('www.parksafeapp.com', '/', {
    utm_source: { value: 'ios' },
    tag: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b' }] },
    flag: { value: '' },
  }),
);
assert.equal(withQuery.headers.location.value, 'https://parksafeapp.com/?utm_source=ios&tag=a&tag=b&flag');

assert.equal(handler(request(undefined, '/terms')).uri, '/terms/index.html', 'missing Host header');

console.log(`viewer-request: ${rewrites.length * 2 + 3} checks passed`);
