# HTML template

Status: planned (2026-11-26). Not started.

Let users supply their own HTML page for `serve` / `build` / `pdf`.
Use cases: meta tags (OGP, favicon, fonts, analytics), deck-wide scripts
(fec2026 bg-noise), and later a page where the deck sits in one column.

## Survey (2026-11-26)

- Marp CLI: `--template` picks only built-ins (`bespoke`, `bare`). No custom HTML.
  Meta from front-matter: `title` `description` `author` `keywords` `url` `image`.
- Slidev (v53.1): root `index.html` is merged. Its head goes at the end of head,
  its body after the app entry script. No placeholders. Headmatter has `htmlAttrs`
  and `seoMeta` (og / twitter tags). `global-top.vue` / `global-bottom.vue`, `setup/main.ts`.
- reveal-md: `--template` replaces the whole page; `--scripts` / `--css`.
  Archived 2026-09-21.
- Quarto revealjs: `include-in-header` / `include-before-body` / `include-after-body`
  (file or inline `text:`), `template`, `template-partials` (title / toc slide only).

## Spec

Front-matter: `template: ./page.html` (relative to the md).

The template is a full HTML page with two placeholders. Both are required.

- `<meta name="glide">` in `<head>`: replaced by glide's head
  (viewport, `<title>`, base style, meta from front-matter).
  - Skip `<title>` if the template has one.
- `<div id="glide-root"></div>` in `<body>`: the deck mounts here (`run({ root })`).
  glide's scripts (md, `glide.js`, `Glide.run`, live reload) go right after it,
  so template scripts after the div run once `#glide` exists.
- Missing placeholder: `serve` / `build` / `pdf` fail with an error naming it.
- `<html lang>`: template value wins; if absent, use front-matter `lang`.
- `build`: copy local files the template loads (`src` / `href`), same rules as media.
- Template scripts also run in print mode (`?print`). A script can check
  `html.glide-print` to skip.

Example:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="glide">
    <link rel="icon" href="./favicon.png">
  </head>
  <body>
    <div id="glide-root"></div>
    <script src="./styles/bg-noise.js"></script>
  </body>
</html>
```

## Out of scope (later)

- Deck in a non-fullscreen container (multi-column page). Runtime is fullscreen-only now:
  `position: fixed` / `100vh` in `slide.css`, `window.innerWidth` click zones and
  window-wide keys in `deck.ts`.
- Front-matter meta keys (`description`, `url`, `image`, twitter card). Separate commit.
  Skip a generated meta if the template already has the same one.

## Checklist

- [ ] `template` key in frontmatter
- [ ] Template merge in `src/cli/template.ts` (placeholder check, lang, title)
- [ ] `serve` / `build` / `pdf` read the template; `serve` reloads when it changes
- [ ] `build` copies template assets
- [ ] Tests: merge, missing placeholder error, build copy
- [ ] README
- [ ] Try with fec2026 (bg-noise via template)
