export { run, DEFAULT_THEME } from "./deck.ts";
export type {
  RunOpts,
  Deck,
  Direction,
  SwapContext,
  SwapHandler,
  ChangeDetail,
} from "./deck.ts";
export { parse } from "./parse.ts";
export type { ParsedDeck, Slide } from "./parse.ts";
export { DEFAULT_TRANSITION, DEFAULT_DURATION } from "./frontmatter.ts";
export type {
  Frontmatter,
  HeaderItem,
  Layout,
  Transition,
} from "./frontmatter.ts";
export { registerTransition } from "./transitions/index.ts";
export type { TransitionDef, TransitionRun, TransitionUniforms } from "./transitions/index.ts";
