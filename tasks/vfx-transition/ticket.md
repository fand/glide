# Move slide transitions to vfx.addTransition

Status: migrated on @vfx-js/core 1.6.0 + @vfx-js/transitions 0.1.2. Open items below.

Decided on the vfx-js side on 2026-11-03 (fand/vfx-js PR #220).
Guide: `docs/TRANSITION.md` in the vfx-js repo.

## What changed in glide

- `src/runtime/stage.ts` uses `vfx.addTransition(stage, { keepWrapped: true })` and `run(cb, spec)`.
  The stage is plain DOM until the first run wraps it; `onWrapped()` then runs the hit-test probe
  and works out which slides park.
- Removed glide's own `TransitionEffect`, GLSL prelude, `nextPaint`, `ensureFx` / `driverFx` / `active`,
  and the 9 transition files. Presets come from `@vfx-js/transitions`, loaded on first use.
- `TransitionDef` is now `{ name, load(), parseArgs? }`. `load()` returns a VFX-JS transition class.
  `parseArgs` turns frontmatter args into constructor params (`swipe right` → `{ direction: "right" }`).
- Custom `.frag` shaders become `ShaderTransition` subclasses. Compile errors are reported by core.
- `deck.ts` uses `isHicCanvas` from core.
- Dropped `@vfx-js/effects` as a direct dependency.

## API notes (1.6.0, differs from the first plan)

- Transitions are classes (`TransitionClass`), passed as `{ transition: Class, params }`.
- Presets are in the separate package `@vfx-js/transitions`, not `@vfx-js/effects/transitions`.
- `show(slide)` exists for containers whose slides are all in the DOM. glide builds slides on the fly, so it uses `run`.
- `waitFor: "media"` waits up to about 300 ms. It does not watch CSS `background-image`.
- Output keeps alpha (premultiplied). Transparent areas show what is behind the deck.

## Checklist

- [x] Bump @vfx-js/core, add @vfx-js/transitions
- [x] Rewrite `stage.ts` swap handler on `addTransition` + `run()`
- [x] Map registry names / args to presets
- [x] Hit test via `isHicCanvas`
- [x] Drop `nextPaint`, `ensureFx`, `driverFx`, `active`
- [x] Custom transitions on `ShaderTransition`
- [x] Update tests
- [x] demo2 forward / back with pixelsort in Chrome with HIC: no errors
- [ ] Check transparent areas with swipe / zoom (deck background shows through)
- [ ] Check parking in a browser without hit testing (interactive slides, cross-origin iframes)
- [ ] Check the dom-to-canvas fallback (no HIC)
- [ ] Check `examples/demo.md` with every built-in and `examples/wipe.frag`
- [ ] Startup: first run now also wraps the stage, so the first transition may start later
