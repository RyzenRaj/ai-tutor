// Builds dist-demo/ai-visual-tutor.html: a single-file, server-less demo of the app
// (demo mode only — no API key, no model calls). React loads from cdnjs.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "dist-demo");
mkdirSync(out, { recursive: true });

const REACT = "18.3.1";

// 1) CSS via the Tailwind CLI
execFileSync(
  process.execPath,
  [path.join(root, "node_modules/@tailwindcss/cli/dist/index.mjs"), "-i", "static-demo/styles.css", "-o", "dist-demo/app.css", "--minify"],
  { cwd: root, stdio: "inherit" },
);
const css = readFileSync(path.join(out, "app.css"), "utf8");

// 2) JS: bundle the app, with react / react-dom mapped to their UMD globals
const globals = {
  name: "umd-globals",
  setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "g" }));
    b.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: "react-dom", namespace: "g" }));
    b.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: path.join(root, "static-demo/jsx-runtime-shim.js") }));
    b.onLoad({ filter: /.*/, namespace: "g" }, (a) => ({
      contents: a.path === "react" ? "module.exports = globalThis.React" : "module.exports = globalThis.ReactDOM",
      loader: "js",
    }));
  },
};
const result = await build({
  entryPoints: [path.join(root, "static-demo/main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  write: false,
  alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [globals],
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// 3) Handwriting font inlined (cdn font hosts other than Google Fonts are blocked)
const font = (w) => readFileSync(path.join(root, `src/app/fonts/caveat-latin-${w}-normal.woff2`)).toString("base64");
const fontCss = [500, 700]
  .map((w) => `@font-face{font-family:"Caveat";font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${font(w)}) format("woff2")}`)
  .join("");

const html = `<title>AI Visual Tutor</title>
<style>${fontCss}</style>
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT}/umd/react.production.min.js" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT}/umd/react-dom.production.min.js" crossorigin="anonymous"></script>
<script>${js}</script>
`;
writeFileSync(path.join(out, "ai-visual-tutor.html"), html);
console.log(`dist-demo/ai-visual-tutor.html  ${(html.length / 1024).toFixed(0)} KB (css ${(css.length / 1024).toFixed(0)} KB, js ${(js.length / 1024).toFixed(0)} KB)`);
