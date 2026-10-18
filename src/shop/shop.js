// The shop around the station: a cart button with a count, the "added to cart" note, the cart drawer, and a plain
// one-page checkout (contact → pickup, local delivery or shipping → extras → payment → place) with the order summary
// beside it. Playful stays in the station; this part behaves like any food shop's website.
// It renders the cart it is given and reports what the customer does; main.js owns the cart, merchant.js says what
// the shop offers and checkout.js decides fees, times and what a valid order is. A demo: nothing is sent or charged.
import { icon, yen } from './ui.js';
import { cartTotals, availableMethods, METHOD_TITLES, deliveryZone, shippingBlocked, postalDigits, pickupTimes, deliveryWindows, shippingDates, quote, validateCheckout } from './checkout.js';

const BAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';
const X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const BACK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const sheet = matchMedia('(max-aspect-ratio: 4/5), (max-width: 620px)');
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DEMO_CONTACT = { name: 'Test Customer', email: 'test@example.com', phone: '03-0000-0000', postal: '150-0001', address: '1-2-3 Demo-cho, Shibuya-ku', address2: '' };

export function createShop({ merchant, onRemove, onEdit, onPlace }) {
  const stage = document.getElementById('stage');
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const cartBtn = el(`<button id="cartBtn" type="button" aria-haspopup="dialog">${BAG}<span class="cb-label">Cart</span><span class="cb-badge" hidden>0</span></button>`);
  const addedEl = el('<div id="added" role="status" hidden></div>');
  const scrim = el('<div id="scrim" hidden></div>');
  const drawer = el(`<aside id="cart" role="dialog" aria-modal="true" aria-labelledby="cart-h" hidden>
    <header class="sh-head"><h2 id="cart-h" tabindex="-1">Your cart</h2><span class="sh-sub" id="cart-sub"></span><button class="sh-x" type="button" data-close aria-label="Close cart">${X}</button></header>
    <div class="sh-body"><ul class="cart-list" id="cart-list"></ul>
      <div class="cart-empty" id="cart-empty">${BAG}<b>Your cart is empty</b><span>Fill a bowl at the pot, then add it here.</span><button class="btn-secondary" type="button" data-close>Back to the oden</button></div></div>
    <footer class="sh-foot" id="cart-foot">
      <div class="row"><span>Subtotal</span><b id="c-total"></b></div>
      <p class="fine">Taxes included. Delivery and shipping are calculated at checkout. Checkout is a simulation: nothing is ordered or charged.</p>
      <button class="btn-primary" type="button" id="to-checkout">Check out</button>
      <button class="btn-link" type="button" data-close>Continue shopping</button>
    </footer></aside>`);
  const co = el(`<section id="checkout" role="dialog" aria-modal="true" aria-labelledby="ck-h" hidden>
    <header class="ck-top"><button class="ck-back" type="button" id="ck-back">${BACK}<span>Cart</span></button><b class="ck-brand">${esc(merchant.name)} <span lang="ja">おでん</span></b><span class="ck-demo">Simulated<span class="ck-demo-x"> checkout</span></span><button class="sh-x" type="button" data-close aria-label="Close checkout">${X}</button></header>
    <div class="ck-wrap"><div class="ck-main"><h1 id="ck-h" class="sr" tabindex="-1">Checkout</h1>
      <details class="ck-sum-m"><summary><span>Order summary</span><b data-total></b></summary><div data-summary></div></details>
      <form id="ck-form" novalidate></form><div id="ck-done" hidden></div></div>
      <aside class="ck-side" aria-label="Order summary"><div data-summary></div></aside></div></section>`);
  stage.append(cartBtn, addedEl, scrim, drawer, co);
  const $ = (root, s) => root.querySelector(s);
  const form = $(co, '#ck-form'), doneEl = $(co, '#ck-done');

  let cart = [], view = null, placing = false, result = null, tried = false, addedTimer = 0, chopsticksSet = false, errors = {};
  const methods = availableMethods(merchant);
  const sel = { method: methods[0], name: '', email: '', phone: '', store: '', time: '', postal: '', address: '', address2: '', window: '', rate: '', date: '', note: '',
    payment: '', extras: { karashi: true, broth: false, chopsticks: 1 } };
  const cfg = () => merchant.fulfillment[sel.method];
  const payments = () => merchant.payments.filter((p) => !p.only || p.only.includes(sel.method));

  // keep every choice valid for the method and the moment: a store, a time, a rate, a date and a payment that exist
  function normalize() {
    if (!methods.includes(sel.method)) sel.method = methods[0];
    const c = cfg(), now = new Date();
    if (sel.method === 'pickup') {
      if (!c.stores.some((s) => s.id === sel.store)) sel.store = c.stores[0].id;
      const ts = pickupTimes(c, sel.store, now); if (!ts.some((t) => t.id === sel.time)) sel.time = ts[0]?.id || '';
    } else if (sel.method === 'delivery') {
      const ws = deliveryWindows(c, now); if (!ws.some((w) => w.id === sel.window)) sel.window = ws[0]?.id || '';
    } else {
      if (!c.rates.some((r) => r.id === sel.rate)) sel.rate = c.rates[0].id;
      const ds = shippingDates(c, sel.rate, now); if (!ds.some((d) => d.id === sel.date)) sel.date = ds[0]?.id || '';
    }
    if (!payments().some((p) => p.id === sel.payment)) sel.payment = payments()[0].id;
  }

  // ---- pieces of markup ----
  const thumb = (b, cls) => b.thumb ? `<img class="${cls}" src="${b.thumb}" alt="">` : `<span class="${cls} ph">${b.lines.map((l) => icon(l.id)).join('')}</span>`;
  const contents = (b) => b.lines.map((l) => `${l.name} ×${l.qty}`).join(' · ');
  const itemTitle = (b) => `${merchant.item.label} · No. ${b.no}`;
  const field = (name, label, { type = 'text', auto = '', ph = '', opt = false, hint = '' } = {}) => `<div class="fld"><label for="f-${name}">${label}${opt ? ' <small>(optional)</small>' : ''}</label>
    <input id="f-${name}" name="${name}" type="${type}" value="${esc(sel[name])}" ${auto ? `autocomplete="${auto}"` : ''} ${ph ? `placeholder="${ph}"` : ''} aria-describedby="e-${name}${hint ? ` h-${name}` : ''}">
    ${hint ? `<p class="hint" id="h-${name}" data-hint="${name}">${hint}</p>` : ''}<p class="err" id="e-${name}" data-err="${name}"></p></div>`;
  const select = (name, label, opts) => `<div class="fld"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}" aria-describedby="e-${name}">
    ${opts.map((o) => `<option value="${o.id}" ${o.id === sel[name] ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select><p class="err" id="e-${name}" data-err="${name}"></p></div>`;
  const radios = (name, opts) => `<div class="radios" role="radiogroup">${opts.map((o) => `<label class="radio"><input type="radio" name="${name}" value="${o.id}" ${o.id === sel[name] ? 'checked' : ''}>
    <span class="radio-t"><b>${o.title}</b>${o.note ? `<small>${o.note}</small>` : ''}</span>${o.meta ? `<span class="radio-m">${o.meta}</span>` : ''}</label>`).join('')}</div><p class="err" data-err="${name}"></p>`;

  function methodNote(m) {
    const c = merchant.fulfillment[m];
    if (m === 'pickup') return { note: `${plural(c.stores.length, 'store')} · ready in about ${c.leadMin} min`, meta: 'Free' };
    if (m === 'delivery') return { note: `${[...new Set(c.zones.map((z) => z.area.split(' ')[0]))].join(' & ')} area · about ${c.leadMin}–${c.leadMin + 15} min · min. ${yen(c.minimum)}`, meta: `from ${yen(Math.min(...c.zones.map((z) => z.fee)))}` };
    return { note: `Chilled, across Japan · ${Math.min(...c.rates.map((r) => r.days))}–${Math.max(...c.rates.map((r) => r.days))} days`, meta: `from ${yen(Math.min(...c.rates.map((r) => r.price)))}` };
  }
  function postalHint() {
    const c = cfg(), d = postalDigits(sel.postal);
    if (sel.method === 'delivery') {
      const z = deliveryZone(sel.postal, c), areas = c.zones.map((x) => x.prefix).join(', ');
      if (z) return `<span class="ok">✓ We deliver to ${z.area}</span> · ${quote(cart, sel, merchant).fee ? `${yen(z.fee)} fee` : 'free delivery'} (free over ${yen(c.freeOver)})`;
      return d.length === 7 ? `We don’t deliver to this postal code. Demo delivery area: codes starting ${areas}.` : `Demo delivery area: postal codes starting ${areas}.`;
    }
    const b = shippingBlocked(sel.postal, c);
    return b ? `We can’t ship chilled parcels to ${b.area}.` : 'Ships chilled anywhere in Japan except Okinawa (demo rates).';
  }

  function renderForm() {
    normalize();
    const c = cfg(), now = new Date();
    let where = '';
    if (sel.method === 'pickup') where = `<h2 class="ck-h2">Pickup location</h2>${radios('store', c.stores.map((s) => ({ id: s.id, title: s.name, note: `${s.address} · open ${s.hours[0]}:00–${s.hours[1]}:00` })))}
      ${select('time', 'Pickup time', pickupTimes(c, sel.store, now))}`;
    else where = `<h2 class="ck-h2">${sel.method === 'delivery' ? 'Delivery address' : 'Shipping address'}</h2>
      ${field('postal', 'Postal code', { auto: 'postal-code', ph: '150-0001', hint: postalHint() })}
      ${field('address', 'Address', { auto: 'street-address', ph: 'Street, block and number' })}
      ${field('address2', 'Building, apartment', { auto: 'address-line2', opt: true })}
      ${sel.method === 'delivery' ? `${select('window', 'Delivery time', deliveryWindows(c, now))}${field('note', 'Note for the courier', { opt: true, ph: 'e.g. ring the bell twice' })}`
        : `<h2 class="ck-h2">Shipping method</h2>${radios('rate', c.rates.map((r) => ({ id: r.id, title: r.title, note: `Arrives from ${shippingDates(c, r.id, now)[0].label}`, meta: yen(r.price) })))}
           ${select('date', 'Arrival date', shippingDates(c, sel.rate, now))}`}`;
    const pay = payments().find((p) => p.id === sel.payment);
    form.innerHTML = `
      <p class="ck-demo-note ck-sim" role="note"><b>Simulated checkout.</b> No real orders, payments, delivery services or merchant systems are connected. Nothing you enter here is sent anywhere.</p>
      <section><div class="ck-h2row"><h2 class="ck-h2">Contact</h2><button type="button" class="btn-link" data-demo>Fill in demo details</button></div>
        ${field('name', 'Name', { auto: 'name' })}${field('email', 'Email', { type: 'email', auto: 'email', hint: 'For your order confirmation.' })}
        ${field('phone', 'Phone', { type: 'tel', auto: 'tel', opt: sel.method === 'pickup' })}</section>
      <section><h2 class="ck-h2">How would you like it?</h2>${radios('method', methods.map((m) => ({ id: m, title: METHOD_TITLES[m], ...methodNote(m) })))}
        ${merchant.fulfillment.shipping ? '' : '<p class="hint">Hot oden isn’t shipped: it’s made to be eaten within the hour.</p>'}</section>
      <section>${where}</section>
      ${merchant.extras ? `<section><h2 class="ck-h2">With your oden <small>free</small></h2><div class="checks">
        <label class="check"><input type="checkbox" name="karashi" ${sel.extras.karashi ? 'checked' : ''}><span>Karashi mustard <span lang="ja">からし</span></span></label>
        <label class="check"><input type="checkbox" name="broth" ${sel.extras.broth ? 'checked' : ''}><span>Extra broth <span lang="ja">おつゆ多め</span></span></label>
        <label class="check"><span>Chopsticks <span lang="ja">割り箸</span></span><select name="chopsticks" aria-label="Chopsticks">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option ${n === sel.extras.chopsticks ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div></section>` : ''}
      <section><h2 class="ck-h2">Payment</h2>${radios('payment', payments().map((p) => ({ id: p.id, title: p.title })))}
        <p class="ck-paynote">${pay.note}</p></section>
      <p class="ck-demo-note">This checkout is a simulation. Placing the order won’t send it to a store, arrange a delivery or charge anything.</p>
      <p class="err ck-formerr" data-err="form" role="alert"></p>
      <button class="btn-primary" type="submit" id="ck-place" ${placing ? 'disabled' : ''}>${placing ? '<span class="spin"></span>Placing simulated order…' : 'Place simulated order · <span data-total></span>'}</button>`;
    renderSummary(); showErrors();
  }

  function summaryHTML(bowls, q, method) {
    const feeName = { pickup: 'Pickup', delivery: 'Delivery', shipping: 'Shipping' }[method];
    const fee = method === 'pickup' ? 'Free' : !q.feeKnown ? (method === 'delivery' ? 'Enter postal code' : '—') : q.fee ? yen(q.fee) : `Free${q.freeReason ? ` <small>(${q.freeReason})</small>` : ''}`;
    return `<ul class="ck-items">${bowls.map((b) => `<li>${thumb(b, 'ck-img')}<span class="ck-it"><b>${itemTitle(b)}</b><small>${contents(b)}</small></span><span class="ck-pr">${yen(b.total)}</span></li>`).join('')}</ul>
      <div class="ck-rows"><div><span>Subtotal · ${plural(bowls.length, 'item')}</span><span>${yen(q.items)}</span></div>
        <div><span>${feeName}</span><span>${fee}</span></div>
        <div class="ck-total"><span>Total</span><span><small>JPY</small> ${yen(q.total)}</span></div>
        <p class="ck-taxnote">Including ${yen(q.tax)} in taxes</p></div>`;
  }
  function renderSummary() {
    const bowls = result ? result.bowls : cart, q = result ? result.quote : quote(cart, sel, merchant), m = result ? result.fulfillment.method : sel.method;
    co.querySelectorAll('[data-summary]').forEach((n) => { n.innerHTML = summaryHTML(bowls, q, m); });
    co.querySelectorAll('[data-total]').forEach((n) => { n.textContent = yen(q.total); });
  }
  function showErrors() {
    errors = tried ? validateCheckout(cart, sel, merchant) : {};
    form.querySelectorAll('[data-err]').forEach((p) => { const k = p.dataset.err; p.textContent = k === 'form' ? (Object.keys(errors).length ? 'Please check the highlighted fields.' : '') : errors[k] || ''; });
    form.querySelectorAll('input[name], select[name]').forEach((i) => i.toggleAttribute('aria-invalid', !!errors[i.name]));
    const h = form.querySelector('[data-hint="postal"]'); if (h) h.innerHTML = postalHint();
  }

  function renderDrawer() {
    const t = cartTotals(cart);
    $(drawer, '#cart-sub').textContent = cart.length ? plural(t.bowls, 'item') : '';
    $(drawer, '#cart-list').innerHTML = cart.map((b) => `<li class="ci">${thumb(b, 'ci-img')}<div class="ci-main">
      <div class="ci-top"><b>${itemTitle(b)}</b><span>${yen(b.total)}</span></div>
      <p class="ci-sub">${merchant.item.note} · ${plural(b.count, 'piece')}</p>
      <ul class="ci-items">${b.lines.map((l) => `<li>${icon(l.id)}${l.name} <small>×${l.qty}</small></li>`).join('')}</ul>
      <div class="ci-act"><button type="button" class="btn-link" data-edit="${b.id}">Edit</button><button type="button" class="btn-link" data-remove="${b.id}">Remove</button></div></div></li>`).join('');
    $(drawer, '#cart-empty').hidden = cart.length > 0;
    $(drawer, '#cart-foot').hidden = !cart.length;
    $(drawer, '#c-total').textContent = yen(t.total);
  }
  function renderButton() {
    const n = cart.length, badge = $(cartBtn, '.cb-badge');
    badge.hidden = !n; badge.textContent = n;
    cartBtn.setAttribute('aria-label', n ? `Cart, ${plural(n, 'item')}, ${yen(cartTotals(cart).total)}` : 'Cart, empty');
  }
  function render(next) {
    cart = next;
    renderButton(); renderDrawer();
    if (view === 'checkout' && !result) { if (!cart.length) return show('cart'); renderSummary(); }
  }

  // ---- open / close ----
  function show(v) {
    if (placing) return;
    hideAdded();
    if (v === 'checkout') { result = null; tried = false; doneEl.hidden = true; form.hidden = false; $(co, '#ck-back').hidden = false; if (!chopsticksSet) sel.extras.chopsticks = Math.min(6, cart.length); renderForm(); }
    view = v; scrim.hidden = v !== 'cart'; drawer.hidden = v !== 'cart'; co.hidden = v !== 'checkout';
    document.body.classList.toggle('shopping', !!v);
    if (v === 'cart') { renderDrawer(); $(drawer, '#cart-h').focus({ preventScroll: true }); }
    if (v === 'checkout') { co.scrollTop = 0; $(co, '#ck-h').focus({ preventScroll: true }); }
    if (!v) { result = null; cartBtn.focus({ preventScroll: true }); }
  }
  const close = () => show(null);

  function place() {
    if (placing || result) return;
    tried = true; showErrors();
    const bad = Object.keys(errors);
    if (bad.length) {
      if (bad.some((k) => ['time', 'window', 'date'].includes(k))) renderForm(); // a slot may have passed: offer fresh ones
      const first = form.querySelector('[aria-invalid]') || form.querySelector(`[data-err="${bad[0]}"]`);
      first?.scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' }); if (first?.focus) first.focus({ preventScroll: true });
      return;
    }
    placing = true; renderForm();
    const snapshot = JSON.parse(JSON.stringify(sel));
    setTimeout(() => {
      placing = false;
      const r = onPlace(snapshot);
      if (r.status !== 'demo-placed') { renderForm(); form.querySelector('[data-err="form"]').textContent = 'Your cart or a time slot changed, so nothing was placed. Please check and try again.'; return; }
      result = r; cart = []; renderButton(); renderDrawer();
      form.hidden = true; doneEl.hidden = false; doneEl.innerHTML = doneHTML(r); renderSummary();
      co.scrollTop = 0; $(co, '#ck-back').hidden = true; doneEl.querySelector('h2').focus({ preventScroll: true });
    }, reduced.matches ? 0 : 700);
  }
  function doneHTML(r) {
    const f = r.fulfillment, ex = r.extras;
    const extras = ex ? [ex.karashi && 'Karashi mustard', ex.broth && 'Extra broth', ex.chopsticks && `Chopsticks ×${ex.chopsticks}`].filter(Boolean).join(' · ') || 'None' : '';
    return `<p class="ck-eyebrow">Order ${r.orderNo} · simulation</p><h2 class="ck-done-h" tabindex="-1">Thank you, ${esc(r.contact.name)}</h2>
      <p class="ck-demo-note strong">This was a simulated order. It wasn’t sent to a store, no ${f.method === 'pickup' ? 'pickup' : f.method === 'delivery' ? 'courier' : 'parcel'} was arranged and nothing was charged.</p>
      <dl class="ck-facts"><div><dt>${f.title}</dt><dd>${esc(f.where)}<br>${esc(f.when)}</dd></div>
        <div><dt>Contact</dt><dd>${esc(r.contact.name)}<br>${esc(r.contact.email)}</dd></div>
        <div><dt>Payment</dt><dd>${r.payment}<br><small>simulation · not charged</small></dd></div>
        ${extras ? `<div><dt>With your oden</dt><dd>${extras}</dd></div>` : ''}</dl>
      <p class="hint">In a real shop you’d now get a confirmation email${f.method === 'shipping' ? ' with tracking' : ''}.</p>
      <button class="btn-primary" type="button" data-close>Continue shopping</button>`;
  }

  // ---- events ----
  cartBtn.addEventListener('click', () => show('cart'));
  scrim.addEventListener('click', close);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && view) close(); });
  for (const root of [drawer, co, addedEl]) root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-close]')) close();
    else if (b.dataset.remove) onRemove(b.dataset.remove);
    else if (b.dataset.edit) { if (onEdit(b.dataset.edit)) close(); }
    else if (b.id === 'to-checkout') { if (cart.length) show('checkout'); }
    else if (b.dataset.view) show(b.dataset.view);
    else if (b.id === 'ck-back') show('cart');
    else if (b.matches('[data-demo]')) { Object.assign(sel, DEMO_CONTACT); renderForm(); }
    else if (b.matches('[data-dismiss]')) hideAdded();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); place(); });
  // typing updates the order quietly; a choice that changes what else is offered redraws the form, keeping focus
  form.addEventListener('input', (e) => {
    const i = e.target; if (!(i.name in sel) || i.type === 'radio' || i.tagName === 'SELECT') return;
    sel[i.name] = i.value; renderSummary(); showErrors();
  });
  form.addEventListener('change', (e) => {
    const i = e.target;
    if (i.name === 'karashi' || i.name === 'broth') { sel.extras[i.name] = i.checked; return; }
    if (i.name === 'chopsticks') { sel.extras.chopsticks = +i.value; chopsticksSet = true; return; }
    if (!['method', 'store', 'rate', 'payment', 'time', 'window', 'date'].includes(i.name)) return;
    sel[i.name] = i.value;
    if (['time', 'window', 'date'].includes(i.name)) { showErrors(); return; }
    const key = `[name="${i.name}"]${i.type === 'radio' ? `[value="${i.value}"]` : ''}`;
    renderForm(); form.querySelector(key)?.focus({ preventScroll: true });
  });

  // ---- "added to cart": the bowl you made flies into the cart button ----
  function hideAdded() { addedEl.hidden = true; clearTimeout(addedTimer); }
  function added(b, from) {
    const to = cartBtn.getBoundingClientRect(), badge = $(cartBtn, '.cb-badge');
    const bump = () => { cartBtn.classList.remove('bump'); void cartBtn.offsetWidth; cartBtn.classList.add('bump'); };
    if (b.thumb && from && !reduced.matches) {
      const fly = document.createElement('img'); fly.className = 'flyer'; fly.src = b.thumb; fly.alt = '';
      Object.assign(fly.style, { left: from.x + 'px', top: from.y + 'px', width: from.w + 'px', height: from.h + 'px' });
      document.body.append(fly);
      const dx = to.x + to.width / 2 - (from.x + from.w / 2), dy = to.y + to.height / 2 - (from.y + from.h / 2), s = 34 / from.w;
      badge.style.visibility = 'hidden';
      fly.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 60}px) scale(${0.25 + s})`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.7 },
      ], { duration: 720, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' }).onfinish = () => { fly.remove(); badge.style.visibility = ''; bump(); };
    } else bump();
    addedEl.innerHTML = `<div class="ad-top">${b.thumb ? `<img src="${b.thumb}" alt="">` : ''}<span><b>Added to cart</b><small>${itemTitle(b)} · ${yen(b.total)}</small></span><button type="button" class="sh-x" data-dismiss aria-label="Dismiss">${X}</button></div>
      <div class="ad-act"><button type="button" class="btn-secondary" data-view="cart">View cart (${cart.length})</button><button type="button" class="btn-primary" data-view="checkout">Check out</button></div>`;
    // on a phone the pot is at the top, so the note sits just above the sheet, over the fresh (empty) bowl
    const slipEl = document.getElementById('slip');
    addedEl.style.bottom = sheet.matches ? stage.getBoundingClientRect().bottom - slipEl.getBoundingClientRect().top + 10 + 'px' : '';
    addedEl.hidden = false; clearTimeout(addedTimer); addedTimer = setTimeout(hideAdded, 4500);
  }

  return { render, added, hideAdded, isOpen: () => !!view, open: () => show('cart'), close, get view() { return view; } };
}
