// Prints the tight content bounds of an SVG in its own user units by rendering on a padded canvas.
const sharp = require('sharp'); const fs = require('fs');
(async () => {
  for (const f of process.argv.slice(2)) {
    let s = fs.readFileSync(f, 'utf8');
    const vb = /viewBox="([^"]+)"/.exec(s)[1].split(/\s+/).map(Number);
    const pad = 200, k = 4; // 4 px per unit
    const nvb = [vb[0] - pad, vb[1] - pad, vb[2] + 2 * pad, vb[3] + 2 * pad];
    s = s.replace(/viewBox="[^"]+"/, `viewBox="${nvb.join(' ')}" width="${nvb[2] * k}" height="${nvb[3] * k}"`);
    const { info } = await sharp(Buffer.from(s)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const x = nvb[0] - info.trimOffsetLeft / k, y = nvb[1] - info.trimOffsetTop / k;
    console.log(f, 'viewBox', vb.join(' '), '-> content', [x, y, info.width / k, info.height / k].map((v) => +v.toFixed(1)).join(' '));
  }
})();
