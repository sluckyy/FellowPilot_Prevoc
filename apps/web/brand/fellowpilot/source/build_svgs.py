"""Builds the FellowPilot brand SVG set from the designer's files: unclipped logos, a standalone emblem,
an app icon with safe-zone padding, and a simplified favicon that survives 16 px."""
import re, sys
OUT = sys.argv[1]
H = open('out/logo-horizontal.svg').read(); S = open('out/logo-stacked.svg').read()
EM = re.search(r'<g id="emblem">.*?\n</g>', H, re.S).group(0)
EB = (36.3, -32.3, 533.8, 429.0)  # emblem content bounds, measured
P = 'xmlns="http://www.w3.org/2000/svg"'

def fit(svg, box, pad):
    x, y, w, h = box
    vb = f'{x - pad:g} {y - pad:g} {w + 2 * pad:g} {h + 2 * pad:g}'
    return re.sub(r'viewBox="[^"]+"', f'viewBox="{vb}"', svg, count=1)

open(f'{OUT}/logo-horizontal.svg', 'w').write(fit(H, (34, -30.3, 1147.5, 403.3), 16))
open(f'{OUT}/logo-stacked.svg', 'w').write(fit(S, (70, -29.3, 760, 711.8), 16))
open(f'{OUT}/emblem.svg', 'w').write(f'<svg {P} viewBox="{EB[0]-8:g} {EB[1]-8:g} {EB[2]+16:g} {EB[3]+16:g}" role="img" aria-label="FellowPilot">{EM}</svg>')

def placed(size, frac):
    """Transform that centres the emblem in a size x size square at frac of its width."""
    s = size * frac / max(EB[2], EB[3]); cx = EB[0] + EB[2] / 2; cy = EB[1] + EB[3] / 2
    return f'translate({size/2:g} {size/2:g}) scale({s:.4f}) translate({-cx:g} {-cy:g})'

# Rounded white tile, as in the designer's app icon, with the emblem inside a comfortable margin.
open(f'{OUT}/app-icon.svg', 'w').write(
    f'<svg {P} viewBox="0 0 512 512" role="img" aria-label="FellowPilot"><rect width="512" height="512" rx="105" fill="#ffffff"/>'
    f'<g transform="{placed(512, 0.78)}">{EM}</g></svg>')
# Full-bleed square for maskable (Android) and Apple icons: the OS applies its own mask; emblem stays in the safe zone.
open(f'{OUT}/app-icon-full.svg', 'w').write(
    f'<svg {P} viewBox="0 0 512 512"><rect width="512" height="512" fill="#ffffff"/>'
    f'<g transform="{placed(512, 0.66)}">{EM}</g></svg>')

# Favicon: purple tile; stethoscope and pulse in white so they don't vanish into the tile; fewer, bolder leaves; no thin layers.
leaf = 'M0 0 C-26 -19 -36 -55 -10 -90 C13 -72 31 -34 0 0Z'
leaves = ''.join(f'<path transform="translate({x} {y}) rotate({r}) scale(1.35)" d="{leaf}" fill="{c}"/>' for x, y, r, c in [
    (196, 92, -30, '#F0B323'), (322, 70, 22, '#F0B323'), (408, 122, 49, '#C99BBD'), (150, 170, -65, '#C99BBD')])
fav = (f'<svg {P} viewBox="0 0 128 128" role="img" aria-label="FellowPilot"><rect width="128" height="128" rx="26" fill="#732E4A"/>'
       f'<g transform="translate(64 66) scale(0.215) translate(-300 -215)">{leaves}'
       '<path d="M262 105 C226 103 222 150 239 179 C255 207 284 219 297 243 C307 259 303 290 300 307 C298 327 318 333 336 318 L350 310 L363 335 L380 261 L399 322 C422 292 449 290 483 309" fill="none" stroke="#ffffff" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/>'
       '<path d="M338 105 C374 103 378 150 361 179 C345 207 316 219 303 243" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round"/>'
       '<circle cx="262" cy="105" r="24" fill="#ffffff"/><circle cx="338" cy="105" r="24" fill="#ffffff"/>'
       '<path d="M470 322 A42 42 0 0 1 554 322" stroke="#F0B323" stroke-width="24" fill="none"/>'
       '<path d="M60 372 Q150 318 250 352 Q320 374 380 356 Q470 330 560 372 Q470 360 380 386 Q300 404 230 384 Q140 356 60 372Z" fill="#ffffff"/>'
       '</g></svg>')
open(f'{OUT}/favicon.svg', 'w').write(fav)
