export type TemplateOpts = {
  md: string;
  title: string;
  theme?: string;
  baseUrl?: string;
  liveReload?: boolean;
  /** false turns off WebGL transitions. */
  transitions?: boolean;
  /** Custom transition shaders: name -> GLSL source. */
  shaders?: Record<string, string>;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * `</script` and `<!--` would break out of the raw-text script element.
 * Add one backslash after `<` (plus any backslashes already there) so the
 * page can undo it exactly with UNESCAPE_JS.
 */
export function escapeScriptText(s: string): string {
  return s.replace(/<(\\*)(\/script|!--)/gi, "<$1\\$2");
}

export function unescapeScriptText(s: string): string {
  return s.replace(/<(\\*)\\(\/script|!--)/gi, "<$1$2");
}

const UNESCAPE_JS = String.raw`.replace(/<(\\*)\\(\/script|!--)/gi, "<$1$2")`;

const RELOAD_JS = `new EventSource("/__events").onmessage = () => location.reload();`;

/**
 * The runtime loads as a classic script (IIFE build exposing `Glide`):
 * Chrome blocks module scripts on file://, and the export must open from disk.
 */
/**
 * JSON for an inline script. `<` becomes `\u003c`, so `</script` and `<!--`
 * inside strings (e.g. shader source) cannot end the element.
 */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function renderHtml(opts: TemplateOpts): string {
  const runOpts: Record<string, unknown> = {};
  if (opts.theme) {
    runOpts.theme = opts.theme;
  }
  if (opts.baseUrl) {
    runOpts.baseUrl = opts.baseUrl;
  }
  if (opts.transitions === false) {
    runOpts.transitions = false;
  }
  if (opts.shaders && Object.keys(opts.shaders).length > 0) {
    runOpts.shaders = opts.shaders;
  }
  const runOptsJs = serializeForScript(runOpts);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(opts.title)}</title>
    <style>
      html, body { margin: 0; background: #1e1e2e; }
    </style>
  </head>
  <body>
    <script type="text/markdown" id="glide-md">${escapeScriptText(opts.md)}</script>
    <script src="./glide.js"></script>
    <script>
      window.glide = Glide.run(
        document.getElementById("glide-md").textContent${UNESCAPE_JS},
        ${runOptsJs},
      );
    </script>${opts.liveReload ? `\n    <script>${RELOAD_JS}</script>` : ""}
  </body>
</html>
`;
}
