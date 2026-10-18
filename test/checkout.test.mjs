// The shop's rules (checkout.js, merchant.js) are plain functions with no DOM or Three.js, so they run in Node.
// `now` is passed explicitly everywhere so time slots and dates are deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBowl, signature, cartTotals, validateCart, availableMethods, deliveryZone, shippingBlocked,
  pickupTimes, deliveryWindows, shippingDates, quote, validateCheckout, placeDemoOrder,
} from '../src/shop/checkout.js';
import { MERCHANTS, merchantFor } from '../src/shop/merchant.js';

// the catalog fields checkout.js reads (the full FOODS entries in src/station/foods.js also carry the 3D look)
const CATALOG = {
  daikon: { jp: '大根', en: 'Daikon', price: 100, unit: 'piece' },
  egg: { jp: 'たまご', en: 'Egg', price: 110, unit: 'piece' },
  tsumire: { jp: 'つみれ串', en: 'Tsumire skewer', price: 130, unit: 'skewer' },
};
const noon = new Date(2026, 9, 19, 12, 0); // a Monday, inside every demo opening hour
const bowl = (no, lines) => makeBowl(lines, CATALOG, { no });
const counter = MERCHANTS.counter, chilled = MERCHANTS.chilled;
const contact = { name: 'Test Customer', email: 'test@example.com', phone: '03-0000-0000' };

test('a bowl freezes its lines, count, total and signature', () => {
  const b = bowl(1, [{ key: 'egg', qty: 2 }, { key: 'daikon', qty: 1 }, { key: 'tsumire', qty: 0 }]);
  assert.equal(b.id, 'bowl-1');
  assert.deepEqual(b.lines.map((l) => [l.id, l.qty, l.amount]), [['egg', 2, 220], ['daikon', 1, 100]]);
  assert.equal(b.count, 3);
  assert.equal(b.total, 320);
  assert.equal(b.signature, 'daikon:1|egg:2');
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.lines[0]));
  assert.equal(signature([{ key: 'egg', qty: 2 }, { key: 'daikon', qty: 1 }]), b.signature, 'order does not matter');
});

test('cart totals add up bowls and pieces', () => {
  const cart = [bowl(1, [{ key: 'egg', qty: 2 }]), bowl(2, [{ key: 'daikon', qty: 3 }])];
  assert.deepEqual(cartTotals(cart), { bowls: 2, pieces: 5, total: 520 });
});

test('validateCart refuses empty carts, unknown products, stale prices and duplicates', () => {
  assert.deepEqual(validateCart([], CATALOG), ['empty']);
  const ok = bowl(1, [{ key: 'egg', qty: 1 }]);
  assert.deepEqual(validateCart([ok], CATALOG), []);
  assert.ok(validateCart([ok], { ...CATALOG, egg: { ...CATALOG.egg, price: 120 } }).includes('price:bowl-1:egg'));
  assert.ok(validateCart([ok], { daikon: CATALOG.daikon }).includes('unknown:bowl-1:egg'));
  assert.ok(validateCart([ok, ok], CATALOG).includes('duplicate'));
});

test('hot bowls are never shipped; chilled packs can be', () => {
  assert.deepEqual(availableMethods(counter), ['pickup', 'delivery']);
  assert.deepEqual(availableMethods(chilled), ['pickup', 'delivery', 'shipping']);
  assert.equal(merchantFor('nope'), counter, 'unknown ids fall back to the default merchant');
});

test('delivery area and shipping exclusions go by postal code prefix', () => {
  const d = counter.fulfillment.delivery;
  assert.equal(deliveryZone('150-0001', d).area, 'Shibuya');
  assert.equal(deliveryZone('153 0042', d).fee, 400);
  assert.equal(deliveryZone('100-0001', d), null);
  assert.equal(deliveryZone('150', d), null, 'needs all 7 digits');
  assert.equal(shippingBlocked('900-0001', chilled.fulfillment.shipping).area, 'Okinawa');
  assert.equal(shippingBlocked('060-0001', chilled.fulfillment.shipping), null);
});

test('time slots respect opening hours and offer "as soon as possible" only while open', () => {
  const pickup = counter.fulfillment.pickup;
  const open = pickupTimes(pickup, 'station', noon);
  assert.equal(open[0].id, 'asap');
  assert.ok(open.length > 1);
  const late = pickupTimes(pickup, 'river', new Date(2026, 9, 19, 22, 0)); // Riverside closes at 21:00
  assert.notEqual(late[0].id, 'asap');
  assert.match(late[0].label, /^Tomorrow 9:/);
  assert.equal(pickupTimes(pickup, 'no-such-store', noon).length, 0);
  assert.equal(deliveryWindows(counter.fulfillment.delivery, noon)[0].id, 'asap');
});

test('shipping dates move a day later after the cut-off', () => {
  const s = chilled.fulfillment.shipping;
  const before = shippingDates(s, 'standard', new Date(2026, 9, 19, 10, 0));
  const after = shippingDates(s, 'standard', new Date(2026, 9, 19, 16, 0));
  assert.equal(before.length, s.dateChoices);
  assert.equal(before[0].id, '2026-10-21');
  assert.equal(after[0].id, '2026-10-22');
});

test('quote: delivery fee by zone, free over the threshold, tax included', () => {
  const cart = [bowl(1, [{ key: 'egg', qty: 8 }])]; // ¥880
  const q = quote(cart, { method: 'delivery', postal: '153-0042' }, counter);
  assert.deepEqual([q.items, q.fee, q.total], [880, 400, 1280]);
  assert.equal(q.tax, Math.floor(880 * 0.08 / 1.08) + Math.floor(400 * 0.1 / 1.1));
  const big = [bowl(1, [{ key: 'egg', qty: 8 }]), bowl(2, [{ key: 'tsumire', qty: 8 }])]; // ¥1,920, plus ¥100 below: over ¥2,000
  const free = quote([...big, bowl(3, [{ key: 'daikon', qty: 1 }])], { method: 'delivery', postal: '150-0001' }, counter);
  assert.equal(free.fee, 0);
  assert.match(free.freeReason, /free over/);
  assert.equal(quote(cart, { method: 'delivery', postal: '' }, counter).feeKnown, false);
});

test('validateCheckout names each missing or invalid field', () => {
  const cart = [bowl(1, [{ key: 'egg', qty: 2 }])]; // ¥220: under the delivery minimum
  const e = validateCheckout(cart, { method: 'delivery', postal: '100-0001', payment: 'store' }, counter, noon);
  assert.equal(e.name, 'Enter your name');
  assert.ok(e.email && e.phone && e.address && e.window);
  assert.equal(e.postal, 'This address is outside our delivery area');
  assert.match(e.method, /at least ¥800/);
  assert.equal(e.payment, 'Choose a payment method', 'pay at the store is only for pickup');
});

test('placeDemoOrder returns a frozen demo order that was neither sent nor charged', () => {
  const cart = [bowl(1, [{ key: 'egg', qty: 2 }, { key: 'daikon', qty: 1 }])];
  const time = pickupTimes(counter.fulfillment.pickup, 'river', noon)[1].id;
  const sel = { ...contact, method: 'pickup', store: 'river', time, payment: 'store', extras: { karashi: true, broth: false, chopsticks: 1 } };
  const order = placeDemoOrder(cart, sel, CATALOG, counter, { orderNo: 7, now: noon });
  assert.equal(order.status, 'demo-placed');
  assert.equal(order.orderNo, 'D-0007');
  assert.equal(order.sent, false);
  assert.equal(order.charged, false);
  assert.equal(order.quote.total, 320);
  assert.match(order.fulfillment.where, /^Riverside/);
  assert.ok(Object.isFrozen(order));

  const bad = placeDemoOrder(cart, { ...sel, email: 'nope' }, CATALOG, counter, { orderNo: 8, now: noon });
  assert.equal(bad.status, 'invalid');
  assert.ok(bad.errors.length);
});

test('shipping orders describe the rate and the arrival date', () => {
  const cart = [bowl(1, [{ key: 'tsumire', qty: 3 }])];
  const s = chilled.fulfillment.shipping, date = shippingDates(s, 'express', noon)[2];
  const sel = { ...contact, method: 'shipping', postal: '060-0001', address: '1-1 Sample', rate: 'express', date: date.id, payment: 'card' };
  const order = placeDemoOrder(cart, sel, CATALOG, chilled, { orderNo: 1, now: noon });
  assert.equal(order.status, 'demo-placed');
  assert.equal(order.quote.fee, 1480);
  assert.equal(order.fulfillment.when, `Chilled express · arrives ${date.label}`);
  assert.equal(order.extras, null, 'the chilled merchant offers no free extras');
});
