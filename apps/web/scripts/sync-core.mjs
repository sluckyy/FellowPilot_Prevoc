// Copy the dependency-free core library (packages/core/src) into the app as src/lib/core,
// so Next.js compiles it like app code. Generated: do not edit src/lib/core by hand.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '../../../packages/core/src');
const to = join(here, '../src/lib/core');

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
let n = 0;
for (const f of readdirSync(from)) {
  if (!f.endsWith('.ts')) continue; // skips the cli/ folder
  const src = readFileSync(join(from, f), 'utf8').replace(/from '(\.\/[^']+)\.js'/g, "from '$1'");
  writeFileSync(join(to, f), `// GENERATED from packages/core/src/${f} by scripts/sync-core.mjs — edit the original.\n${src}`);
  n++;
}
console.log(`synced ${n} core files`);
