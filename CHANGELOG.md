# Changelog

## 0.1.0 (Unreleased)

glide v2 is a rewrite as a plain web app.

- Runs in the browser: one Markdown file in, a slideshow out. `run(md, opts)` for use as a library.
- CLI: `glide slide.md` serves the deck with live reload; `glide build -o out slide.md` writes static HTML (`index.html`, `glide.js`, `assets/`).
- GPU transitions on [VFX-JS](https://github.com/fand/vfx-js) with HTML-in-Canvas: `crossfade`, `swipe`, `zoom`, `zoom_blur`, `glitch_slide`, `glitch`, `datamosh`, `pixelsort`, `none`. Moving back plays the transition in reverse.
- Custom GLSL transitions from files listed under `transitions:` in the frontmatter.
- Interactive slides: slide `<script>`s run on mount, with `Glide.onUnmount()` for cleanup. Video, iframes, canvases (2D, WebGL, p5.js, three.js), forms and Web Components work; content the GPU stage cannot capture is shown as plain DOM.
- Themes (Catppuccin and the v1 color pairs), layouts (`normal`, `center`, `two-column`), header items, page counter, keyboard / click / touch navigation, fullscreen (`f`), key help (`?`).
- Requirements: Node.js 20+ for the CLI. GPU transitions need Chrome with `chrome://flags/#canvas-draw-element`; other browsers use a slower fallback, and `--no-gpu` turns transitions off.

### Breaking

- The v1 Electron app (macOS only) is removed.
- One Markdown file per deck, slides split on `---`, instead of one file per page.
- Per-page frontmatter `transition` / `theme` / `duration` is now per-slide directives: `<!-- transition: swipe -->`, `<!-- theme: red_white -->`, `<!-- duration: 1 -->`.
