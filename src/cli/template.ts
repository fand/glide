export type TemplateOpts = {
  md: string;
  title: string;
  theme?: string;
  baseUrl?: string;
  liveReload?: boolean;
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
export function renderHtml(opts: TemplateOpts): string {
  const runOpts: Record<string, string> = {};
  if (opts.theme) {
    runOpts.theme = opts.theme;
  }
  if (opts.baseUrl) {
    runOpts.baseUrl = opts.baseUrl;
  }
  const runOptsJs = JSON.stringify(runOpts).replace(/</g, "\\u003c");

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
