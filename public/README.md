# Brand assets

Official HelpBnk marks, rebuilt as vector from the Brand Guidelines (Sept 2026).
The guideline PDF is raster-only, so the three-Y icon was fitted to the artwork
and the wordmark is "HelpBnk" set in Inter SemiBold, converted to outlines.

| File | Use |
| --- | --- |
| `brand/helpbnk-logo.svg` | Full lockup, black type. White and light surfaces. |
| `brand/helpbnk-logo-on-dark.svg` | Lockup, white type, gradient icon. Black surfaces. |
| `brand/helpbnk-logo-white.svg` | All-white lockup. Blue and gradient surfaces. |
| `brand/helpbnk-icon.svg` | Icon only, gradient. |
| `brand/helpbnk-icon-white.svg` | Icon only, white. |
| `helpbnk.png` | Original raster export; superseded by the SVGs above. |

The app itself does not load these files. `components/ui/Brandmark.tsx` draws
the same geometry inline from `lib/brand-marks.ts`, so participant pages make
no extra request. Favicons live in `app/` (`icon.svg`, `favicon.ico`,
`apple-icon.png`) per the Next.js metadata file conventions and use the
guideline's blue tile with a white icon.

Paths are exposed via `lib/brand.ts → brand.logo` for emails, print, and
anything else that needs a URL.
