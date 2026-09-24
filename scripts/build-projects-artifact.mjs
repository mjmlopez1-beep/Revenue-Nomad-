// Builds the Projects prototype as a static page for a claude.ai artifact:
//   dist-artifact/index.html  page with inlined CSS, React 18 from cdnjs
//   dist-artifact/app.js      the app bundle (seed data included)
//   dist-artifact/photos/     operator photos
// Usage: npm run build:artifact
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const out = "dist-artifact";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// React comes from the cdnjs UMD globals, not the bundle.
const globals = { react: "window.React", "react-dom/client": "window.ReactDOM", "react-dom": "window.ReactDOM" };
const globalsPlugin = {
  name: "umd-globals",
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client)?$/ }, (a) => ({ path: a.path, namespace: "umd" }));
    b.onLoad({ filter: /.*/, namespace: "umd" }, (a) => ({ contents: `module.exports = ${globals[a.path]};`, loader: "js" }));
  },
};

await build({
  entryPoints: ["projects/artifact/entry.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "transform",
  jsxFactory: "window.React.createElement",
  jsxFragment: "window.React.Fragment",
  outfile: `${out}/app.js`,
  plugins: [globalsPlugin],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

const css = readFileSync("projects/styles.css", "utf8");
const html = `<title>Revenue Nomad Projects</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
${css}
body { margin: 0; background: var(--canvas); color: var(--ink); }
</style>
<div id="root"><p style="padding:24px;font-family:system-ui">Loading Revenue Nomad Projects…</p></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="app.js"></script>
`;
writeFileSync(`${out}/index.html`, html);
cpSync("public/rnp/photos", `${out}/photos`, { recursive: true });
console.log(`Built ${out}/ (app.js ${(readFileSync(`${out}/app.js`).length / 1024).toFixed(0)} KB)`);
