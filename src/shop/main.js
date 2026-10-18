// Playable Oden · the standalone shop. The station itself (warmer, broth, food, tongs, bowl, restock and every motion)
// is ../station/station.js, which other hosts can embed too; this page is its shop host: the renderer, the set and its light,
// the camera, the order slip with demo prices, and the cart and checkout. "Add to cart" freezes what is in the bowl
// into a cart item (checkout.js), the bowl slides off toward the cart and a fresh one is set down; the cart and
// checkout (shop.js) take it from there. State changes at once on a click; the motion only shows it and can always be
// skipped.
import * as THREE from 'three';
import { createEnvironment, createBackdrop, createCounter } from '../station/set.js';
import { createCondiments } from '../station/props.js';
import { createStation, FOODS, ORDER, DECK, BOWL_MAX } from '../station/station.js';
import { createSlip, yen } from './ui.js';
import { Spring } from '../station/motion.js';
import { makeBowl, validateCart, placeDemoOrder } from './checkout.js';
import { merchantFor } from './merchant.js';
import { createShop } from './shop.js';

const params = new URLSearchParams(location.search);
const merchant = merchantFor(params.get('merchant')); // what the shop offers: ?merchant=chilled adds shipping
if (params.get('frame') === '9x16') document.body.classList.add('framed');
if (params.get('ui') === '0') document.body.classList.add('no-ui');
const stage = document.getElementById('stage'), canvas = document.getElementById('c'), srEl = document.getElementById('sr');
// the karashi packet and the price cards want the rounded face; don't hold the scene up for long if it is slow
await Promise.race([document.fonts?.load('900 60px "Zen Maru Gothic"'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});

// ---- renderer, set, light ------------------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x231d24);
scene.environment = createEnvironment(renderer);
scene.environmentIntensity = 0.78; // a night store: let the lamp over the case do the work
const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 20);
const backdrop = createBackdrop(); scene.add(backdrop);
const counter = createCounter(); scene.add(counter);
const key = new THREE.SpotLight(0xffe2c0, 2.8, 0, 0.5, 1, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.00015; key.shadow.normalBias = 0.0012;
key.shadow.camera.near = 0.3; key.shadow.camera.far = 3; key.shadow.intensity = 0.7; key.shadow.radius = 8; key.shadow.blurSamples = 16;
scene.add(key, key.target);
scene.add(new THREE.HemisphereLight(0xb8aadc, 0x6a4a3a, 0.5));
const fill = new THREE.DirectionalLight(0xffd8b0, 0.32); scene.add(fill, fill.target);
// the warm lamp hanging over the case: the food is the brightest, warmest thing in the room
const lamp = new THREE.PointLight(0xffbf78, 0.075, 0, 2); scene.add(lamp);

// ---- the station -----------------------------------------------------------------------------------------------------
// The warmer is built for the layout: 3 × 2 beside the bowl on wide screens, 2 × 3 above it on phones, so the food is
// as large as the screen allows. Here the well sinks into this page's counter, which cuts the opening (cutWell).
const station = createStation({
  prices: true,
  hooks: {
    change: () => refresh(),
    toast: (t) => slip.toast(t),
    say,
    locked: () => slip.toast('A fresh bowl is on its way'),
    landed: (p, toBowl, pos) => {
      say(toBowl ? `${p.def.en} added. ${orderLine()}` : `${p.def.en} put back. ${orderLine()}`);
      popAt(toBowl ? `+${yen(p.def.price)}` : `−${yen(p.def.price)}`, pos, !toBowl);
    },
  },
});
scene.add(station.root);
const bowl = station.bowl;
// the finished bowl gets its karashi and chopsticks, dropped beside it when you say Done
const condiments = createCondiments(); condiments.position.set(0.085, 0, 0.085); condiments.rotation.y = -0.5; bowl.group.add(condiments);
const condDrop = new Spring(0, 260, 16);

// ---- the shop: bowls, cart, checkout ----------------------------------------------------------------------------------
// 'choosing' while you fill the bowl; 'serving' for the moment it slides off to the cart and a fresh one is set down.
let phase = 'choosing', bowlNo = 1, editingNo = null, orderNo = 1, cart = [], lastOrder = null, show = null;
const currentNo = () => editingNo ?? bowlNo; // a bowl brought back from the cart keeps its number
const total = (m) => m.lines.reduce((n, l) => n + l.qty * FOODS[l.key].price, 0);
function model() { const m = station.model(); return { ...m, total: total(m), phase, bowlNo: currentNo(), inCart: cart.length }; }
function orderLine() { const m = model(); return `Your bowl: ${m.count} ${m.count === 1 ? 'item' : 'items'}, ${yen(m.total)}.`; }
let lastModel = '';
function refresh() {
  const m = model(), s = JSON.stringify(m);
  if (s !== lastModel) { lastModel = s; slip.render(m); }
}
function say(t) { srEl.textContent = t; }

// Each step changes the state first and then plays its motion as a `show`, which a tap or a key finishes at once.
function finishShow() { if (show) { const s = show; show = null; s.finish(); } }
function startShow(gen, finish) { finishShow(); show = { gen, finish, skip: false }; gen.next(); }

// the bowl as it looks right now, cut out of the frame: the cart shows the bowl you actually made
const V1 = new THREE.Vector3();
const bowlRing = Array.from({ length: 24 }, (_, i) => [Math.cos(i / 24 * Math.PI * 2), Math.sin(i / 24 * Math.PI * 2)]);
function bowlRect() {
  const bp = bowl.group.position, r = canvas.getBoundingClientRect(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [c, s] of bowlRing) for (const y of [0, bowl.height + 0.03]) {
    const q = V1.set(bp.x + c * bowl.rimR * 1.08, y, bp.z + s * bowl.rimR * 1.08).project(camera);
    const sx = (q.x + 1) / 2 * r.width, sy = (1 - q.y) / 2 * r.height; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const side = Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: r.left + cx - side / 2, y: r.top + cy - side / 2, w: side, h: side };
}
function snapshotBowl() {
  const rect = bowlRect(), r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
  renderer.render(scene, camera); // read back in the same task, before the buffer is cleared
  const c = document.createElement('canvas'); c.width = c.height = 200;
  c.getContext('2d').drawImage(canvas, (rect.x - r.left) * k, (rect.y - r.top) * k, rect.w * k, rect.h * k, 0, 0, 200, 200);
  try { return { url: c.toDataURL('image/jpeg', 0.86), rect }; } catch { return { url: null, rect }; }
}

function addToCart() {
  if (phase !== 'choosing' || shop.isOpen()) return;
  const m = model(); if (!m.count || m.pending) return;
  finishShow(); station.hover(null);
  const shot = snapshotBowl();
  const item = makeBowl(m.lines, FOODS, { no: currentNo(), thumb: shot.url });
  if (validateCart([...cart, item], FOODS).length) return slip.toast('Something in the bowl changed · try again');
  cart = [...cart, item].sort((a, b) => a.no - b.no); if (editingNo !== null) editingNo = null; else bowlNo++;
  // the pieces leave the station with the bowl: they are in the cart now
  phase = 'serving'; station.lock(true);
  const served = station.takeBowl();
  refresh(); shop.render(cart); shop.added(item, shot.rect);
  say(`Added to cart: bowl ${item.no}, ${item.count} ${item.count === 1 ? 'piece' : 'pieces'}, ${yen(item.total)}. ${cart.length} ${cart.length === 1 ? 'bowl' : 'bowls'} in your cart.`);
  // the bowl lifts and slides off toward the cart; a fresh one is set down from the front
  const out = layoutName === 'front' ? new THREE.Vector3(0.36, 0.05, -0.12) : new THREE.Vector3(0.42, 0.05, -0.2);
  const { gen, end } = station.serveMotion(served, out, () => { phase = 'choosing'; station.lock(false); refresh(); });
  startShow(gen, end);
}
function removeFromCart(id) {
  const b = cart.find((x) => x.id === id); if (!b) return;
  cart = cart.filter((x) => x !== b); shop.render(cart); refresh();
  say(`Bowl ${b.no} removed from your cart.`);
}
// a bowl from the cart back on the counter, to change it: only into an empty bowl, so nothing gets mixed up
function editFromCart(id) {
  const b = cart.find((x) => x.id === id); if (!b) return false;
  const m = model();
  if (phase !== 'choosing' || m.count || m.pending) { slip.toast('Add or empty the bowl you’re making first'); return false; }
  cart = cart.filter((x) => x !== b); editingNo = b.no;
  station.fillBowl(b.lines);
  shop.render(cart); refresh();
  say(`Bowl ${b.no} is back on the counter: ${b.lines.map((l) => `${l.qty} ${l.name}`).join(', ')}.`);
  return true;
}
function placeOrder(details) {
  const r = placeDemoOrder(cart, details, FOODS, merchant, { orderNo });
  if (r.status !== 'demo-placed') return r;
  lastOrder = r; orderNo++; cart = []; refresh();
  say(`Demo order ${r.orderNo} placed: ${r.bowls.length} ${r.bowls.length === 1 ? 'item' : 'items'}, ${yen(r.quote.total)} by ${r.fulfillment.title.toLowerCase()}. Nothing was sent or charged.`);
  return r;
}

const slip = createSlip({ onAdd: station.addKind, onRemove: station.removeKind, onUndo: station.undo, onDone: addToCart });
const shop = createShop({ merchant, onRemove: removeFromCart, onEdit: editFromCart, onPlace: placeOrder });

// ---- layout & camera -----------------------------------------------------------------------------------------------------------
// Stand at the counter and look down into the case; your bowl sits on the counter in front of it, nearest you.
// Desktop keeps the slip as a ticket on the right, phones as a sheet at the bottom; the camera frames the set inside
// whatever the slip leaves free. ('side' is the bowl-beside-the-case alternative, kept for comparison: ?layout=side)
const LAYOUTS = {
  front: { cols: 2, caseZ: -0.1, bowl: [0.0, null], holder: 'bowl', elev: 60, fov: 30 },  // bowl z: just in front of the deck
  side: { cols: 3, caseZ: -0.02, bowl: [0.305, 0.085], holder: 'case', elev: 58, fov: 30 },
};
let layoutName = null, pendingLayout = false;
const busy = () => station.busy() || !!show;

function onResize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const want = LAYOUTS[params.get('layout')] ? params.get('layout') : (w / h < 1.05 || document.body.classList.contains('framed') ? 'front' : 'side');
  if (want !== layoutName) { if (busy()) pendingLayout = true; else placeSet(want); }
  frameCamera();
  station.setCamera(camera, h * renderer.getPixelRatio());
}

function placeSet(name) {
  layoutName = name; pendingLayout = false;
  const L = LAYOUTS[name];
  station.layout(L);
  const oc = station.oc, bz = bowl.group.position.z;
  counter.position.set(L.bowl[0] / 2, 0, Math.max(L.caseZ + oc.hz, bz + bowl.rimR) + 0.16 - counter.userData.depth / 2); // front edge well out of the frame
  counter.userData.cutWell(oc.group.position.x - counter.position.x, oc.group.position.z - counter.position.z, oc.hx + oc.wall, oc.hz + oc.wall, DECK);
  // the karashi and chopsticks land on the open side of the bowl, clear of the phone sheet and the tongs' crock
  if (name === 'front') { condiments.position.set(-bowl.rimR - 0.013, 0, 0.005); condiments.rotation.y = -Math.PI / 2 + 0.1; }
  else { condiments.position.set(0.085, 0, 0.085); condiments.rotation.y = -0.5; }
}

// the camera pose that fits a set of points inside what the slip leaves free
const V2 = new THREE.Vector3();
function solveView(pts, res, elevDeg) {
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.setViewOffset(w, h, res.right / 2, (res.bottom - res.top) / 2, w, h); // centre the set in the part the slip leaves free
  const xmax = 1 - 2 * (res.right + 14) / w, xmin = -1 + 28 / w, ymin = -1 + 2 * (res.bottom + 10) / h, ymax = 1 - 2 * (res.top + 8) / h;
  const center = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()); center.y = 0.02;
  const el = THREE.MathUtils.degToRad(elevDeg), dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
  const place = (d) => { camera.position.copy(center).addScaledVector(dir, d); camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); };
  const fits = () => pts.every((p) => { const q = V1.copy(p).project(camera); return q.x > xmin && q.x < xmax && q.y > ymin && q.y < ymax; });
  let dist = 1;
  for (let pass = 0; pass < 3; pass++) {
    let lo = 0.15, hi = 5;
    for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; place(mid); if (fits()) hi = mid; else lo = mid; }
    place(dist = hi);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const q = V1.copy(p).project(camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const half = hi * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    center.addScaledVector(V2.set(1, 0, 0).applyQuaternion(camera.quaternion), ((x0 + x1) / 2 - (xmin + xmax) / 2) * half * camera.aspect);
    center.addScaledVector(V2.set(0, 1, 0).applyQuaternion(camera.quaternion), ((y0 + y1) / 2 - (ymin + ymax) / 2) * half);
  }
  place(dist);
  return { center };
}
function frameCamera() {
  const L = LAYOUTS[layoutName], oc = station.oc, holder = station.holder;
  camera.fov = L.fov;
  const pts = [], cp = oc.group.position, bp = bowl.group.position, hx = oc.hx + oc.wall, hz = oc.hz + oc.wall;
  const dx = layoutName === 'front' ? 0.006 : DECK; // on a phone the deck may bleed off the sides: the food matters more
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 0.04]) pts.push(new THREE.Vector3(cp.x + sx * (hx + dx), y, cp.z + sz * (hz + DECK)));
  pts.push(holder.position.clone().add(V1.set(0.03, 0, 0)), holder.position.clone().add(V1.set(0.03, 0.08, 0))); // the tongs' cup stays in view
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; for (const y of [0, bowl.height]) pts.push(new THREE.Vector3(bp.x + Math.cos(a) * bowl.rimR, y, bp.z + Math.sin(a) * bowl.rimR)); }
  const { center } = solveView(pts, slip.reserve(), L.elev);
  key.position.copy(center).add(V1.set(0.16, 0.85, -0.6)); key.target.position.copy(center);
  station.keyDir.subVectors(key.position, key.target.position);
  fill.position.copy(center).add(V1.set(-0.6, 0.4, 0.8)); fill.target.position.copy(center);
  lamp.position.copy(station.lamp);
  const d = 1.9, fh = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), fw = fh * camera.aspect, ta = backdrop.userData.aspect;
  const bw = fw / fh > ta ? fw * 1.15 : fh * 1.15 * ta;
  backdrop.scale.set(bw, bw / ta, 1);
  backdrop.position.copy(camera.position).addScaledVector(camera.getWorldDirection(V1), d);
  backdrop.quaternion.copy(camera.quaternion);
}

// ---- input -------------------------------------------------------------------------------------------------------------------
const ndc = new THREE.Vector2(), raycaster = new THREE.Raycaster();
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return station.pick(raycaster.ray);
}
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  if (press || !e.isPrimary) return;
  shop.hideAdded(); // back to shopping: the note has said its piece
  if (show) { show.skip = true; e.preventDefault(); return; } // a tap during a flourish just finishes it
  const t = pick(e); if (!t) return;
  e.preventDefault();
  press = { id: e.pointerId, t, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  station.press(t, true);
});
canvas.addEventListener('pointermove', (e) => {
  if (press && e.pointerId === press.id) { if (press.t.piece) press.t.piece.press.target = Math.hypot(e.clientX - press.x, e.clientY - press.y) < 24 ? 1 : 0; return; }
  if (e.pointerType !== 'mouse') return;
  const t = station.locked ? null : pick(e); // a locked bowl doesn't invite touching
  station.hover(t);
  canvas.classList.toggle('is-hot', !!t);
});
canvas.addEventListener('pointerup', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const { t } = press; press = null;
  station.press(t, false);
  const t2 = pick(e);
  if (t2 && ((t.piece && t2.piece === t.piece) || (t.tag && t2.tag === t.tag))) station.act(t);
});
canvas.addEventListener('pointercancel', (e) => { if (press && e.pointerId === press.id) { station.press(press.t, false); press = null; } });
canvas.addEventListener('pointerleave', () => { if (!press) { station.hover(null); canvas.classList.remove('is-hot'); } });
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('button')) return;
  if (shop.isOpen()) return;
  if (show && !['Shift', 'Tab'].includes(e.key)) { show.skip = true; return; }
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('no-ui');
  else if (e.key >= '1' && e.key <= '6') station.addKind(ORDER[+e.key - 1]);
  else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') station.undo();
});
function popAt(text, pos, kind) {
  const q = V1.copy(pos).setY(pos.y + 0.03).project(camera);
  slip.pop(text, (q.x + 1) / 2 * stage.clientWidth, (1 - q.y) / 2 * stage.clientHeight, kind === true ? 'minus' : kind || '');
}

// ---- frame -----------------------------------------------------------------------------------------------------------------------
let last = performance.now(), paused = false;
const fpsEl = params.has('debug') ? Object.assign(document.body.appendChild(document.createElement('div')), { id: 'fps' }) : null;
let fpsAcc = 0, fpsN = 0;

function tick(dt) {
  station.tick(dt);
  if (show) { // a flourish that fails still lands in its end state: the order never waits on the motion
    try { if (show.skip) finishShow(); else if (show.gen.next(dt).done) show = null; } catch (err) { console.error(err); finishShow(); }
  }
  if (pendingLayout && !busy()) onResize();
  condDrop.step(dt); condiments.position.y = condDrop.value;
}
function render(dt) {
  renderer.render(scene, camera);
  if (fpsEl) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps`; fpsAcc = 0; fpsN = 0; } }
}
function frame(now) {
  const dt = Math.min(1 / 30, Math.max(1e-4, (now - last) / 1000)); last = now;
  if (!paused) { tick(dt); render(dt); }
  requestAnimationFrame(frame);
}

new ResizeObserver(onResize).observe(stage);
onResize();
refresh(); station.refresh();
requestAnimationFrame((n) => { last = n; frame(n); });

// for checks from the console / automated tests
window.__oden = {
  station, add: station.addKind, removeKind: station.removeKind, undo: station.undo,
  done: () => document.getElementById('done').click(),   // the primary button: Done → Confirm → Another bowl
  addToCart, removeFromCart, editFromCart, placeOrder, shop, skip: () => { if (show) show.skip = true; },
  pause(p = true) { paused = p; },
  advance(seconds, fps = 60) { paused = true; const n = Math.round(seconds * fps); for (let i = 0; i < n; i++) tick(1 / fps); render(1 / fps); return this.state; },
  get state() {
    const m = model(), s = station.inspect();
    return { count: m.count, total: m.total, pending: m.pending, phase, bowlNo, cart: cart.map((b) => ({ id: b.id, sig: b.signature, total: b.total, thumb: !!b.thumb })), lastOrder: lastOrder && { no: lastOrder.orderNo, total: lastOrder.quote.total, fee: lastOrder.quote.fee, method: lastOrder.fulfillment.method, charged: lastOrder.charged, sent: lastOrder.sent }, merchant: merchant.id, show: !!show, queue: s.queue, busy: busy(),
      bowl: s.bowl, stock: s.stock, restocking: s.restocking, pieces: s.pieces.length, tong: s.tong, jobs: s.jobs, max: BOWL_MAX };
  },
  screen(k, inBowl = false) { // screen px of a piece of a kind (for real click tests)
    const a = station.anchor(k, inBowl); if (!a) return null;
    const q = a.project(camera), r = canvas.getBoundingClientRect();
    return [Math.round(r.left + (q.x + 1) / 2 * r.width), Math.round(r.top + (1 - q.y) / 2 * r.height)];
  },
};
