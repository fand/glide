<img align="center" src="https://raw.githubusercontent.com/fand/glide/main/build/glide_banner_for_readme.png"/>


# GLIDE

Markdown slideshow with GPU transitions.

*NOTE: v2 is a rewrite as a plain web app.*

## Install

```
$ npm i -g @fand/glide
```

Requirements:

- Node.js 20+ for the CLI.
- Browser: GPU transitions need Chrome 156+ with `chrome://flags/#canvas-draw-element` enabled (Chrome 159 also hit-tests slide content; on 156 enable `chrome://flags/#enable-experimental-web-platform-features` for that). Other browsers use a slower fallback; `--no-gpu` turns transitions off.

## Usage

```
$ glide slide.md                 # dev server with live reload (opens the browser)
$ glide build -o out slide.md    # static HTML in ./out
```

Options:

- `-p, --port <n>`: dev server port (default `3000`)
- `--host`: listen on all interfaces
- `--no-open`: do not open the browser
- `--no-gpu`: turn off WebGL transitions
- `-t, --theme <name>`: theme (beats the frontmatter)
- `-o, --out <dir>`: build output dir (default `./out`)
- `--export <dir>`: same as `glide build -o <dir>`

The build output is self-contained (`index.html`, `glide.js`, `assets/`). It copies local files that the slides load (`img`, `video`, `audio`, `source`, `track`, `script`, `iframe`, `link`, `embed`, `object`, markdown images) into `assets/`. A copied HTML page (iframe) keeps its own relative links, so those files must be referenced from the markdown too or kept next to it by hand.
It opens from `file://`, but without transitions (browsers treat each local file as cross-origin, so the canvas capture drops images). Serve the folder over http to get transitions.

### As a library

```js
import { run } from "@fand/glide";

const md = await fetch("./slide.md").then((r) => r.text());
const deck = run(md, { theme: "mocha", baseUrl: "./", transitions: true });
deck.next();
```

## Markdown

```md
---
title: My talk
theme: mocha
transition: crossfade
duration: 0.5
layout: normal
css: ./style.css
header:
  - Kyoto.js
  - [GitHub](https://github.com/fand/glide)
---

# First slide

---
<!-- transition: swipe left -->
<!-- duration: 1 -->
<!-- layout: center -->
<!-- theme: red_white -->

# Second slide

---
<!-- layout: two-column -->

## Left

|||

## Right
```

- Slides split on `---` lines (ignored inside code fences).
- Frontmatter keys: `title`, `theme`, `transition`, `duration` (seconds), `layout`, `css` (extra stylesheet, relative to the md), `header` (items shown at the top right), `transitions` (custom shaders, see [Custom transitions](#custom-transitions)).
- Per-slide directives at the top of a slide: `<!-- transition: NAME ARGS -->`, `<!-- duration: N -->`, `<!-- layout: ... -->`, `<!-- theme: ... -->`, `<!-- live -->`, `<!-- gpu: false -->`. They override the frontmatter.
- `|||` splits a `two-column` slide into left and right.
- Raw HTML works, e.g. `<img src="cat.gif" class="center w-60">`. Utility classes: `center`, `w-20` `w-30` `w-40` `w-60` `w-70` `w-80` `w-100`.

### Layouts

`normal` (default), `center`, `two-column`.

### Themes

- Catppuccin: `mocha` (default), `macchiato`, `frappe`, `latte`
- glide v1 colors: `red_white`, `red_black`, `blue_white`, `blue_black`, `yellow_white`, `yellow_black`, `green_white`, `green_black`, `black_white`, `black_red`

### Navigation

- Next: `→` `l` `Space` `PageDown`, or click the right side
- Prev: `←` `h` `PageUp`, or click the left side
- `Home` / `End`
- Scroll a slide taller than the screen: `↓` `j` / `↑` `k`, or the mouse wheel
- `#N` in the URL opens slide N
- Touch: swipe left / right to go forward / back; tap the right / left side like a click. A vertical swipe scrolls a tall slide. A touch that moves more than 10 px is not a tap.
- `f`: fullscreen (`Esc` exits)
- `?`: show the keys; any key or click closes it
- Clicks on links, form controls, `canvas`, `video`, `audio`, `iframe`, `summary`, `label`, elements with `tabindex`, and anything inside `[data-glide-interactive]` do not turn the page, by click, tap or swipe. Neither does a drag (text selection, slider).
- Keys go to a focused text field, slider or select, and `Space` / `Enter` to a focused button or link. Press `Esc` to give the keys back to the deck. Inside `[data-glide-interactive]`, the deck ignores all keys.

## Interactive slides

Every slide is plain HTML, so it can hold video, iframes, canvases, forms and its own `<script>`. See [`examples/demo2.md`](examples/demo2.md).

### Scripts

glide runs a slide's `<script>` tags each time the slide mounts (the slide's DOM is rebuilt every time), in document order:

- Inline scripts run on every mount. Classic ones are wrapped in a `{ }` block, so top-level `let` / `const` do not clash with the last mount. `function` declarations inside them are not global; assign to `window` if you need a global.
- External scripts (`<script src>`) load once per page and are skipped on later mounts. Put per-mount code inline.
- A classic script waits for the external scripts above it, so `<script src="p5.js">` then an inline script works. Module scripts (`type="module"`) run when they are ready.

Find your slide and clean up when it leaves:

```html
<canvas id="c"></canvas>
<script>
  const slide = Glide.currentSlide();          // the <section> being mounted
  const ctx = slide.querySelector("#c").getContext("2d");
  let raf = requestAnimationFrame(function loop() { /* draw */ raf = requestAnimationFrame(loop); });
  Glide.onUnmount(() => cancelAnimationFrame(raf));   // stop loops, p5.remove(), loseContext(), ...
</script>
```

`Glide.currentSlide()` and `Glide.onUnmount()` work in classic and module scripts. With the npm package, import `currentSlide` and `onUnmount` instead. The section also fires `glide:mount` (after its scripts start) and `glide:unmount` (before it is removed). With a transition, the old slide is unmounted after its last frame has been captured.

### What the GPU stage can show

Transitions work on a capture of the slide. glide re-captures every frame while the slide has `video`, `canvas`, `iframe`, a GIF, SMIL, a running CSS animation, or right after user input. Each capture costs one full-screen texture upload per frame. Set `<!-- live: false -->` to stop that, or `<!-- live -->` to force it.

Some content cannot be shown live in the GPU stage. glide then **parks** the slide: it takes part in transitions like any other slide, and while idle it is moved out of the stage into a plain-DOM layer above it, where it plays and takes input normally. Before the next transition it moves back, one capture lands, and the transition starts from it; a still copy of the slide covers the screen for those few frames. The move keeps the element itself (`moveBefore()`), so iframes do not reload, and video, typed text and scroll positions carry over. Parked slides are not re-captured while idle.

- cross-origin iframes (YouTube, ...): captured blank, so they show black during the transition;
- without HTML-in-Canvas (the fallback): also video, canvases, iframes, GIFs, SMIL, scripts and interactive content, since dom-to-canvas cannot draw them or loses their state (typed text, scroll position). Their transitions use the dom-to-canvas capture, so those parts may look blank mid-transition;
- if the browser does not send clicks into HTML-in-Canvas (Chrome 156 without `chrome://flags/#enable-experimental-web-platform-features`; Chrome 159 hit-tests without it): slides with form controls, iframes, audio, `<canvas>`, `<script>`, `[onclick]` or `[data-glide-interactive]`. Canvases and scripts are included because glide can't tell which ones listen for the pointer.

Canvases (2D, WebGL, p5.js, three.js) stay in the GPU stage. Chrome draws a nested canvas at the wrong size or clips it; vfx-js detects that and redraws each canvas over the capture at its layout size. Elements stacked above a canvas are hidden by that redraw.

Override per slide: `<!-- gpu: false -->` keeps the slide in the plain-DOM layer the whole time (transitions into and out of it are cuts); `<!-- gpu: true -->` keeps it in the GPU stage even while idle.

## Transitions

Transitions run in WebGL on [VFX-JS](https://github.com/fand/vfx-js) with HTML-in-Canvas.
HTML-in-Canvas needs Chrome with `chrome://flags/#canvas-draw-element` enabled.
Other browsers use a slower fallback (dom-to-canvas), where animated GIFs and videos do not move.

Set them per deck (frontmatter) or per slide (directive). A slide's transition plays when you move to it; moving back plays it in reverse.

| Name | Aliases | Description |
| --- | --- | --- |
| `crossfade` (default) | `fade` | Fades the old slide into the new one. |
| `swipe` | `slide` | Slides the new slide in. Arg `left` (default), `right`, `up`, `down` is the way the content moves: `swipe left` moves the old slide out to the left and brings the new one in from the right. |
| `zoom` | | The old slide shrinks into the center while the new one grows out of it. |
| `zoom_blur` | `zoom-blur` | Crossfade with a radial blur and RGB split that peaks halfway. |
| `crosszoom` | `cross-zoom` | Crossfade through a zoom blur toward the center that peaks halfway. |
| `glitch_slide` | `glitch-slide` | Rows slide sideways with RGB split; the slide swaps halfway. |
| `glitch` | | Jittery RGB-split offsets; the slide swaps halfway. |
| `datamosh` | | Hard cut through a datamosh: the old slide's blocks smear into the new one, hold for 25% of `duration`, then heal block by block. Arg: block size in px (default `32`). |
| `pixelsort` | | The old slide melts into sorted pixel streaks, and the new one sorts back out. Arg `up` (default), `down`, `left`, `right`: the sort direction. |
| `none` | | No animation. |

Unknown names fall back to `crossfade`. `duration` is in seconds (default `0.5`).

Moving content is re-captured every frame automatically; see [What the GPU stage can show](#what-the-gpu-stage-can-show).

### Custom transitions

Ship your own shaders next to the markdown and name them in the frontmatter:

```yaml
---
transitions:
  wipe: ./wipe.frag
  burn: ./shaders/burn.glsl
---
```

Then use them like built-ins: `<!-- transition: wipe -->`. A custom name hides a built-in of the same name. Custom transitions take no args (glide warns if you pass some).

A shader file is a GLSL ES 3.0 body that defines `vec4 transition(vec2 uv, float t)`:

- `uv` is 0..1 over the slide, origin at the bottom left.
- `t` goes 0 → 1, already eased. Moving back plays it in reverse for you (old and new swap roles), so write only the forward animation.
- Read the slides with `readFrom(uv)` (old) and `readTo(uv)` (new). Reads are premultiplied alpha. Reads outside 0..1 return transparent black; `inRange(uv)` tells you if a point is inside.
- Uniforms you can use: `t`, `reverse`, `resolution` (px), `time` (s). Do not declare your own uniforms; nothing sets them.
- Do not write `#version` or `precision`; glide adds them and refuses a shader that has `#version`.
- Return the output color, premultiplied. Transparent areas show the page behind the deck.

`examples/wipe.frag`:

```glsl
// Diagonal wipe with a soft edge, from the bottom-left corner.
const float EDGE = 0.1;

vec4 transition(vec2 uv, float t) {
  // 0 at the bottom-left corner, 1 at the top-right.
  float d = (uv.x + uv.y) * 0.5;
  // Move the edge from just before 0 to just past 1, so both ends are clean.
  float p = t * (1.0 + 2.0 * EDGE) - EDGE;
  float m = smoothstep(p - EDGE, p + EDGE, d);
  return mix(readTo(uv), readFrom(uv), m);
}
```

The CLI reads the files (they must be inside the markdown's folder) and puts them in the page, so `glide build` output needs no extra files. Edits reload in `glide slide.md`. With the library, pass the sources yourself: `run(md, { shaders: { wipe: src } })`, or call `registerTransition({ name, load, parseArgs })` to add one for every deck. `load` returns a [VFX-JS transition class](https://github.com/fand/vfx-js/blob/main/docs/TRANSITION.md), e.g. a `ShaderTransition` subclass or a preset from `@vfx-js/transitions`.

If a shader fails to compile, glide logs the error to the console and cuts straight to the next slide.

## Development

```
$ pnpm install
$ pnpm start [file.md]  # build, then serve with the CLI (default: examples/demo.md)
$ pnpm dev            # Vite dev server on src/runtime (no CLI)
$ pnpm build
$ pnpm test
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Release steps: [RELEASING.md](RELEASING.md).

## LICENSE

MIT
