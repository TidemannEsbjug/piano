# Resonance Piano Tuner — marketing site

A hand-written static site: no framework, no build step, no third-party requests, no cookies.
Everything the page needs is in this folder.

```
index.html            the page: loader → hero + CTA → the film → why → how → iPhone · iPad · Mac → live instruments → maths → FAQ → CTA
privacy.html          privacy policy (true to what the app does: no network, clips saved locally)
support.html          getting started, signal tips, shortcuts, sending us a session
404.html
css/base.css          design tokens (mirror App/Theme.swift), type, nav, buttons, App Store badge, footer
css/intro.css         the loader — a 1:1 port of App/Views/Shell/IntroView.swift
css/film.css          the film frame, player, chapters, docked mini-player
css/page.css          hero and page sections
css/components/*.css  one file per live instrument
js/intro.js           loader timeline (the app's timings ÷ 1.5)
js/film.js            film player, chapters, "Watch this part", docking, the plucked string
js/main.js            entrance, nav, reveals, sticky CTA, mounting the instruments
js/components/*.js    tuner (also the iPhone-sized copy in #devices, data-phone) · partials · wizard · curve · survey · unison
assets/video          intro-loader.{mp4,webm}, intro-loader-sm.mp4, explainer.mp4 + .chapters.vtt + .captions.vtt
assets/img            posters, icon
assets/fonts          Instrument Serif, Nunito (OFL, self-hosted; Nunito is only the fallback for ui-rounded)
_dev/                 dev server + per-component harness pages   (do not deploy)
_fragments/           source fragments that were inlined into index.html   (do not deploy)
```

## Run it

```bash
node _dev/serve.js        # http://127.0.0.1:8766/
```

Use this rather than `python3 -m http.server`: video seeking (chapters, "Watch this part") needs HTTP
Range requests, which Python's server does not implement. Any real host does.

Useful URLs: `/?intro=1` forces the loader, `/?intro=0` suppresses it. Normally it plays once per tab
session and never on deep links (`/#faq`).

## Swap in the real film

The player is wired to a stand-in (the app's 11-second intro). Replace four files, keep the names:

| File | What |
|---|---|
| `assets/video/explainer.mp4` | H.264 + AAC, `-movflags +faststart`. 1080p is plenty. |
| `assets/img/film-poster.webp` **and** `.jpg` | 16:9 poster frame. The player and the final CTA use the WebP; the JPEG is the social card (`og:image`) and the `<picture>` fallback. Replace both. |
| `assets/video/explainer.chapters.vtt` | Chapter cues. **Keep the cue ids** `why`, `measure`, `curve`, `tune`, `unisons` — the "Watch this part" links in the page seek to them. Change times and titles freely; add more chapters if you like. |
| `assets/video/explainer.captions.vtt` | Captions. The CC button hides itself if this track is missing. |

Durations, chapter ticks on the scrubber, the chapter rail under the frame and the timestamps on the
"Watch this part" pills all read from the video and the VTT — nothing else to edit. The label on the
big play button ("See how Resonance tunes a piano") is in `index.html`.

Re-encode example:

```bash
ffmpeg -i film-master.mov -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart assets/video/explainer.mp4
```

## The loader

`js/intro.js` holds the app's own timings (`IntroView.swift`) and one constant, `SPEED = 1.5`; every
delay and fade is the app's value divided by it, and `assets/video/intro-loader.*` is `Intro.mp4`
re-encoded at the same factor (no audio — browsers only autoplay muted video). About 9 s instead of
the app's 14. To change the pace, change `SPEED` and re-encode with the same number:

```bash
ffmpeg -i ../App/Resources/Intro.mp4 -an -vf "setpts=PTS/1.5,fps=24" -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart assets/video/intro-loader.mp4
ffmpeg -i ../App/Resources/Intro.mp4 -an -vf "setpts=PTS/1.5,fps=24,scale=854:-2" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart assets/video/intro-loader-sm.mp4
ffmpeg -i ../App/Resources/Intro.mp4 -an -vf "setpts=PTS/1.5,fps=24" -c:v libvpx-vp9 -crf 36 -b:v 0 assets/video/intro-loader.webm
```

Skips with click, Esc, Space, Return (as in the app), plus scroll or swipe. With Reduce Motion,
Save-Data, blocked autoplay or a stalled download it falls back to the app's still: poster + wordmark.

## Placeholders to replace before launch

| What | Where | Now |
|---|---|---|
| App Store links | `data-appstore="ios"` (App Store, iPhone + iPad, mock `id6752103381`) and `data-appstore="mac"` (Mac App Store, mock `id6752103374?mt=12`) in `index.html`, `privacy.html`, `support.html`, the JSON-LD block, and the `storeUrls` map in `js/main.js` (the nav's "Get the app" goes to the visitor's own store). If the app ships as one universal purchase, point both at the same listing. | mock ids |
| Support address | `support@resonancetuner.example` | placeholder domain |
| Site origin | `sitemap.xml`, `robots.txt`, the `<link rel="canonical">` in `index.html`, `privacy.html`, `support.html`; make `og:image` an absolute URL once the domain exists | `https://resonancetuner.example/` |
| The film | see "Swap in the real film" above | 11-second stand-in (the app intro); chapter times are made up |
| Copyright line | footers | "© 2026 Resonance Piano Tuner" |

No price, ratings, reviews or endorsements appear anywhere on the site, on purpose: none exist yet.

## Copy rules the site follows

Positioning (owner, 2026-09-22): **tune your own piano when a tuner can't come, with the same science professional tuners work with.** The hero says it once, lightly: "Nothing replaces a good piano tuner, but when one can't come…". The owner does not want a whole section about tuners. Never frame it as replacing tuners or as a jab at their cost. The iPhone runs the whole tuning; never describe it as a lite or "quick glance" version. Be honest about the rest: it takes a lever, mutes, patience and practice; the app doesn't turn pins or teach lever technique; a technician still does repairs and regulation. Voice: plain and natural, short sentences, contractions are fine, no hype, no price or savings figures.

Every claim was checked against the code (not just SPEC.md). Keep to these when editing:

- "Sound never leaves your device" — not "never recorded": accepted strikes are saved as short clips in the session.
- Accuracy: "reads to a tenth of a cent"; figures are "verified on synthetic test signals". Never "accurate to 0.1 cent on your piano".
- Platforms: iPhone and iPad with iOS/iPadOS 18 or later, Mac with macOS 15 or later (do not say "Apple silicon only"). No chime, no reference tones, no CLI, piano only, English only.
- Mac-only views: the Curve charts, the Unison panel's numbers, the strobe, the tuning plan, keyboard shortcuts, the Input check card. iPhone/iPad Advanced mode adds only the spectrum (and trims). Say "on the Mac" when mentioning them.
- No sync: each device keeps its own sessions (no iCloud, no account). No Bluetooth microphones (the iOS audio session allows none).
- iPhone/iPad data: sessions and logs are in the Files app (On My iPhone › Resonance); Settings › Data has Export session, Share log and Copy diagnostic data (these are user-facing on iOS, developer-only on the Mac).
- The app opens in Simple mode. The strobe, spectrum, partial/B chips, unison numbers, tuning plan, the Input check card and the felt-strip choice are Advanced mode: say so when you mention them.
- Mac diagnostics (⌘⇧C, ⌘⇧R, the Diagnostics view, Copy full log, Reveal log folder) are developer-only: the site must not document them. The Mac's user-facing route is Tuner › Export session folder (zip)….
- Overpull "aims" / "estimates"; it does not "land exactly". The caps (+30¢, +15¢ wound) do not "prevent" breakage.
- The live instruments run on illustrative, synthetic values and say so.

## Deploy

Upload everything except `_dev/` and `_fragments/` to any static host. Serve `404.html` for unknown paths,
and long-cache `assets/` if your host allows it.
