// Copies the iOS app's restriction fixtures into this repo. Run after regenerating them in the
// iOS repo (Tools/RestrictionFixtures/generate.sh). Usage: npm run sync:fixtures
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const iosRepo = resolve(process.env.PARKSAFE_IOS_REPO ?? '../ParkSafe');
const source = resolve(iosRepo, 'Tools/RestrictionFixtures/restriction-cases.json');
const target = new URL('../src/lib/restrictions/fixtures/restriction-cases.json', import.meta.url);

copyFileSync(source, target);
console.log(`Copied ${source}`);
