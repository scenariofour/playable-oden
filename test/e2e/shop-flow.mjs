// End-to-end check of the whole shop with real clicks and taps: pick oden from the warmer, undo, several bowls, edit and
// remove in the cart, and a demo checkout for pickup, local delivery and shipping. Optional: it needs Playwright, which
// the project doesn't install. With Google Chrome installed:
//
//   npm i --no-save playwright-core
//   npm run dev                                    (in another terminal)
//   node test/e2e/shop-flow.mjs desktop            (or: portrait)
//
// BASE_URL defaults to http://127.0.0.1:8080/. Screenshots go to test-results/ (git-ignored).
// DIRECT=1 lets the browser load everything itself (for example when testing the deployed site).
// The browser's CDN requests are fetched by Node and handed to the page, so the run doesn't depend on the headless
// browser having its own network access.
const { chromium } = await import('playwright-core').catch(() => import('playwright')).catch(() => {
  console.error('This check needs Playwright: npm i --no-save playwright-core'); process.exit(2);
});
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dev = process.argv[2] || 'desktop', BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/', OUT = `test-results/${dev}`;
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
let failed = 0;
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.CHANNEL || 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(DEV[dev]);
const errs = [];
const open = async (q = '') => {
  const page = await ctx.newPage();
  if (!process.env.DIRECT) await page.route(/^https:\/\//, async (r) => {
    const url = r.request().url();
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36' } });
      await r.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' } });
    } catch { // Node's TLS doesn't use the system certificate store; curl does (useful behind TLS-inspecting networks)
      try {
        const body = execFileSync('curl', ['-sfL', '--max-time', '30', url], { maxBuffer: 64 << 20 });
        const type = /\.js(\?|$)/.test(url) ? 'text/javascript' : /css/.test(url) ? 'text/css' : /woff2/.test(url) ? 'font/woff2' : 'application/octet-stream';
        await r.fulfill({ status: 200, body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
      } catch { await r.abort(); }
    }
  });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(new URL(q, BASE).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__oden, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return page;
};

let page = await open();
const st = () => page.evaluate(() => window.__oden.state);
const idle = () => page.waitForFunction(() => !window.__oden.state.busy, null, { timeout: 20000 });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const tap = async (k, inBowl = false) => {
  const p = await page.evaluate(([k, b]) => window.__oden.screen(k, b), [k, inBowl]);
  if (!p) return console.log('no piece', k);
  if (dev === 'portrait') await page.touchscreen.tap(p[0], p[1]); else await page.mouse.click(p[0], p[1]);
};
const press = async (sel) => (dev === 'portrait' ? page.tap(sel) : page.click(sel));
const pick = async (ks) => { for (const k of ks) { await tap(k); await page.waitForTimeout(140); await idle(); } };
const bowl = async (ks) => { await pick(ks); await press('#done'); await idle(); };
const summary = () => page.evaluate(() => [...document.querySelectorAll(window.innerWidth < 621 ? '.ck-sum-m .ck-rows > div' : '.ck-side .ck-rows > div')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()));
const placeAndWait = async () => { await press('#ck-place'); await page.waitForTimeout(1100); };

// ---- the station: layout, picking, undo ----
const slipBox = await page.locator('#slip').boundingBox(), vp = page.viewportSize();
assert(dev === 'portrait' ? slipBox.y > vp.height * 0.5 && slipBox.width > vp.width * 0.9 : slipBox.x > vp.width * 0.6, `${dev} layout: order slip as a ${dev === 'portrait' ? 'bottom sheet' : 'ticket on the right'}`);
assert((await page.textContent('#hint')).includes('Tap any oden'), 'first-visit hint is shown');
let s = await st();
assert(s.pieces > 20 && s.count === 0 && !s.busy, `warmer is stocked (${s.pieces} pieces), bowl empty`);
await pick(['daikon', 'egg']);
s = await st(); assert(s.count === 2 && s.total === 210 && s.bowl.length === 2, 'two picks land in the bowl: daikon + egg = ¥210');
await shot('01-picked');
if (dev === 'portrait') { await press('.slip-head'); await page.waitForTimeout(300); } // on phones Undo lives in the opened sheet
await press('#undo'); await idle();
s = await st(); assert(s.count === 1 && s.total === 100, 'Undo puts the egg back');
await press('#done'); await idle();
s = await st(); assert(s.cart.length === 1 && s.cart[0].thumb && s.count === 0 && s.bowlNo === 2, 'Add to cart: bowl 1 in the cart with a picture of the real bowl, a fresh bowl 2 on the counter');

// ---- several bowls, edit, remove ----
await bowl(['daikon', 'egg', 'tsumire', 'egg']); await bowl(['konnyaku', 'kinchaku']);
s = await st(); assert(s.cart.length === 3 && s.cart.reduce((n, b) => n + b.total, 0) === 780, `three bowls in the cart, ¥780 (${s.cart.map((b) => b.total)})`);
await press('#cartBtn'); await page.waitForTimeout(350); await shot('02-cart');
assert((await page.textContent('#c-total')) === '¥780' && (await page.textContent('#cart-foot')).includes('calculated at checkout'), 'cart subtotal ¥780, fees at checkout');
await press('#cart [data-remove="bowl-1"]'); await page.waitForTimeout(200);
s = await st(); assert(s.cart.length === 2 && !s.cart.some((b) => b.id === 'bowl-1'), 'Remove takes bowl 1 out of the cart');
await press('#cart [data-edit="bowl-3"]'); await page.waitForTimeout(300);
s = await st(); assert(s.count === 2 && s.cart.length === 1, 'Edit puts bowl 3 back on the counter with its two pieces');
await tap('chikuwa'); await idle(); await press('#done'); await idle();
s = await st(); assert(s.cart[1].id === 'bowl-3' && s.cart[1].total === 330, 'edited bowl 3 back in the cart, keeping its number, ¥330');

// ---- checkout: pickup ----
await press('#cartBtn'); await page.waitForTimeout(300); await press('#to-checkout'); await page.waitForTimeout(400);
const methods = await page.$$eval('input[name="method"]', (l) => l.map((i) => i.value));
assert(methods.join() === 'pickup,delivery', 'hot oden: only pickup and local delivery offered (' + methods + ')');
await shot('03-checkout');
const sim = await page.textContent('#checkout');
assert(sim.includes('Simulated checkout.') && sim.includes('No real orders, payments, delivery services or merchant systems are connected') && (await page.textContent('#ck-place')).includes('Place simulated order'), 'checkout is labelled as a simulation');
await placeAndWait();
const shown = await page.$$eval('.err', (l) => l.map((e) => e.textContent).filter(Boolean));
assert(shown.includes('Enter your name') && shown.includes('Enter an email for your confirmation') && !(await st()).lastOrder, 'empty contact blocks the order: ' + shown.join(' / '));
await press('[data-demo]'); await page.check('input[name="store"][value="river"]');
const rows = await summary(); assert(rows[1].includes('Pickup') && rows[1].includes('Free') && rows[2].includes('¥780'), 'pickup summary: ' + rows.join(' | '));
await placeAndWait(); s = await st();
assert(s.lastOrder && s.lastOrder.method === 'pickup' && s.lastOrder.total === 780 && s.lastOrder.fee === 0 && !s.lastOrder.charged && !s.lastOrder.sent && s.cart.length === 0, 'pickup demo order ' + JSON.stringify(s.lastOrder));
const doneText = await page.textContent('#ck-done');
assert(doneText.includes('Riverside') && doneText.includes('nothing was charged'), 'confirmation names the store and says nothing was charged');
await shot('04-confirmation');
await press('#ck-done [data-close]'); await page.waitForTimeout(300);

// ---- local delivery: minimum, area check, fee ----
await bowl(['daikon', 'egg', 'tsumire', 'kinchaku']); // ¥490
await press('#cartBtn'); await page.waitForTimeout(300); await press('#to-checkout'); await page.waitForTimeout(400);
await page.check('input[name="method"][value="delivery"]'); await page.waitForTimeout(100);
await page.fill('#f-postal', '100-0001');
assert((await page.textContent('[data-hint="postal"]')).includes('don’t deliver'), 'out-of-area postal code is flagged as you type');
await placeAndWait(); let e = await page.$$eval('.err', (l) => l.map((x) => x.textContent).filter(Boolean));
assert(e.some((x) => x.includes('outside our delivery area')) && e.some((x) => x.includes('at least ¥800')), 'delivery refused: ' + e.join(' / '));
await press('#ck-back'); await page.waitForTimeout(300); await press('#cart [data-close].sh-x'); await page.waitForTimeout(200);
await bowl(['chikuwa', 'konnyaku', 'daikon', 'egg']); // +¥390 → ¥880
await press('#cartBtn'); await page.waitForTimeout(300); await press('#to-checkout'); await page.waitForTimeout(400);
assert(await page.isChecked('input[name="method"][value="delivery"]') && (await page.inputValue('#f-postal')) === '100-0001', 'checkout remembers delivery and the address');
await page.fill('#f-postal', '153-0042');
let r2 = await summary(); assert(r2[1].includes('¥400') && r2[2].includes('¥1,280'), 'Meguro delivery fee ¥400, total ¥1,280: ' + r2.join(' | '));
assert(!(await page.$('input[name="payment"][value="store"]')), 'pay-at-store not offered for delivery');
await page.fill('#f-name', 'Test Customer'); await page.fill('#f-email', 'test@example.com'); await page.fill('#f-phone', '03-0000-0000'); await page.fill('#f-address', '4-5-6 Sample, Meguro-ku');
await placeAndWait(); s = await st();
assert(s.lastOrder.no === 'D-0002' && s.lastOrder.method === 'delivery' && s.lastOrder.fee === 400 && s.lastOrder.total === 1280 && !s.lastOrder.charged, 'delivery demo order ' + JSON.stringify(s.lastOrder));
await page.close();

// ---- chilled packs: shipping ----
page = await open('?merchant=chilled');
await bowl(['daikon', 'egg', 'tsumire']);
await press('#cartBtn'); await page.waitForTimeout(300); await press('#to-checkout'); await page.waitForTimeout(400);
const m2 = await page.$$eval('input[name="method"]', (l) => l.map((i) => i.value));
assert(m2.join() === 'pickup,delivery,shipping', 'chilled packs: pickup, delivery and shipping offered');
await page.check('input[name="method"][value="shipping"]'); await page.waitForTimeout(100);
await press('[data-demo]'); await page.fill('#f-postal', '900-0001');
await placeAndWait(); e = await page.$$eval('.err', (l) => l.map((x) => x.textContent).filter(Boolean));
assert(e.some((x) => x.includes('Okinawa')), 'shipping to an excluded region refused');
await page.fill('#f-postal', '060-0001'); await page.check('input[name="rate"][value="express"]'); await page.waitForTimeout(100);
const dates = await page.$$eval('#f-date option', (l) => l.map((o) => o.textContent)); await page.selectOption('#f-date', { index: 2 });
r2 = await summary(); assert(r2[1].includes('Shipping') && r2[1].includes('¥1,480') && r2[2].includes('¥1,820'), 'express shipping ¥1,480, total ¥1,820: ' + r2.join(' | '));
await shot('05-shipping');
await placeAndWait(); s = await st();
const done2 = await page.textContent('#ck-done');
assert(s.lastOrder.method === 'shipping' && s.lastOrder.fee === 1480 && done2.includes(dates[2]) && done2.includes('no parcel was arranged'), 'shipping demo order arrives ' + dates[2]);

assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
