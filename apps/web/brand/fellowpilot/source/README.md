# Logo sources

`FellowPilot_*.svg` are the designer's originals (25 Oct 2026). The files one level up are built from them by
`build_svgs.py`, because the originals need three fixes before an app can use them:

1. **Text as live type.** The wordmark and taglines are `<text>` set in Nunito Sans, which most devices don't have,
   so they'd fall back to Arial. `outline.py` converts them to outlines using Nunito Sans (SIL Open Font License,
   from github.com/google/fonts, `ofl/nunitosans`), so the logo looks the same everywhere.
2. **Cropped leaves.** The horizontal and stacked logos' viewBox cuts off the top ~30 units of the leaves.
   The rebuilt files use the measured content bounds (`bbox.js`) plus a small margin.
3. **Icons.** In the supplied favicon, the purple stethoscope and hills sit on a purple tile and disappear, leaving
   the leaves and a yellow arc that read as a frowning face. `favicon.svg` is a simplified mark (white stethoscope,
   four bolder leaves, one hill) that holds up at 16 px. `app-icon.svg` centres the emblem with a margin, and
   `app-icon-full.svg` keeps it inside the safe zone Android and iOS crop to.
4. **Purple.** The originals use #780039; the style guide's purple is #732E4A, which Sam confirmed is official
   (25 Oct 2026). The built files are recoloured to #732E4A (`sed -i 's/#780039/#732E4A/gI' *.svg`).

To rebuild after new artwork arrives (run from a scratch folder, with Nunito Sans's two variable .ttf files):

    python3 outline.py <nunito-dir> FellowPilot_Horizontal.svg out/logo-horizontal.svg
    python3 outline.py <nunito-dir> FellowPilot_Primary_Stacked.svg out/logo-stacked.svg
    node bbox.js out/logo-horizontal.svg out/logo-stacked.svg     # update the bounds in build_svgs.py if they changed
    python3 build_svgs.py <output-folder>
