<img align="center" src="/build/glide_banner_for_readme.png"/>


# GLIDE

Markdown slideshow with GPU transitions.

*NOTE: v2 is a rewrite as a plain web app. GPU transitions come in the next phase.*

## Install

```
$ npm i -g @fand/glide
```

Requires Node.js 20+.

## Usage

```
$ glide slide.md                 # dev server with live reload (opens the browser)
$ glide build -o out slide.md    # static HTML in ./out
```

Options:

- `-p, --port <n>`: dev server port (default `3000`)
- `--host`: listen on all interfaces
- `--no-open`: do not open the browser
- `-t, --theme <name>`: theme (beats the frontmatter)
- `-o, --out <dir>`: build output dir (default `./out`)
- `--export <dir>`: same as `glide build -o <dir>`

The build output is self-contained (`index.html`, `glide.js`, `assets/`) and works from `file://`.

### As a library

```js
import { run } from "@fand/glide";

const md = await fetch("./slide.md").then((r) => r.text());
const deck = run(md, { theme: "mocha", baseUrl: "./" });
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
- Frontmatter keys: `title`, `theme`, `transition`, `duration` (seconds), `layout`, `css` (extra stylesheet, relative to the md), `header` (items shown at the top right).
- Per-slide directives at the top of a slide: `<!-- transition: NAME ARGS -->`, `<!-- duration: N -->`, `<!-- layout: ... -->`, `<!-- theme: ... -->`, `<!-- live -->`. They override the frontmatter.
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
- `#N` in the URL opens slide N

## Transitions

Transitions are parsed but not rendered yet; they come in the next phase.
They will use HTML-in-Canvas, which needs Chrome with `chrome://flags/#canvas-draw-element` enabled. Other browsers get a fallback.

## Development

```
$ npm install
$ npm run dev        # runtime dev server with examples/demo.md
$ npm run build
$ npm test
```

## LICENSE

MIT
