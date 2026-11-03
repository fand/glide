# TODO

## Before merging v2

- [ ] Pick a new name. "glide" clashes with Glide.js. Rename the package, CLI command, README and repo together.
- [ ] Merge PR #1 (`v2` → `main`). CI passes.

## Features

- [ ] Speaker notes syntax (e.g. everything after `<!-- notes -->` in a slide).
- [ ] Presenter view: `/presenter` with the next slide, notes and a timer, kept in sync with the main window (`BroadcastChannel`).
- [ ] Transitions over `file://`: inline assets as data URLs in `glide build` (e.g. `--inline`).
- [ ] PDF export (optional).

## Quality

- [ ] e2e test: drive a demo deck in headless Chrome (HTML-in-Canvas flag on) and check for blank frames, one-frame blinks and console errors. Reuse the CDP screencast + brightness scripts used during development; keep them under `test/e2e/`.
- [ ] Run the CLI on Windows (`start` to open the browser, paths).

## Known issues

- [ ] In the fallback (no HTML-in-Canvas), a cross-origin iframe shows the slide background mid-transition instead of black. dom-to-canvas drops the iframe; a placeholder element during capture would fix it.
- [ ] When leaving a parked slide, an animated canvas or video freezes on the still copy for about 130 ms before the transition starts.

## Watch

- [ ] The HTML-in-Canvas origin trial runs through Chrome 160. Expect more API changes (Chrome 159 already needs `content="drawable"`).
- [ ] crbug.com/540532973 (nested canvas drawn at the wrong size). When it is fixed, check whether vfx-js can stop redrawing nested canvases. The second bug (a nested canvas clipped to a box at the element's origin) is not reported upstream.
