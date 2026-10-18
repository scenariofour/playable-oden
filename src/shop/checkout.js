// The shop side of the station: plain data and rules, no Three.js, no DOM.
// A finished bowl becomes a cart item that freezes exactly what is in it and what it costs. The cart holds any number of
// bowls. Checkout picks one way to get them (pickup, local delivery or shipping, as the merchant in merchant.js
// allows), works out fees, times and tax, validates everything, and `placeDemoOrder` stands where a merchant's real
// checkout will go. Nothing here checks a real address, sends anything anywhere or charges anything.

// lines: [{ key, qty }] as counted in the bowl; catalog: { [key]: { jp, en, price, unit } }
export function makeBowl(lines, catalog, { no, thumb = null }) {
  const out = lines.filter((l) => l.qty > 0).map((l) => {
    const f = catalog[l.key];
    return Object.freeze({ id: l.key, name: f.en, nameJa: f.jp, unit: f.unit, unitPrice: f.price, qty: l.qty, amount: f.price * l.qty });
  });
  return Object.freeze({
    id: `bowl-${no}`, no, thumb, lines: Object.freeze(out),
    count: out.reduce((n, l) => n + l.qty, 0),
    total: out.reduce((n, l) => n + l.amount, 0),
    signature: signature(out),
  });
}

// what a bowl is, as one string: the same contents always give the same signature
export function signature(lines) {
  return lines.filter((l) => l.qty > 0).map((l) => `${l.id ?? l.key}:${l.qty}`).sort().join('|');
}

export function cartTotals(cart) {
  return { bowls: cart.length, pieces: cart.reduce((n, b) => n + b.count, 0), total: cart.reduce((n, b) => n + b.total, 0) };
}

// a checkout must refuse anything it can't vouch for: unknown products, stale prices, bad sums, an empty cart
export function validateCart(cart, catalog) {
  const errors = [];
  if (!cart.length) errors.push('empty');
  for (const b of cart) {
    if (!b.lines.length) errors.push(`empty:${b.id}`);
    for (const l of b.lines) {
      const f = catalog[l.id];
      if (!f) errors.push(`unknown:${b.id}:${l.id}`);
      else if (f.price !== l.unitPrice) errors.push(`price:${b.id}:${l.id}`);
      if (!Number.isInteger(l.qty) || l.qty < 1 || l.amount !== l.unitPrice * l.qty) errors.push(`line:${b.id}:${l.id}`);
    }
    if (b.total !== b.lines.reduce((n, l) => n + l.amount, 0)) errors.push(`total:${b.id}`);
  }
  if (new Set(cart.map((b) => b.id)).size !== cart.length) errors.push('duplicate');
  return errors;
}

// ---- fulfillment ---------------------------------------------------------------------------------------------------
export const METHOD_TITLES = { pickup: 'Store pickup', delivery: 'Local delivery', shipping: 'Shipping' };

// only what the merchant offers for this kind of product: hot food is never shipped
export function availableMethods(merchant) {
  return Object.entries(merchant.fulfillment).filter(([, c]) => c.temps.includes(merchant.item.temp)).map(([id]) => id);
}

export const postalDigits = (s) => String(s || '').replace(/\D/g, '');
export function deliveryZone(postal, cfg) {
  const d = postalDigits(postal);
  return d.length === 7 ? cfg.zones.find((z) => d.startsWith(z.prefix)) || null : null;
}
export function shippingBlocked(postal, cfg) {
  const d = postalDigits(postal);
  return (cfg.exclude || []).find((x) => d.startsWith(x.prefix)) || null;
}

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${d.getHours()}:${pad(d.getMinutes())}`;
const DAY = 864e5;
export function dayLabel(d, now) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()), b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = Math.round((b - a) / DAY);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
// time slots inside opening hours, today and then tomorrow; the first one is "as soon as possible" when open now
function slots(now, [open, close], leadMin, stepMin, span = 0, max = 10) {
  const out = [], step = stepMin * 6e4;
  let t = Math.ceil((now.getTime() + leadMin * 6e4) / step) * step;
  for (let i = 0; out.length < max && i < 400; i++, t += step) {
    const d = new Date(t), h = d.getHours() + d.getMinutes() / 60, end = new Date(t + span * 6e4);
    if (h < open || h + span / 60 > close) continue;
    out.push({ id: String(t), at: t, label: `${dayLabel(d, now)} ${hm(d)}${span ? '–' + hm(end) : ''}` });
  }
  return out;
}
const openNow = (now, [open, close]) => now.getHours() >= open && now.getHours() < close;
export function pickupTimes(cfg, storeId, now = new Date()) {
  const store = cfg.stores.find((s) => s.id === storeId); if (!store) return [];
  const list = slots(now, store.hours, cfg.leadMin, cfg.slotMin);
  return openNow(now, store.hours) && list.length ? [{ id: 'asap', at: list[0].at, label: `As soon as possible (about ${cfg.leadMin} min)` }, ...list.slice(1)] : list;
}
export function deliveryWindows(cfg, now = new Date()) {
  const list = slots(now, cfg.hours, cfg.leadMin, cfg.windowMin, cfg.windowMin);
  return openNow(now, cfg.hours) && list.length ? [{ id: 'asap', at: list[0].at, label: `As soon as possible (about ${cfg.leadMin}–${cfg.leadMin + 15} min)` }, ...list.slice(1)] : list;
}
export function shippingDates(cfg, rateId, now = new Date()) {
  const rate = cfg.rates.find((r) => r.id === rateId); if (!rate) return [];
  const first = rate.days + (now.getHours() >= cfg.cutoffHour ? 1 : 0);
  return Array.from({ length: cfg.dateChoices }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + first + i, 12);
    return { id: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) };
  });
}

// what the order costs with this way of getting it; every price already includes tax
export function quote(cart, sel, merchant) {
  const items = cartTotals(cart).total, cfg = merchant.fulfillment[sel.method];
  let fee = 0, feeKnown = true, freeReason = '';
  if (sel.method === 'delivery') {
    const z = deliveryZone(sel.postal, cfg);
    if (!z) feeKnown = false; else if (items >= cfg.freeOver) { fee = 0; freeReason = `free over ¥${cfg.freeOver.toLocaleString()}`; } else fee = z.fee;
  } else if (sel.method === 'shipping') {
    const r = cfg.rates.find((x) => x.id === sel.rate);
    if (!r) feeKnown = false; else fee = r.price;
  }
  const { food, service } = merchant.tax;
  const tax = Math.floor(items * food / (1 + food)) + Math.floor(fee * service / (1 + service));
  return { items, fee, feeKnown, freeReason, tax, total: items + fee };
}

// field → message; empty when the checkout can be placed
export function validateCheckout(cart, sel, merchant, now = new Date()) {
  const e = {}, cfg = merchant.fulfillment[sel.method], items = cartTotals(cart).total;
  if (!sel.name?.trim()) e.name = 'Enter your name';
  if (!/^\S+@\S+\.\S+$/.test(sel.email || '')) e.email = 'Enter an email for your confirmation';
  if (sel.method !== 'pickup' && postalDigits(sel.phone).length < 10) e.phone = 'Enter a phone number for the courier';
  if (!availableMethods(merchant).includes(sel.method)) e.method = 'Choose how to get your order';
  else if (sel.method === 'pickup') {
    if (!cfg.stores.some((s) => s.id === sel.store)) e.store = 'Choose a store';
    if (!pickupTimes(cfg, sel.store, now).some((t) => t.id === sel.time)) e.time = 'Choose a pickup time';
  } else {
    if (postalDigits(sel.postal).length !== 7) e.postal = 'Enter a 7-digit postal code';
    else if (sel.method === 'delivery' && !deliveryZone(sel.postal, cfg)) e.postal = 'This address is outside our delivery area';
    else if (sel.method === 'shipping' && shippingBlocked(sel.postal, cfg)) e.postal = `We can’t ship chilled parcels to ${shippingBlocked(sel.postal, cfg).area}`;
    if (!sel.address?.trim()) e.address = 'Enter your street address';
    if (sel.method === 'delivery') {
      if (items < cfg.minimum) e.method = `Delivery needs at least ¥${cfg.minimum.toLocaleString()} in your cart`;
      if (!deliveryWindows(cfg, now).some((w) => w.id === sel.window)) e.window = 'Choose a delivery time';
    } else {
      if (!cfg.rates.some((r) => r.id === sel.rate)) e.rate = 'Choose a shipping method';
      if (!shippingDates(cfg, sel.rate, now).some((d) => d.id === sel.date)) e.date = 'Choose an arrival date';
    }
  }
  const pay = merchant.payments.find((p) => p.id === sel.payment);
  if (!pay || (pay.only && !pay.only.includes(sel.method))) e.payment = 'Choose a payment method';
  return e;
}

// The seam. A merchant integration replaces this with its own handoff (create a cart from the bowls' lines and the
// chosen fulfillment, open its own secure checkout, report back). Here it only checks and describes the order.
export function placeDemoOrder(cart, sel, catalog, merchant, { orderNo, now = new Date() }) {
  const errors = [...validateCart(cart, catalog), ...Object.values(validateCheckout(cart, sel, merchant, now))];
  if (errors.length) return { status: 'invalid', errors };
  const cfg = merchant.fulfillment[sel.method];
  let where = '', when = '';
  if (sel.method === 'pickup') { const s = cfg.stores.find((x) => x.id === sel.store); where = `${s.name} · ${s.address}`; when = pickupTimes(cfg, sel.store, now).find((t) => t.id === sel.time).label; }
  else {
    where = `〒${postalDigits(sel.postal).replace(/^(\d{3})/, '$1-')} ${sel.address}${sel.address2 ? ', ' + sel.address2 : ''}`;
    when = sel.method === 'delivery' ? deliveryWindows(cfg, now).find((w) => w.id === sel.window).label
      : `${cfg.rates.find((r) => r.id === sel.rate).title} · arrives ${shippingDates(cfg, sel.rate, now).find((d) => d.id === sel.date).label}`;
  }
  return Object.freeze({
    status: 'demo-placed', demo: true, sent: false, charged: false, at: now.getTime(),
    orderNo: `D-${String(orderNo).padStart(4, '0')}`, merchant: merchant.id,
    bowls: cart.slice(), quote: quote(cart, sel, merchant),
    fulfillment: { method: sel.method, title: METHOD_TITLES[sel.method], where, when },
    contact: { name: sel.name.trim(), email: sel.email.trim() },
    payment: merchant.payments.find((p) => p.id === sel.payment).title,
    extras: merchant.extras ? { ...sel.extras } : null,
  });
}
