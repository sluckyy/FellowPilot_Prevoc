// Builds the app's branding from brand/<BRAND>/brand.json (default: fellowpilot).
//
// Writes (all generated, not committed):
//   src/brand/generated/brand.ts     name, wording, logo sizes, email colours
//   src/brand/generated/fonts.ts     next/font loaders for the brand fonts
//   src/app/brand.css                colour and font tokens, light and dark
//   public/brand/*                   logo files
//   public/icons/*                   app, home-screen and browser-tab icons
//   public/manifest.webmanifest      installed-app name and colours
//
// Every text colour is checked against WCAG 2.2 contrast (4.5:1 body text, 3:1 large text and
// focus rings). Colours are nudged lighter or darker until they pass; if one can't be made to pass,
// the build stops with a message saying which role failed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const brandName = process.env.BRAND || 'fellowpilot';
const brandDir = join(app, 'brand', brandName);
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };

// ------------------------------------------------------------------ load
function stripComments(x) {
  if (Array.isArray(x)) return x.map(stripComments);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, stripComments(v)]));
  return x;
}
if (!existsSync(join(brandDir, 'brand.json'))) throw new Error(`No brand at brand/${brandName}/brand.json`);
const brand = stripComments(JSON.parse(readFileSync(join(brandDir, 'brand.json'), 'utf8')));
for (const k of ['name', 'shortName', 'palette', 'roles', 'fonts', 'logos']) if (!brand[k]) throw new Error(`brand.json is missing "${k}"`);

// ------------------------------------------------------------------ colour maths
const HEX = /^#[0-9a-f]{6}$/i;
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
function luminance(h) {
  return hexToRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
/** Moves a colour towards black (on light backgrounds) or white (on dark) until it reaches the ratio. */
function ensure(color, bg, ratio, role) {
  const towards = luminance(bg) > 0.4 ? '#000000' : '#ffffff';
  let c = color;
  for (let t = 0; t <= 1.0001 && contrast(c, bg) < ratio; t += 0.02) c = mix(color, towards, t);
  if (contrast(c, bg) < ratio) throw new Error(`Brand colour for "${role}" can't reach ${ratio}:1 contrast on ${bg}`);
  return c;
}

const resolve = (v, what) => {
  const hex = HEX.test(v) ? v : brand.palette[v];
  if (!hex || !HEX.test(hex)) throw new Error(`${what}: "${v}" is not a palette name or #rrggbb colour`);
  return hex.toLowerCase();
};
const R = Object.fromEntries(Object.entries(brand.roles).map(([k, v]) => [k, resolve(v, `roles.${k}`)]));
for (const k of ['primary', 'heading', 'highlight', 'secondary', 'accent', 'neutral', 'correct', 'wrong', 'warning']) {
  if (!R[k]) throw new Error(`brand.json roles is missing "${k}"`);
}
const WHITE = '#ffffff', BLACK = '#000000';

function theme(dark) {
  const t = {};
  if (!dark) {
    t.paper = mix(R.neutral, WHITE, 0.82);
    t.surface = WHITE;
    t.line = mix(R.neutral, WHITE, 0.3);
    t.ink = ensure(mix(R.primary, BLACK, 0.72), t.paper, 12, 'ink');
  } else {
    t.paper = mix(R.primary, BLACK, 0.86);
    t.surface = mix(R.primary, BLACK, 0.8);
    t.line = mix(R.primary, BLACK, 0.62);
    t.ink = ensure(mix(R.neutral, WHITE, 0.75), t.paper, 12, 'ink');
  }
  const soft = (c, k) => (dark ? mix(c, t.paper, k) : mix(c, WHITE, k));
  t.muted = ensure(mix(t.ink, t.paper, 0.38), t.paper, 4.5, 'muted');
  t.primary = ensure(dark ? mix(R.primary, WHITE, 0.45) : R.primary, t.paper, 4.5, 'primary');
  t['primary-soft'] = soft(t.primary, dark ? 0.8 : 0.9);
  t['on-primary'] = contrast(WHITE, t.primary) >= 4.5 ? WHITE : t.paper;
  if (contrast(t['on-primary'], t.primary) < 4.5) throw new Error('No readable text colour on the primary colour');
  t.heading = ensure(dark ? mix(R.heading, WHITE, 0.5) : R.heading, t.paper, 4.5, 'heading');
  t.highlight = ensure(dark ? mix(R.highlight, WHITE, 0.2) : R.highlight, t.paper, 3, 'highlight');
  t.secondary = ensure(R.secondary, t.paper, 4.5, 'secondary');
  t.accent = R.accent;                                   // fills only: never text (style guide)
  t['accent-soft'] = soft(R.accent, dark ? 0.75 : 0.82);
  for (const k of ['correct', 'wrong', 'warning']) {
    t[`${k}-soft`] = soft(R[k], dark ? 0.8 : 0.88);
    t[k] = ensure(dark ? mix(R[k], WHITE, 0.35) : R[k], t[`${k}-soft`], 4.5, k);
  }
  t.focus = ensure(R.secondary, t.paper, 3, 'focus');
  // Report the pairs that matter.
  const checks = [['ink', 'paper', 4.5], ['ink', 'surface', 4.5], ['muted', 'paper', 4.5], ['muted', 'surface', 4.5],
    ['primary', 'paper', 4.5], ['primary', 'surface', 4.5], ['on-primary', 'primary', 4.5], ['heading', 'paper', 4.5],
    ['ink', 'primary-soft', 4.5], ['correct', 'correct-soft', 4.5], ['wrong', 'wrong-soft', 4.5], ['warning', 'warning-soft', 4.5],
    ['ink', 'accent-soft', 4.5], ['focus', 'paper', 3]];
  const report = checks.map(([a, b, min]) => ({ pair: `${a} on ${b}`, ratio: contrast(t[a], t[b]), min }));
  const fails = report.filter((r) => r.ratio < r.min);
  if (fails.length) throw new Error(`Contrast too low (${dark ? 'dark' : 'light'}): ${fails.map((f) => `${f.pair} ${f.ratio.toFixed(2)}`).join(', ')}`);
  return { tokens: t, report };
}
const light = theme(false), darkT = theme(true);
for (const [label, th] of [['light', light], ['dark', darkT]]) {
  log(`${label}: ` + th.report.map((r) => `${r.pair} ${r.ratio.toFixed(1)}`).join(' | '));
}

// ------------------------------------------------------------------ fonts
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const families = new Map();   // key -> { kind, family, weights:Set, files, varName, cssVar }
const roleVar = {};
for (const role of ['heading', 'body', 'reading']) {
  const f = brand.fonts[role] ?? brand.fonts.body;
  if (!f) throw new Error(`fonts.${role} is missing`);
  const key = f.google ? `g:${f.google}` : `l:${JSON.stringify(f.local)}`;
  if (!families.has(key)) {
    const name = f.google ?? (f.family || `${brandName}-${role}`);
    families.set(key, { kind: f.google ? 'google' : 'local', family: name, weights: new Set(), files: f.local ?? [],
      ident: 'f' + families.size, cssVar: `--font-${slug(name)}` });
  }
  const fam = families.get(key);
  (f.weights ?? []).forEach((w) => fam.weights.add(String(w)));
  roleVar[role] = fam.cssVar;
}
const genDir = join(app, 'src/brand/generated');
rmSync(genDir, { recursive: true, force: true });
mkdirSync(join(genDir, 'fonts'), { recursive: true });
const fontLines = ['// GENERATED by scripts/apply-brand.mjs from brand/' + brandName + '/brand.json. Do not edit.'];
const googleImports = [...families.values()].filter((f) => f.kind === 'google').map((f) => f.family.replace(/ /g, '_'));
if (googleImports.length) fontLines.push(`import { ${[...new Set(googleImports)].join(', ')} } from 'next/font/google';`);
if ([...families.values()].some((f) => f.kind === 'local')) fontLines.push(`import localFont from 'next/font/local';`);
for (const f of families.values()) {
  if (f.kind === 'google') {
    const weights = [...f.weights].sort();
    fontLines.push(`const ${f.ident} = ${f.family.replace(/ /g, '_')}({ subsets: ['latin'], ${weights.length ? `weight: ${JSON.stringify(weights)}, ` : ''}variable: '${f.cssVar}', display: 'swap' });`);
  } else {
    const src = f.files.map((x) => {
      copyFileSync(join(brandDir, x.file), join(genDir, 'fonts', x.file.split('/').pop()));
      return `{ path: './fonts/${x.file.split('/').pop()}', weight: '${x.weight ?? '400'}', style: '${x.style ?? 'normal'}' }`;
    });
    fontLines.push(`const ${f.ident} = localFont({ src: [${src.join(', ')}], variable: '${f.cssVar}', display: 'swap' });`);
  }
}
fontLines.push(`export const fontClassName = [${[...families.values()].map((f) => `${f.ident}.variable`).join(', ')}].join(' ');`);
writeFileSync(join(genDir, 'fonts.ts'), fontLines.join('\n') + '\n');

// ------------------------------------------------------------------ CSS tokens
const block = (t) => Object.entries(t).map(([k, v]) => `  --${k}: ${v};`).join('\n');
const fallback = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const css = `/* GENERATED by scripts/apply-brand.mjs from brand/${brandName}/brand.json. Do not edit; change the brand file. */
:root {
${block(light.tokens)}
  --font-heading: var(${roleVar.heading}), ${fallback};
  --font-body: var(${roleVar.body}), ${fallback};
  --font-reading: var(${roleVar.reading}), ${fallback};
  --logo-plate: transparent;
}
@media (prefers-color-scheme: dark) {
  :root {
${block(darkT.tokens).replace(/^/gm, '  ')}
    --logo-plate: ${brand.logos.plateOnDark === false ? 'transparent' : '#ffffff'};
    color-scheme: dark;
  }
}
`;
writeFileSync(join(app, 'src/app/brand.css'), css);

// ------------------------------------------------------------------ logos, icons, manifest
const require = createRequire(import.meta.url);
let sharp = null;
try { sharp = require('sharp'); } catch { /* optional locally; installed in CI */ }

const pub = join(app, 'public');
rmSync(join(pub, 'brand'), { recursive: true, force: true });
mkdirSync(join(pub, 'brand'), { recursive: true });
mkdirSync(join(pub, 'icons'), { recursive: true });
const logos = {};
for (const [k, v] of Object.entries(brand.logos)) {
  if (typeof v !== 'object' || !v.file) continue;
  const src = join(brandDir, v.file);
  if (!existsSync(src)) throw new Error(`Logo file missing: brand/${brandName}/${v.file}`);
  copyFileSync(src, join(pub, 'brand', v.file));
  const size = imageSize(src);
  logos[k] = { src: `/brand/${v.file}`, width: size.width, height: size.height, minWidth: v.minWidth ?? null };
}
if (!logos.emblem) throw new Error('logos.emblem is required (used for app icons)');

/** Pixel size of a PNG, or the viewBox size of an SVG. */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  const vb = /viewBox="([^"]+)"/.exec(b.toString('utf8'));
  if (file.endsWith('.svg') && vb) { const [, , w, h] = vb[1].trim().split(/[\s,]+/).map(Number); return { width: Math.round(w), height: Math.round(h) }; }
  throw new Error(`${file}: logos must be PNG or SVG with a viewBox`);
}

// Icons come from dedicated artwork when the brand has it (icons.app / icons.full / icons.favicon),
// otherwise from the emblem placed on a tile.
const iconSrc = Object.fromEntries(Object.entries(brand.icons ?? {}).map(([k, f]) => {
  const p = join(brandDir, f);
  if (!existsSync(p)) throw new Error(`Icon file missing: brand/${brandName}/${f}`);
  return [k, p];
}));
const icon = { background: '#ffffff', padding: 0.12, maskablePadding: 0.22, ...(brand.icon ?? {}) };
let faviconSvg = null;
if (sharp) {
  const emblem = join(brandDir, brand.logos.emblem.file);
  const render = (file, size) => sharp(file, { density: Math.max(72, Math.ceil((72 * size) / 64)) }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const tile = async (size, pad, radius, out) => {
    const inner = Math.round(size * (1 - 2 * pad));
    const img = await render(emblem, inner).png().toBuffer();
    const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius * size}" fill="${icon.background}"/></svg>`);
    await sharp(bg).composite([{ input: img, gravity: 'center' }]).png({ compressionLevel: 9 }).toFile(join(pub, 'icons', out));
  };
  const make = async (kind, size, out, fallback) => {
    if (iconSrc[kind]) await render(iconSrc[kind], size).png({ compressionLevel: 9 }).toFile(join(pub, 'icons', out));
    else await fallback();
  };
  await make('app', 512, 'icon-512.png', () => tile(512, icon.padding, 0.2, 'icon-512.png'));
  await make('app', 192, 'icon-192.png', () => tile(192, icon.padding, 0.2, 'icon-192.png'));
  await make('full', 512, 'icon-maskable-512.png', () => tile(512, icon.maskablePadding, 0, 'icon-maskable-512.png'));
  await make('full', 180, 'apple-touch-icon.png', () => tile(180, icon.padding, 0, 'apple-touch-icon.png'));
  await make('favicon', 48, 'favicon-48.png', () => tile(48, 0.04, 0.18, 'favicon-48.png'));
  await make('favicon', 32, 'favicon-32.png', () => tile(32, 0.02, 0.18, 'favicon-32.png'));
} else if (!existsSync(join(pub, 'icons', 'icon-512.png'))) {
  throw new Error('sharp is needed to make the app icons the first time (npm install)');
} else {
  log('sharp not installed: keeping existing icons');
}
if (iconSrc.favicon?.endsWith('.svg')) { copyFileSync(iconSrc.favicon, join(pub, 'icons', 'favicon.svg')); faviconSvg = '/icons/favicon.svg'; }

writeFileSync(join(pub, 'manifest.webmanifest'), JSON.stringify({
  name: brand.name, short_name: brand.shortName, description: brand.productLine ?? brand.descriptor ?? '',
  start_url: '/', scope: '/', display: 'standalone', lang: 'en-AU',
  background_color: light.tokens.paper, theme_color: light.tokens.primary,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');

// ------------------------------------------------------------------ brand.ts
const wordmark = (brand.wordmark?.parts ?? [{ text: brand.name, color: 'primary' }]).map((p) => {
  const base = resolve(R[p.color] ? R[p.color] : p.color, `wordmark color "${p.color}"`);
  return { text: p.text, light: ensure(base, light.tokens.paper, 3, `wordmark "${p.text}"`), dark: ensure(mix(base, WHITE, 0.45), darkT.tokens.paper, 3, `wordmark "${p.text}" (dark)`) };
});
const out = {
  key: brandName, name: brand.name, shortName: brand.shortName, tagline: brand.tagline ?? '', descriptor: brand.descriptor ?? '',
  pillars: brand.pillars ?? [], productLine: brand.productLine ?? '', wordmark, logos, faviconSvg,
  themeColor: { light: light.tokens.paper, dark: darkT.tokens.paper },
  email: { primary: light.tokens.primary, onPrimary: light.tokens['on-primary'], ink: light.tokens.ink, muted: light.tokens.muted, heading: light.tokens.heading },
};
writeFileSync(join(genDir, 'brand.ts'),
  `// GENERATED by scripts/apply-brand.mjs from brand/${brandName}/brand.json. Do not edit.\nexport const BRAND = ${JSON.stringify(out, null, 2)} as const;\n`);
log(`brand "${brand.name}" applied (${brandName})`);
