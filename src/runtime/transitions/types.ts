import type { TransitionClass } from "@vfx-js/core";

/** Constructor params for a transition class. */
export type TransitionParams = Record<string, unknown>;

/** A named transition for frontmatter, e.g. `transition: pixelsort right`. */
export type TransitionDef = {
  name: string;
  /** Load the transition class. Built-ins load `@vfx-js/transitions` on first use. */
  load(): Promise<TransitionClass<any>>;
  /** Turn frontmatter args into constructor params. */
  parseArgs?(args: string[]): TransitionParams | undefined;
};
