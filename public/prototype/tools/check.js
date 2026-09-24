/* Headless smoke test: visits every route for every persona, reports console errors and
   horizontal overflow, and optionally saves screenshots.
   usage: node tools/check.js [--shots out/dir] [--width 1440] [--routes home,browse] [--personas visitor,buyer]
   Needs Playwright (global install) and Chromium. */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const shots = opt('shots', null);
const width = +opt('width', 1440);
const only = opt('routes', null);
const personas = (opt('personas', 'visitor,buyer,operator,admin')).split(',');
const theme = opt('theme', 'light');
const full = args.includes('--full');

(async () => {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(require('fs').existsSync(exe) ? { executablePath: exe } : {});
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  let failures = 0;
  for (const persona of personas) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|net::/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(url + '#home');
    await page.waitForTimeout(600);
    await page.evaluate(({ persona, theme }) => { RN.store.set('persona', persona); RN.store.set('theme', theme); RN.shell.applyTheme(); }, { persona, theme });
    const routes = await page.evaluate(() => {
      const out = [];
      for (const v of Object.values(RN.views)) {
        const t = v.tokens.map((tok) => {
          if (!tok.startsWith(':')) return tok;
          const k = tok.slice(1);
          const samples = (v.samples && v.samples[k]) || { slug: RN.model.ops[0].slug, id: 'demo', tab: 'overview', token: 'demo' }[k] || 'demo';
          return samples;
        });
        out.push(t.join('.'));
        if (v.samples && v.samples.extra) out.push(...v.samples.extra);
      }
      return out;
    });
    for (const r of routes) {
      if (only && !only.split(',').some((o) => r === o || r.startsWith(o + '.'))) continue;
      errors.length = 0;
      await page.evaluate((r) => { location.hash = '#' + r; }, r);
      await page.waitForTimeout(350);
      const info = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        view: document.querySelector('main') && document.querySelector('main').dataset.view,
        broke: !!document.querySelector('main .note b') && /Something broke/.test(document.querySelector('main').textContent),
        len: (document.querySelector('main') || {}).innerText ? document.querySelector('main').innerText.length : 0,
      }));
      const bad = errors.length || info.overflow || info.broke || info.len < 40;
      if (bad) failures++;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${persona.padEnd(8)} #${r.padEnd(28)} view=${info.view} text=${info.len}${info.overflow ? ' OVERFLOW-X' : ''}${info.broke ? ' RENDER-ERROR' : ''}`);
      errors.forEach((e) => console.log('       ' + e));
      if (shots) {
        const fs = require('fs'); fs.mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `${persona}_${r.replace(/[^\w.-]/g, '_')}_${width}.png`), fullPage: full });
      }
    }
    await page.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} problem(s)` : '\nAll routes clean');
  process.exit(failures ? 1 : 0);
})();
