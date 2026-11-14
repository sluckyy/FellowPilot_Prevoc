// Assemble the App Service package: Next's standalone server plus static files, as release.zip
// with server.js at the root (App Service runs `node server.js`).
import { cpSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(app, '.next/standalone');
if (!existsSync(join(standalone, 'server.js'))) throw new Error('Run `npm run build` first');

cpSync(join(app, '.next/static'), join(standalone, '.next/static'), { recursive: true });
cpSync(join(app, 'public'), join(standalone, 'public'), { recursive: true });

const zip = join(app, 'release.zip');
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: standalone, stdio: 'inherit' });
console.log(`wrote ${zip}`);
