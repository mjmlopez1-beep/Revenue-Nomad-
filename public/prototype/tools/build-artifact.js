/* Bundles the prototype into dist/artifact.html for publishing as a claude.ai Artifact:
   - inlines every local stylesheet and script (the artifact CSP only allows own files, Google Fonts and a few CDNs)
   - drops the doctype/html/head/body wrappers (the artifact host adds its own skeleton) and keeps <title> first
   - lists the media files (photos, brand images, video) that must be published alongside
   usage: node tools/build-artifact.js  ->  dist/artifact.html + dist/files.json */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let html = read('index.html');

// Inline stylesheets
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, href) => `<style data-src="${href}">\n${read(href)}\n</style>`);
// Inline scripts (escape any closing script tags inside data)
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => `<script data-src="${src}">\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);

// Unwrap the document for the artifact skeleton
const title = (html.match(/<title>[\s\S]*?<\/title>/) || ['<title>Revenue Nomad</title>'])[0];
const head = (html.match(/<head>([\s\S]*?)<\/head>/) || [, ''])[1]
  .replace(/<meta charset[^>]*>/, '').replace(/<meta name="viewport"[^>]*>/, '').replace(/<title>[\s\S]*?<\/title>/, '')
  .replace(/<link rel="icon"[^>]*>/, '');
const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [, ''])[1];
const out = `${title}\n${head.trim()}\n${body.trim()}\n`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), out);

// Media to publish next to the page, keyed by published path
const files = {};
const walk = (dir) => fs.readdirSync(path.join(root, dir)).forEach((f) => {
  const rel = dir + '/' + f;
  if (fs.statSync(path.join(root, rel)).isDirectory()) return walk(rel);
  files[rel] = path.join(root, rel);
});
walk('assets');
fs.writeFileSync(path.join(root, 'dist', 'files.json'), JSON.stringify(files, null, 1));
const kb = (n) => Math.round(n / 1024) + ' KB';
console.log('dist/artifact.html', kb(Buffer.byteLength(out)), '| media files', Object.keys(files).length);
