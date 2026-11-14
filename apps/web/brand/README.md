# Brand

Everything that makes the app look like FellowPilot comes from one file: `brand/fellowpilot/brand.json`,
plus the logo images next to it. Nothing in the app's code names the product or hard-codes a colour.

`scripts/apply-brand.mjs` runs automatically before every `dev`, `build` and `typecheck`. It reads the
brand file and generates:

| Generated file | What it holds |
| --- | --- |
| `src/app/brand.css` | Colour tokens for light and dark mode, font stacks, logo plate |
| `src/brand/generated/brand.ts` | Name, tagline, wordmark colours, logo sizes, email colours |
| `src/brand/generated/fonts.ts` | Font loading (Google Fonts or local font files) |
| `public/brand/*`, `public/icons/*` | Logos, app icons, favicons (rendered with sharp) |
| `public/manifest.webmanifest` | Installed-app name, colours and icons |

These are not committed; they are rebuilt from the brand file each time.

## Common changes

- **Colours**: edit `palette` (the brand's named colours) or `roles` (which colour does which job:
  `primary` for buttons and links, `heading`, `accent` for fills such as progress bars, `correct`/`wrong`
  for marking). Light and dark versions are derived automatically, and the build **fails** if any text
  colour would fall below WCAG AA contrast, so a palette change can't quietly make the app unreadable.
- **Logo or app icon**: replace the SVG (or PNG) files in `brand/fellowpilot/` and keep the names in `logos` and
  `icons` pointing at them. Sizes are read from the files. `icons` can name separate artwork for the home-screen tile,
  the edge-to-edge Android/iOS icon and the browser-tab favicon; anything not named is made from the emblem.
  `source/` holds the designer's originals and the scripts that prepared them.
- **Name or wording**: `name`, `shortName`, `wordmark`, `tagline`, `pillars`, `productLine`.
- **Fonts**: `fonts.heading`, `fonts.body`, `fonts.reading`. Use `{"source": "google", "family": "Lexend"}`
  or, once licensed, `{"source": "local", "family": "Sofia Pro", "files": [{"path": "fonts/SofiaPro-Regular.woff2", "weight": "400"}, ...]}`
  with the font files placed in `brand/fellowpilot/fonts/`.

## A whole new brand

Copy `brand/fellowpilot/` to `brand/<new>/`, edit it, and set the `BRAND=<new>` environment variable for
the build (for example as a GitHub Actions variable). Run `npm run brand` locally to check contrast.

After changing icons or the manifest, bump `VERSION` in `public/sw.js` so installed copies of the app refresh.
