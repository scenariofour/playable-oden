// The Oden station: the warmer and its broth, six kinds of oden, the tongs, your bowl and the staff's restock tray,
// and everything they do (pick, carry, set down, put back, undo, refill, simmer, steam, drip).
// It is one Three.js group with no page, renderer, camera, lights or prices of its own, so the same station stands on
// the standalone counter (main.js, the shop) or inside RIRRI'S World (index.html, no shop). The host places the
// group, says which camera looks at it, feeds it time, sends it picks, and decides what it says and what things cost.
//
// Every piece is one object that lives in exactly one place. A tap reserves a piece and queues it for the tongs; it
// joins the bowl when it touches the broth in the bowl, and leaves it when it is back in the pot. The bowl's contents
// (model()) are derived from where the pieces are, so nothing shown can disagree with the bowl. Empty compartments
// get restocked from a tray. State changes at once on a pick; the motion only shows it.
//
// Station space: everything here is placed in the group's own frame (metres, y = 0 on the counter, +z toward the
// customer). The shaders that need positions (broth, waterlines) work in that frame too, through uToS / uFromS, so
// the host may move, turn or scale the whole group.
import * as THREE from 'three';
import { createSoftShadow, createEnvironment } from './set.js';
import { createOdenCase, createBowl, createTongs, createTray, createTongHolder, createWarmerBody } from './props.js';
import { FOODS, ORDER, createFood, createFoodMaterial } from './foods.js';
import { createBroth, createNeck } from './broth.js';
import { createSteam, createDrips, createBubbles } from './fx.js';
import { createTag } from './tags.js';
import { Spring, ease, clamp, lerp, tween, bezier3 } from './motion.js';

export { FOODS, ORDER, createEnvironment }; // (a host without a room of its own paints one: RIRRI'S)
export const BOWL_MAX = 8;
export const DECK = 0.034, CASE_H = 0.064, SUNK = -(CASE_H - 0.007); // the well sinks into whatever it stands in
const SNAP = 0.0055, BROTH = 0xd9a862;
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const rnd = Math.random;

// The warmer is built for the layout. The compartments come from the menu; ARRANGE only says which kind goes where.
const ARRANGE = { 3: ['chikuwa', 'konnyaku', 'tsumire', 'egg', 'daikon', 'kinchaku'], 2: ['tsumire', 'konnyaku', 'chikuwa', 'kinchaku', 'egg', 'daikon'] };

// Where each kind sits in its compartment (cell-local x, z, yaw, tilt about x, tilt about z, lift). The last entry is
// an overflow spot for a piece put back into a full compartment. Long things lie front-to-back so the tongs, which
// squeeze left–right, take them across the middle.
const HOMES = {
  daikon: [[-0.029, -0.024, 0.3], [0.03, -0.023, 1.3], [-0.028, 0.028, 2.2, 0.16, 0, 0.004], [0.03, 0.029, 0.9, 0.14, 0.04, 0.004], [0, 0, 0.7, 0, 0, 0.024]],
  egg: [[-0.027, -0.025, 1.45], [0.028, -0.023, 1.75], [-0.025, 0.026, 1.6], [0.029, 0.027, 1.3], [0.001, 0.001, 0.2, 0, 0, 0.022], [0.0, 0.0, 1.5, 0, 0, 0.034]],
  kinchaku: [[-0.03, -0.026, 0.4, 0.07, 0], [0.03, -0.025, 2.0, -0.06, 0.05], [-0.028, 0.028, 1.1, 0, -0.08], [0.031, 0.027, 2.7, 0.06, 0.04], [0, 0, 0.5, 0, 0, 0.02]],
  chikuwa: [[-0.042, 0.004, 1.38], [-0.014, -0.006, 1.66], [0.014, 0.006, 1.47], [0.043, -0.004, 1.74], [0.0, 0.0, 0.2, 0, 0, 0.026]],
  konnyaku: [[-0.026, -0.024, 0.0, 0.2, 0, 0.004], [0.028, -0.022, 3.14, 0.22, 0, 0.004], [-0.024, 0.026, 1.0, -0.17, 0, 0.004], [0.026, 0.028, 2.3, -0.2, 0, 0.004], [0.0, 0.002, 0.5, 0, 0, 0.012], [0, 0, 1.4, 0, 0, 0.026]],
  tsumire: [[-0.042, 0.022, Math.PI / 2, 0, 0.3, 0.013], [-0.014, 0.024, Math.PI / 2, 0, 0.32, 0.013], [0.014, 0.022, Math.PI / 2, 0, 0.29, 0.013], [0.042, 0.024, Math.PI / 2, 0, 0.31, 0.013], [0, -0.02, Math.PI / 2, 0, 0.2, 0.03]],
};
// In the bowl: x, z (bowl-local) and an extra twist. First the back, then the front, then the middle, then on top.
const SLOTS = [[-0.03, -0.024, 0.3], [0.031, -0.022, -0.4], [-0.04, 0.02, 0.9], [0.041, 0.022, -0.8], [0.0, 0.034, 0.2], [0.0, -0.002, 1.4], [-0.016, 0.01, 2.4], [0.02, 0.008, -2.0]];

// hooks (all optional):
//   change(model)          the bowl or the case changed (model() below)
//   landed(piece, toBowl, pos)   a piece was set down in the bowl / put back in the pot (pos: station space)
//   toast(text)            a short notice (bowl full, sold out, restocking)
//   say(text)              something for a screen reader
//   locked()               a pick arrived while the host has locked the station (lock(true))
// prices: false draws the in-world cards with name and stock only (RIRRI'S); true adds the demo price (the shop).
export function createStation({ prices = true, hooks = {} } = {}) {
  const H = { change() {}, landed() {}, toast() {}, say() {}, locked() {}, ...hooks };
  const root = new THREE.Group(); root.name = 'odenStation';
  const uToS = { value: new THREE.Matrix4() }, uFromS = { value: new THREE.Matrix4() }; // world → station, station → world
  const uTime = { value: 0 };
  const shared = { uKeyDirView: { value: new THREE.Vector3(0, 1, 0) }, uToS };
  const lampU = { value: new THREE.Vector3(0, 0.3, 0) }; // the lamp the broth mirrors, station space
  const keyDir = new THREE.Vector3(0.16, 0.85, -0.6);    // where the key light comes from, station space
  let camera = null, viewH = 800, locked = false, rest = null; // rest: shared materials per kind (setDetail)
  let env = null, envK = 1;

  // a host without scene.environment (RIRRI'S) hands the station its own reflections
  function dress(o) {
    if (!env) return o;
    o.traverse((m) => { for (const x of m.material ? [].concat(m.material) : []) if (x.isMeshStandardMaterial && !x.userData.envSet) { x.envMap = env; x.envMapIntensity *= envK; x.userData.envSet = true; x.needsUpdate = true; } });
    return o;
  }
  const put = (o) => { root.add(o); return dress(o); };

  // ---- the props ------------------------------------------------------------------------------------------------------
  let oc = null, potBroth = null, housing = null, CELL_OF = {};
  const holder = put(createTongHolder());
  const bowl = createBowl({ scale: 1.25 }); put(bowl.group);
  bowl.group.add(createSoftShadow((g, N) => { g.beginPath(); g.arc(N / 2, N / 2, N * 0.24, 0, Math.PI * 2); }, 0.2, 0.65));
  const tongs = createTongs(); put(tongs.group);
  const tray = createTray(); put(tray.group);
  const bubbles = createBubbles();
  const space = { uToS, uFromS };
  const bowlBroth = createBroth({ radius: 0.08, tint: 0xd9ab66, shallow: 0xf3e2bc, uTime, lamp: lampU, space });
  const neck = createNeck(BROTH), drips = createDrips(BROTH), steam = createSteam();
  for (const o of [bowlBroth.mesh, neck.mesh, drips.group, steam.points, bubbles.mesh]) put(o);

  const POT = {
    key: 'pot', group: null, broth: null, base: 0.026 + 0.0195, rim: CASE_H + 0.004, // group and broth: see buildCase
    contains(x, z, pad = 0) { const p = this.group.position; return Math.abs(x - p.x) < oc.hx + pad && Math.abs(z - p.z) < oc.hz + pad; },
  };
  const BOWL = {
    key: 'bowl', group: bowl.group, broth: bowlBroth, base: bowl.floorY + 0.012, rim: bowl.height,
    contains(x, z, pad = 0) { const p = this.group.position; return Math.hypot(x - p.x, z - p.z) < bowl.radiusAt(this.level.value) + pad; },
  };
  for (const c of [POT, BOWL]) { c.level = new Spring(c.base, 50, 10); c.cling = new Spring(0, 900, 16); c.clingXZ = new THREE.Vector2(); }
  const levelW = (c) => c.group.position.y + c.level.value;

  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  function homePose(k, i) {
    const cell = oc.cells[CELL_OF[k]], [x, z, yaw, tx = 0, tz = 0, dy = 0] = HOMES[k][Math.min(i, HOMES[k].length - 1)];
    const pos = new THREE.Vector3(cell.x + x, oc.floorY + dy, cell.z + z).add(oc.group.position);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tx, yaw, tz, 'YXZ'));
    return { pos, quat };
  }

  // ---- pieces ----------------------------------------------------------------------------------------------------------
  // state: 'pot' (free) · 'toBowl' (chosen, waiting for the tongs) · 'moving' · 'bowl' · 'toPot' (going back) · 'restock'
  //        · 'served' (left the station with the bowl, see takeBowl)
  const pieces = [];
  let nextId = 1;
  function makePiece(k, home) {
    const f = createFood(k, shared), s = f.def.settle;
    const p = {
      id: nextId++, key: k, def: f.def, mesh: f.mesh, u: f.u, home, slot: null, inBowl: false, state: 'pot', addedAt: 0,
      rest: oc ? homePose(k, home) : { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, tilt: new Spring(0, s.k, s.c), tiltAxis: new THREE.Vector3(1, 0, 0), // rest: placed with the layout if it isn't built yet
      drop: new Spring(0, 320, 24), squash: new Spring(0, s.sk, s.sc), press: new Spring(0, 500, 40), hover: new Spring(0, 120, 20), sel: new Spring(0, 90, 16),
      wet: 0.85, phase: rnd() * 6.283, flying: false, ownMat: f.mesh.material,
    };
    if (rest) p.mesh.material = rest[k].mat;
    put(p.mesh); pieces.push(p);
    return p;
  }
  for (const k of ORDER) for (let i = 0; i < FOODS[k].stock; i++) makePiece(k, i);

  const available = (k) => pieces.filter((p) => p.key === k && p.state === 'pot');
  function freeHome(k) {
    const used = new Set(pieces.filter((p) => p.key === k && p.home !== null).map((p) => p.home));
    for (let i = 0; i < HOMES[k].length; i++) if (!used.has(i)) return i;
    return HOMES[k].length - 1;
  }
  function freeSlot() { const used = new Set(pieces.filter((p) => p.slot !== null).map((p) => p.slot)); for (let i = 0; i < BOWL_MAX; i++) if (!used.has(i)) return i; return null; }

  // a slot's resting pose: on the bowl floor, or leaning on whatever already lies under it
  function slotPose(p, i) {
    const [sx, sz, twist] = SLOTS[i], bp = bowl.group.position;
    let y = bowl.floorAt(Math.hypot(sx, sz)), lean = null;
    for (const q of pieces) {
      if (q === p || !q.inBowl || q.slot === null || q.slot >= i || q.state === 'moving') continue;
      const [qx, qz] = SLOTS[q.slot], d = Math.hypot(sx - qx, sz - qz);
      if (d < (p.def.fr + q.def.fr) * 0.78) {
        const top = q.rest.pos.y - bp.y + q.def.h * 0.62;
        if (top > y) { y = top; lean = new THREE.Vector3(sx - qx, 0, sz - qz).normalize(); }
      }
    }
    if (p.key === 'tsumire') { // a skewer leans on the rim with its handle out, as it does in a real cup
      const r = Math.hypot(sx, sz), yaw = r > 0.01 ? Math.atan2(-sz, sx) : 0.4;
      return { pos: new THREE.Vector3(bp.x + sx, bp.y + y + 0.014, bp.z + sz), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0.62, 'YXZ')) };
    }
    tmpE.setFromQuaternion(p.rest.quat, 'YXZ');
    const quat = new THREE.Quaternion().setFromAxisAngle(UP, tmpE.y + twist);
    if (lean) quat.premultiply(tmpQ.setFromAxisAngle(new THREE.Vector3().crossVectors(UP, lean).normalize(), 0.2));
    return { pos: new THREE.Vector3(bp.x + sx, bp.y + y, bp.z + sz), quat };
  }

  // ---- the hand (tongs) -----------------------------------------------------------------------------------------------
  const QT = (() => {
    const Y = new THREE.Vector3(0.2, 0.8, -0.55).normalize(), X = new THREE.Vector3().crossVectors(UP, Y).normalize(), Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  })();
  const HAND = {
    pos: new THREE.Vector3(), quat: QT.clone(), gap: 0.026, ready: new THREE.Vector3(), shown: new THREE.Vector3(),
    idle: new Spring(1, 30, 11), lean: new Spring(0, 60, 14), swing: new Spring(0, 110, 7),
    offset: new THREE.Matrix4(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), prev: null, held: null, leanTo: new THREE.Vector3(),
  };
  // the tongs squeeze along their own X; turn them so that lines up with the piece's narrow side
  function gripQuatFor(p, quat) {
    if (!p.def.gripAxis) return QT.clone();
    const a = p.def.gripAxis.clone().applyQuaternion(quat).setY(0);
    if (a.lengthSq() < 1e-6) return QT.clone();
    const b = new THREE.Vector3(1, 0, 0).applyQuaternion(QT).setY(0);
    let th = Math.atan2(-a.z, a.x) - Math.atan2(-b.z, b.x);
    while (th > Math.PI / 2) th -= Math.PI; while (th < -Math.PI / 2) th += Math.PI;
    return new THREE.Quaternion().setFromAxisAngle(UP, clamp(th, -1.25, 1.25)).multiply(QT);
  }
  const M1 = new THREE.Matrix4(), M2 = new THREE.Matrix4(), M3 = new THREE.Matrix4(), S1 = new THREE.Vector3();
  const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3(), V5 = new THREE.Vector3(), Q1 = new THREE.Quaternion();
  const X_AXIS = new THREE.Vector3(1, 0, 0), LOW = new THREE.Vector3();

  // lowest point of a piece in a pose, from a sample of its outline
  function lowestY(p, pos, quat) {
    const r = p.def.bound.r * 0.8; let m = Infinity;
    for (const [x, z] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) m = Math.min(m, LOW.set(x, 0, z).applyQuaternion(quat).add(pos).y);
    return m;
  }

  // ---- the queue & choreography ------------------------------------------------------------------------------------------
  const queue = [], jobs = new Set(), history = [];
  let tongJob = null, simmerT = 0.5, tongSpeed = 1;

  function* transfer(a) {
    const p = a.piece, toBowl = a.kind === 'add', src = toBowl ? POT : BOWL, dst = toBowl ? BOWL : POT;
    const quick = queue.length > 0;
    p.state = 'moving'; p.goingIn = toBowl; p.tilt.set(0); p.drop.set(0); p.squash.set(0);
    const pos0 = p.rest.pos.clone(), quat0 = p.rest.quat.clone();
    const gripPos = p.def.gripC.clone().applyQuaternion(quat0).add(pos0), gripQuat = gripQuatFor(p, quat0);
    HAND.offset.copy(M1.compose(gripPos, gripQuat, ONE)).invert().multiply(M2.compose(pos0, quat0, ONE));
    p.u.uPinchDir.value.set(1, 0, 0).applyQuaternion(gripQuat).applyQuaternion(Q1.copy(quat0).invert());
    const open = p.def.halfW + 0.02, shut = p.def.halfW - 0.0011 * p.def.pinch;
    const pre = gripPos.clone().addScaledVector(UP, 0.04).addScaledVector(V1.set(0, 1, 0).applyQuaternion(gripQuat), 0.01);

    { const p0 = HAND.pos.clone(), q0 = HAND.quat.clone(), g0 = HAND.gap, d = quick ? 0.2 : 0.26;
      yield* tween(d, (u) => { const e = ease.inOutCubic(u); HAND.pos.lerpVectors(p0, pre, e); HAND.pos.y += Math.sin(Math.PI * e) * 0.014; HAND.quat.slerpQuaternions(q0, gripQuat, e); HAND.gap = lerp(g0, open, ease.outCubic(u)); }); }
    yield* tween(0.1, (u) => HAND.pos.lerpVectors(pre, gripPos, ease.outQuad(u)));
    yield* tween(0.07, (u) => { HAND.gap = lerp(open, p.def.halfW + 0.0005, ease.inQuad(u)); });
    HAND.held = p; HAND.swing.set(0);
    yield* tween(0.08, (u) => { const e = ease.outCubic(u); p.u.uPinch.value = e; HAND.gap = lerp(p.def.halfW + 0.0005, shut, e); });

    // lift: through the broth, a short pull while the surface clings, then up and clear of the rim
    const L = src.base + src.group.position.y, below = gripPos.y - lowestY(p, pos0, quat0);
    const y0 = HAND.pos.y, y1 = Math.max(y0, L - 0.0008 + below), y2 = L + SNAP + 0.0004 + below;
    const y3 = Math.max(L + 0.05, src.group.position.y + src.rim + 0.016) + below;
    const toward = V2.copy(dst.group.position).sub(src.group.position).setY(0).normalize().clone();
    neckState.armed = p.def.neckR > 0 && y0 < y1 + 0.0005; neckState.c = src; neckState.p = p;
    if (y1 > y0 + 0.0005) yield* tween(Math.max(0.08, (y1 - y0) / 0.09), (u) => { HAND.pos.y = lerp(y0, y1, ease.inOutSine(u)); });
    if (neckState.armed) { const ya = HAND.pos.y; yield* tween(quick ? 0.14 : 0.22, (u) => { HAND.pos.y = lerp(ya, y2, ease.inQuad(u)); }); }
    { const p0 = HAND.pos.clone(); yield* tween(0.3, (u) => { const e = ease.outCubic(u); HAND.pos.set(p0.x + toward.x * 0.012 * e, lerp(p0.y, y3, e), p0.z + toward.z * 0.012 * e); }); }
    drips.hang(lowestRim, { delay: 0.02, grow: 0.18, r: 0.0024 });
    if (!quick) drips.hang(lowestRim, { delay: 0.12, grow: 0.18, r: 0.002 });
    { const y = HAND.pos.y; yield* tween(quick ? 0.08 : 0.18, (u) => { HAND.pos.y = y - Math.sin(Math.PI * u) * 0.002; }); } // a beat to let it drip

    // carry, turning to the resting angle on the way
    const end = toBowl ? slotPose(p, a.slot) : homePose(p.key, a.home);
    M3.compose(end.pos, end.quat, ONE).multiply(M1.copy(HAND.offset).invert());
    const gripEnd = new THREE.Vector3(), qEnd = new THREE.Quaternion(); M3.decompose(gripEnd, qEnd, S1);
    const belowEnd = gripEnd.y - lowestY(p, end.pos, end.quat);
    const hov = gripEnd.clone(); hov.y = Math.max(levelW(dst) + 0.045, dst.group.position.y + dst.rim + 0.016) + belowEnd;
    { const p0 = HAND.pos.clone(), q0 = HAND.quat.clone(), d = hov.clone().sub(p0), dur = clamp(0.3 + d.length() * 1.0, 0.42, 0.68);
      const p1 = p0.clone().addScaledVector(d, 0.3).addScaledVector(UP, 0.02), p2 = hov.clone().addScaledVector(d, -0.3).addScaledVector(UP, 0.02);
      yield* tween(dur, (u) => { const e = ease.inOutSine(u); bezier3(HAND.pos, p0, p1, p2, hov, e); HAND.quat.slerpQuaternions(q0, qEnd, e); }); }
    // set it down: ease to the surface, then sink through the broth
    const ySurf = Math.max(levelW(dst) + 0.0012 + belowEnd, gripEnd.y + 0.0016), yRest = gripEnd.y + 0.0016;
    yield* tween(0.18, (u) => { HAND.pos.y = lerp(hov.y, ySurf, ease.outCubic(u)); });
    yield* tween(0.18, (u) => { HAND.pos.y = lerp(ySurf, yRest, ease.inOutSine(u)); });

    // commit: it is in your bowl now (or back in the pot)
    p.inBowl = toBowl;
    if (toBowl) { p.home = null; p.addedAt = performance.now(); } else { p.slot = null; p.home = a.home; }
    steam.burst(V1.copy(end.pos).setY(levelW(dst) + 0.006), toBowl ? 6 : 3, 0.02, 0.085);

    // let go, with each kind's own settle
    const s = p.def.settle, swing = HAND.swing.value;
    HAND.held = null;
    p.rest = end; p.state = toBowl ? 'bowl' : 'pot'; p.sel.target = 0;
    p.drop.set(0.0016); p.drop.target = 0;
    p.squash.v = s.squash;
    p.tiltAxis.set(1, 0, 0).applyQuaternion(s.axis === 'long' ? end.quat : HAND.quat).setY(0).normalize();
    p.tilt.set(swing * 0.5); p.tilt.target = 0; p.tilt.v = s.tilt * (rnd() < 0.5 ? -1 : 1) * 4;
    for (const q of pieces) if (q !== p && q.state === (toBowl ? 'bowl' : 'pot') && q.rest.pos.distanceTo(end.pos) < 0.07) { q.squash.v += q.def.settle.squash * 0.35; q.drop.v -= 0.012; } // its neighbours give a little
    if (!toBowl) resettleBowl();
    refresh();
    H.landed(p, toBowl, end.pos);
    yield* tween(0.1, (u) => { const e = ease.outCubic(u); p.u.uPinch.value = 1 - e; HAND.gap = lerp(shut, open, e); });
    if (toBowl && p.undoOnLand) { p.undoOnLand = false; remove(p); } // undone while it was in the tongs: straight back
  }

  function* retreat() {
    const p0 = HAND.pos.clone(), q0 = HAND.quat.clone(), g0 = HAND.gap, up = p0.clone().addScaledVector(UP, 0.035);
    let t = 0;
    while (t < 0.64) {
      if (queue.length) return false;
      t += yield;
      const u = Math.min(1, t / 0.64), e = ease.inOutCubic(clamp((u - 0.22) / 0.78, 0, 1));
      if (u <= 0.22) HAND.pos.lerpVectors(p0, up, ease.outQuad(u / 0.22)); else HAND.pos.lerpVectors(up, HAND.ready, e);
      HAND.quat.slerpQuaternions(q0, QT, e); HAND.gap = lerp(g0, 0.026, e);
    }
    return true;
  }
  function* tongWorker() {
    for (;;) {
      while (queue.length) yield* transfer(queue.shift());
      const done = yield* retreat();
      if (done && !queue.length) return;
    }
  }
  function kick() { if (!tongJob) { tongJob = tongWorker(); tongJob.next(); } }

  // pieces left in the bowl drop into the space a removed one leaves
  function resettleBowl() {
    for (const q of pieces.filter((x) => x.inBowl && x.state === 'bowl').sort((a, b) => a.slot - b.slot)) {
      const np = slotPose(q, q.slot), dy = q.rest.pos.y - np.pos.y;
      if (Math.abs(dy) > 0.001) { q.rest = np; q.drop.set(dy + q.drop.value); q.drop.target = 0; q.squash.v = q.def.settle.squash * 0.5; }
    }
  }

  // ---- actions ---------------------------------------------------------------------------------------------------------
  function add(p) {
    if (locked) return H.locked();
    if (p.state !== 'pot') return;
    const slot = freeSlot();
    if (slot === null) return H.toast(`Your bowl is full · ${BOWL_MAX} pieces is plenty`);
    p.state = 'toBowl'; p.slot = slot; p.sel.target = 1;
    p.drop.v = 0.07; p.squash.v = -p.def.settle.squash * 0.6;           // it answers at once: a little bob in the broth
    POT.broth.impulse(p.rest.pos.x, p.rest.pos.z, 0.00009, p.def.fr * 0.9);
    queue.push({ kind: 'add', piece: p, slot }); history.push(p.id);
    tagPulse[p.key] = 1;
    kick(); refresh();
  }
  function addKind(k) {
    if (locked) return H.locked();
    const list = available(k).sort((a, b) => b.rest.pos.z - a.rest.pos.z); // the nearest one first
    if (!list.length) return H.toast(cells[k].restocking ? `${FOODS[k].en} is being restocked · one moment` : `${FOODS[k].en} is sold out · restocking soon`);
    add(list[0]);
  }
  function remove(p) {
    if (locked) return H.locked();
    if (p.state === 'toBowl') return cancel(p);
    if (p.state !== 'bowl') return;
    p.state = 'toPot'; p.sel.target = 1;
    const home = freeHome(p.key); p.home = home;
    queue.push({ kind: 'remove', piece: p, home });
    kick(); refresh();
  }
  function cancel(p) {
    const i = queue.findIndex((a) => a.piece === p); if (i >= 0) queue.splice(i, 1);
    p.state = 'pot'; p.slot = null; p.sel.target = 0; refresh();
  }
  function removeKind(k) {
    if (locked) return H.locked();
    const waiting = pieces.filter((p) => p.key === k && p.state === 'toBowl');
    if (waiting.length) return cancel(waiting[waiting.length - 1]);
    const list = pieces.filter((p) => p.key === k && p.state === 'bowl').sort((a, b) => b.addedAt - a.addedAt);
    if (list.length) remove(list[0]);
  }
  function undoLast() {
    if (locked) return H.locked();
    while (history.length) {
      const id = history.pop(), p = pieces.find((x) => x.id === id);
      if (!p) continue;
      if (p.state === 'toBowl') return cancel(p);
      if (p.state === 'bowl') return remove(p);
      if (p.state === 'moving' && p.goingIn) { p.undoOnLand = true; return; } // in the tongs: it goes back once it lands
    }
  }
  // everything back into the pot, top of the bowl first; whatever is still on its way in turns round when it lands
  function emptyBowl() {
    if (locked) return H.locked();
    for (const p of pieces.filter((x) => x.state === 'toBowl')) cancel(p);
    for (const p of pieces) if (p.state === 'moving' && p.goingIn) p.undoOnLand = true;
    for (const p of pieces.filter((x) => x.state === 'bowl').sort((a, b) => b.slot - a.slot)) remove(p);
    history.length = 0; refresh();
  }

  // ---- the bowl's contents (derived from the pieces) -----------------------------------------------------------------------
  function model() {
    const lines = [];
    let count = 0, pending = 0;
    for (const k of ORDER) {
      const mine = pieces.filter((p) => p.key === k);
      const qty = mine.filter((p) => p.inBowl).length, adding = mine.filter((p) => !p.inBowl && p.slot !== null).length;
      const leaving = mine.filter((p) => p.inBowl && p.state !== 'bowl').length;
      count += qty; pending += adding + leaving;
      if (qty || adding) lines.push({ key: k, qty, adding, leaving, avail: available(k).length });
    }
    const canUndo = history.some((id) => { const p = pieces.find((x) => x.id === id); return p && (p.state === 'bowl' || p.state === 'toBowl'); });
    const menu = ORDER.map((k) => ({ key: k, avail: available(k).length, restocking: cells[k].restocking,
      qty: pieces.filter((p) => p.key === k && p.inBowl).length, adding: pieces.filter((p) => p.key === k && !p.inBowl && p.slot !== null).length }));
    return { lines, count, pending, full: freeSlot() === null, canUndo, menu };
  }
  let lastModel = '', hoverPiece = null, hoverTag = null;
  function refresh() {
    const m = model(), s = JSON.stringify(m);
    if (s !== lastModel) { lastModel = s; H.change(m); }
    for (const k of ORDER) tags[k].draw({ avail: available(k).length, stock: FOODS[k].stock, restocking: cells[k].restocking, hover: hoverTag === k });
  }

  // ---- leaving with the bowl (the shop) -----------------------------------------------------------------------------------
  // The pieces in the bowl leave the station with it: the host has them now. The motion is separate (serveMotion).
  function takeBowl() {
    const served = pieces.filter((p) => p.inBowl);
    for (const p of served) { p.state = 'served'; p.inBowl = false; p.slot = null; p.home = null; p.sel.target = 0; }
    history.length = 0; hoverPiece = null; refresh();
    return served;
  }
  // the bowl lifts and slides off along `out`; a fresh one is set down from the front. Returns the motion (a generator
  // the host runs) and `end`, which lands it in its final state at once; onEnd runs either way.
  function serveMotion(served, out, onEnd) {
    const base = bowl.group.position.clone(), rests = served.map((p) => p.rest.pos.clone()), off = new THREE.Vector3();
    const place = () => { bowl.group.position.copy(base).add(off); served.forEach((p, i) => p.rest.pos.copy(rests[i]).add(off)); };
    for (const p of served) { p.drop.v = 0.08; p.squash.v = -p.def.settle.squash * 0.6; } // a last little hop as it is picked up
    let gone = false;
    const clear = () => {
      if (gone) return; gone = true;
      for (const p of served) { root.remove(p.mesh); p.ownMat.dispose(); pieces.splice(pieces.indexOf(p), 1); }
      BOWL.level.set(BOWL.base);
    };
    const end = () => { clear(); off.set(0, 0, 0); place(); onEnd(); };
    const gen = (function* () {
      yield* tween(0.14, (u) => { off.set(0, 0.012 * ease.outQuad(u), 0); place(); });
      yield* tween(0.42, (u) => { const e = ease.inCubic(u); off.set(out.x * e, 0.012 + out.y * e, out.z * e); place(); });
      clear();
      yield* tween(0.46, (u) => { const k = 1 - ease.outCubic(u); off.set(0, Math.sin(Math.PI * u) * 0.006, 0.3 * k); place(); });
      BOWL.broth.impulse(base.x, base.z, 0.0001, 0.03);
      end();
    })();
    return { gen, end };
  }
  // a bowl comes back (from the shop's cart): lines [{ id, qty }] go straight into the empty bowl
  function fillBowl(lines) {
    let i = 0;
    for (const l of lines) for (let n = 0; n < l.qty; n++) {
      const p = makePiece(l.id, 0); p.home = null; p.slot = freeSlot(); p.inBowl = true; p.state = 'bowl'; p.addedAt = performance.now() + i;
      p.rest = slotPose(p, p.slot); p.drop.set(0.02 + i++ * 0.006); p.drop.target = 0; p.mesh.position.copy(p.rest.pos);
    }
    refresh();
  }

  // ---- price cards & restock ----------------------------------------------------------------------------------------------
  const tags = {}, cells = {}, tagPulse = {};
  for (const k of ORDER) { tags[k] = createTag(FOODS[k], { price: prices }); cells[k] = { restocking: false, at: null }; tagPulse[k] = 0; }

  function buildCase(cols) {
    const pref = ARRANGE[cols] || [], keys = [...pref.filter((k) => ORDER.includes(k)), ...ORDER.filter((k) => !pref.includes(k))];
    const rows = Math.ceil(keys.length / cols), old = oc;
    oc = createOdenCase({ cols, rows, floorY: 0.026, divTop: 0.046, height: CASE_H }); oc.cols = cols; put(oc.group);
    CELL_OF = Object.fromEntries(keys.map((k, i) => [k, i]));
    oc.group.add(cols >= rows
      ? createSoftShadow((g, N) => { g.beginPath(); g.roundRect(N * 0.1, N * 0.24, N * 0.8, N * 0.52, N * 0.05); }, 0.5, 0.6)
      : createSoftShadow((g, N) => { g.beginPath(); g.roundRect(N * 0.24, N * 0.1, N * 0.52, N * 0.8, N * 0.05); }, 0.5, 0.6));
    // cards: on the back deck for the back row, on the front deck for the front row. On a phone the cards would be
    // too small to read, so the shop's menu strip carries the prices instead.
    for (const k of ORDER) {
      const t = tags[k], cell = oc.cells[CELL_OF[k]];
      t.mesh.visible = cols > 2 && (cell.row === 0 || cell.row === rows - 1);
      if (cell.row === 0) { t.mesh.position.set(cell.x, oc.height + 0.019, -oc.hz - oc.wall - 0.012); t.mesh.rotation.x = -0.5; } // behind the skewers
      else { t.mesh.position.set(cell.x, oc.height + 0.012, oc.hz + oc.wall + 0.02); t.mesh.rotation.x = -1.0; }
      oc.group.add(t.mesh);
    }
    if (potBroth) root.remove(potBroth.mesh);
    potBroth = createBroth({ halfX: oc.hx, halfZ: oc.hz, corner: oc.inR, tint: 0xdcb86c, uTime, lamp: lampU, space });
    put(potBroth.mesh);
    POT.group = oc.group; POT.broth = potBroth;
    if (old) { root.remove(old.group); old.group.traverse((o) => { if (o.isMesh && !o.name.startsWith('tag-')) o.geometry.dispose(); }); }
  }

  // When a compartment runs empty, the staff's tray slides in from behind and tips fresh pieces in.
  function* restock(k) {
    const cs = cells[k]; cs.restocking = true; refresh();
    const cell = oc.cells[CELL_OF[k]], used = new Set(pieces.filter((p) => p.key === k && p.home !== null).map((p) => p.home)), vacant = [];
    for (let i = 0; i < FOODS[k].stock; i++) if (!used.has(i)) vacant.push(i);
    // laid out on the tray in a grid sized to the kind
    const step = FOODS[k].fr * 1.9, cols = Math.max(1, Math.min(vacant.length, Math.floor(0.14 / step))), rows = Math.ceil(vacant.length / cols);
    const fresh = vacant.map((h, j) => { const p = makePiece(k, h); p.state = 'restock'; p.wet = 1;
      p.trayX = ((j % cols) - (cols - 1) / 2) * step; p.trayZ = (Math.floor(j / cols) - (rows - 1) / 2) * step * (k === 'tsumire' ? 0.6 : 1); return p; });
    const over = new THREE.Vector3(cell.x, 0, cell.z).add(oc.group.position);
    const start = over.clone().add(new THREE.Vector3(0.04, 0.34, -0.42)), above = over.clone().add(new THREE.Vector3(0, oc.height + 0.07, -0.035));
    const onTray = () => {
      tray.group.updateMatrix();
      for (const p of fresh) if (p.state === 'restock' && !p.flying) {
        const yaw = new THREE.Euler().setFromQuaternion(homePose(k, p.home).quat, 'YXZ').y;
        M1.compose(V1.set(p.trayX, 0.0015, p.trayZ), tmpQ.setFromAxisAngle(UP, k === 'tsumire' ? 0 : yaw), ONE).premultiply(tray.group.matrix);
        M1.decompose(p.mesh.position, p.mesh.quaternion, S1);
      }
    };
    tray.group.visible = true;
    yield* tween(0.6, (u) => { const e = ease.outCubic(u); tray.group.position.lerpVectors(start, above, e); tray.group.rotation.set(0.3 * (1 - e), 0, 0); onTray(); });
    yield* tween(0.2, (u) => { tray.group.rotation.x = -0.38 * ease.inOutSine(u); onTray(); });
    const t0 = uTime.value, legs = fresh.map((p, j) => {
      const from = p.mesh.position.clone(), to = homePose(k, p.home); p.flying = true;
      return { p, from, q0: p.mesh.quaternion.clone(), to, t: j * 0.09, ctrl: from.clone().lerp(to.pos, 0.5).add(new THREE.Vector3(0, 0.03, 0)), landed: false };
    });
    while (legs.some((l) => !l.landed)) {
      yield;
      const t = uTime.value - t0;
      for (const l of legs) {
        if (l.landed) continue;
        const u = clamp((t - l.t) / 0.34, 0, 1), e = ease.inQuad(u), s = 1 - e;
        l.p.mesh.position.set(0, 0, 0).addScaledVector(l.from, s * s).addScaledVector(l.ctrl, 2 * s * e).addScaledVector(l.to.pos, e * e);
        l.p.mesh.quaternion.slerpQuaternions(l.q0, l.to.quat, ease.outCubic(u));
        if (u >= 1) {
          l.landed = true; l.p.flying = false; l.p.rest = l.to; l.p.state = 'pot';
          l.p.drop.set(0.003); l.p.drop.target = 0; l.p.squash.v = l.p.def.settle.squash;
          potBroth.impulse(l.to.pos.x, l.to.pos.z, 0.00012, l.p.def.fr * 0.8);
          steam.burst(V1.copy(l.to.pos).setY(levelW(POT) + 0.006), 3, 0.014, 0.12);
          refresh();
        }
      }
    }
    yield* tween(0.5, (u) => { const e = ease.inOutCubic(u); tray.group.position.lerpVectors(above, start, e); tray.group.rotation.x = lerp(-0.38, 0.3, e); });
    tray.group.visible = false;
    cs.restocking = false; cs.at = null; refresh();
    H.say(`${FOODS[k].en} restocked.`);
  }

  // ---- detail ----------------------------------------------------------------------------------------------------------------
  // 'rest': nobody is at the counter (RIRRI'S, walking past): the pieces of a kind share one material, so the case costs
  // six material changes instead of one per piece. Nothing to touch from there, so hover, press, pinch and the chosen
  // glow aren't needed; each piece keeps its place. 'near' (the default): every piece answers on its own again.
  function setDetail(mode) {
    if ((mode === 'rest') === !!rest) return;
    if (mode === 'rest') {
      rest = Object.fromEntries(ORDER.map((k) => { const m = createFoodMaterial(k, shared); m.u.uLevel.value = levelW(POT); dress({ traverse: (f) => f({ material: m.mat }) }); return [k, m]; }));
      for (const p of pieces) p.mesh.material = rest[p.key].mat;
    } else {
      for (const p of pieces) p.mesh.material = p.ownMat;
      for (const m of Object.values(rest)) m.mat.dispose();
      rest = null;
    }
  }

  // ---- layout ------------------------------------------------------------------------------------------------------------------
  // L: { cols, caseZ, caseY?, bowl: [x, z | null], holder: 'bowl' | 'case', housing?: { h, deck, label } }
  // caseY defaults to SUNK (the well sunk into the host's counter, which cuts the opening); with `housing` the station
  // brings its own countertop body and the well sinks into that instead.
  let layoutL = null;
  function layout(L) {
    layoutL = L;
    if (!oc || oc.cols !== L.cols) buildCase(L.cols);
    if (housing) { root.remove(housing); housing = null; }
    let caseY = L.caseY ?? SUNK;
    if (L.housing) {
      caseY = SUNK + L.housing.h;
      housing = createWarmerBody({ hx: oc.hx + oc.wall, hz: oc.hz + oc.wall, ...L.housing });
      const [X, Z] = housing.userData.size, S = Math.max(X, Z) * 2.5;
      housing.add(createSoftShadow((g, N) => { const w = N * X * 2.15 / S, d = N * Z * 2.15 / S; g.beginPath(); g.roundRect((N - w) / 2, (N - d) / 2, w, d, N * 0.03); }, S, 0.55));
      housing.position.set(0, 0, L.caseZ); put(housing);
    }
    oc.group.position.set(0, caseY, L.caseZ);
    const deck = L.housing ? L.housing.deck : DECK;
    const bz = L.bowl[1] ?? L.caseZ + oc.hz + oc.wall + deck + bowl.rimR + 0.015;
    bowl.group.position.set(L.bowl[0], 0, bz);
    if (L.holder === 'bowl') holder.position.set(bowl.rimR + 0.058, 0, bz - 0.03); // beside the bowl: the case already fills the width
    else holder.position.set(oc.group.position.x + oc.hx + oc.wall + deck + 0.032, 0, oc.group.position.z - oc.hz * 0.55);
    HAND.ready.copy(holder.position).add(V1.set(0, 0.03, 0)); // the tongs rest in their cup between picks
    lampU.value.copy(oc.group.position).add(V1.set(0, 0.32, 0.02));
    oc.group.updateMatrixWorld();
    for (const p of pieces) if (p.state === 'pot') p.rest = homePose(p.key, p.home);
    for (const p of pieces.filter((x) => x.inBowl).sort((a, b) => a.slot - b.slot)) p.rest = slotPose(p, p.slot);
    POT.level.set(POT.base); BOWL.level.set(BOWL.base + 0.0006 * pieces.filter((p) => p.inBowl).length);
    if (!tongJob) HAND.pos.copy(HAND.ready);
  }

  // ---- picking ---------------------------------------------------------------------------------------------------------------
  // ray: a world-space THREE.Ray. Returns { piece } or { tag: key } (the nearest), or null.
  const raycaster = new THREE.Raycaster(), sph = new THREE.Sphere();
  function pick(ray) {
    raycaster.ray.copy(ray);
    const k0 = root.matrixWorld.getMaxScaleOnAxis();
    let best = null, bestT = Infinity;
    for (const p of pieces) {
      if (p.state !== 'pot' && p.state !== 'bowl' && p.state !== 'toBowl') continue;
      sph.center.copy(p.def.bound.c).applyMatrix4(p.mesh.matrixWorld); sph.radius = p.def.bound.r * 1.02 * k0;
      if (ray.intersectSphere(sph, V3)) { const t = V3.distanceTo(ray.origin); if (t < bestT) { bestT = t; best = { piece: p }; } }
    }
    for (const k of ORDER) {
      if (!tags[k].mesh.visible) continue;
      const hit = raycaster.intersectObject(tags[k].mesh, false)[0];
      if (hit && hit.distance < bestT) { bestT = hit.distance; best = { tag: k }; }
    }
    return best;
  }
  function act(target) {
    if (!target) return;
    if (target.tag) return addKind(target.tag);
    const p = target.piece;
    if (p.state === 'pot') add(p); else if (p.state === 'bowl') remove(p); else if (p.state === 'toBowl') cancel(p);
  }
  // a finger (or the mouse button) is down on a target: it gives under it, and the broth answers
  function press(target, on) {
    if (!target) return;
    if (target.piece) {
      const p = target.piece; p.press.target = on ? 1 : 0;
      if (on) (p.inBowl ? BOWL : POT).broth.impulse(p.mesh.position.x, p.mesh.position.z, 0.00005, p.def.fr);
    } else if (on) tagPulse[target.tag] = 1;
  }
  function hover(target) {
    const hp = target && target.piece ? target.piece : null, ht = target && target.tag ? target.tag : null;
    if (hp === hoverPiece && ht === hoverTag) return;
    hoverPiece = hp; hoverTag = ht; refresh();
  }

  // ---- broth helpers -------------------------------------------------------------------------------------------------------------
  const neckState = { armed: false, c: null, p: null };
  const RIM16 = Array.from({ length: 16 }, (_, i) => [Math.cos(i / 16 * Math.PI * 2), Math.sin(i / 16 * Math.PI * 2)]);
  // the point a drip hangs from: the held piece's lowest rim point, nudged toward the camera so the drip reads
  function lowestRim(out) {
    const p = HAND.held; if (!p) return null;
    if (![POT, BOWL].some((c) => c.contains(p.mesh.position.x, p.mesh.position.z))) return null;
    const cam = camera ? V5.copy(camera.position).applyMatrix4(uToS.value) : V5.set(0, 1, 1);
    const toCam = V4.subVectors(cam, p.mesh.position).setY(0).normalize(), r = p.def.fr * 0.85;
    let best = Infinity;
    for (const [cx, sz] of RIM16) {
      const w = V3.set(p.def.gripC.x + cx * r, 0, p.def.gripC.z + sz * r).applyMatrix4(p.mesh.matrix);
      const score = w.y - 0.0025 * ((w.x - p.mesh.position.x) * toCam.x + (w.z - p.mesh.position.z) * toCam.z) / r;
      if (score < best) { best = score; out.copy(w); }
    }
    return out;
  }
  function land(p, prev, r) {
    for (const c of [POT, BOWL]) {
      if (!c.contains(p.x, p.z)) continue;
      if (p.y <= levelW(c)) { c.broth.impulse(p.x, p.z, 0.00004 + r * 0.03, 0.001); return true; }
    }
    return p.y <= 0.0005;
  }
  function snap(c, bottom, p) {
    neckState.armed = false; neck.mesh.visible = false; c.cling.target = 0;
    c.broth.impulse(bottom.x, bottom.z, 0.00013, 0);
    c.broth.impulse(bottom.x, bottom.z, 0.00008, p.def.fr * 0.85);
    drips.fling(new THREE.Vector3(bottom.x, bottom.y - 0.0025, bottom.z), new THREE.Vector3(0, -0.04, 0), 0.0022);
    p.wet = 1;
  }
  function splash(c, b, p) {
    const L = levelW(c);
    for (let i = 0; i < 2; i++) {
      const a = rnd() * Math.PI * 2, r = p.def.fr * 1.05;
      drips.fling(new THREE.Vector3(b.x + Math.cos(a) * r, L + 0.001, b.z + Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * 0.012, 0.15 + rnd() * 0.06, Math.sin(a) * 0.012), 0.001);
    }
  }

  // ---- steam -----------------------------------------------------------------------------------------------------------------
  // each compartment breathes on its own, so the steam has some texture instead of one even sheet
  steam.addEmitter({ size: 0.03, alpha: 0.085, life: 2.4, grow: 4.2, rate: () => 3.2 * oc.cells.length, sample: (o) => { const cell = oc.cells[(rnd() * oc.cells.length) | 0];
    o.set(oc.group.position.x + cell.x + (rnd() - 0.5) * oc.cellW * 0.85, levelW(POT) + 0.004, oc.group.position.z + cell.z + (rnd() - 0.5) * oc.cellD * 0.85); } });
  steam.addEmitter({ size: 0.024, alpha: 0.08, life: 2.2, grow: 4, rate: () => 2 + pieces.filter((p) => p.inBowl).length * 1.6, sample: (o) => { const p = bowl.group.position, a = rnd() * 6.283, r = Math.sqrt(rnd()) * 0.055; o.set(p.x + Math.cos(a) * r, levelW(BOWL) + 0.004, p.z + Math.sin(a) * r); } });
  steam.addEmitter({ size: 0.014, alpha: 0.13, rate: () => (HAND.held ? 12 : 0), sample: (o) => { const p = HAND.held; if (!p) return o.set(0, -1, 0); o.copy(p.def.bound.c).add(V4.set((rnd() - 0.5) * p.def.fr, p.def.h * 0.4, (rnd() - 0.5) * p.def.fr)); o.applyMatrix4(p.mesh.matrix); } });

  // ---- bubbles: the visible simmer ------------------------------------------------------------------------------------
  // A gentle simmer, not a boil: a dozen small domes a second, mostly hugging the food and the compartment walls where a
  // real pot bubbles, each popping with a faint ripple. The bowl, off the heat, only now and then.
  let bubbleT = 0;
  function spawnBubbles(dt) {
    bubbleT -= dt;
    while (bubbleT <= 0) {
      bubbleT += 1 / 11;
      const inPot = pieces.filter((p) => p.state === 'pot');
      let x, z;
      if (rnd() < 0.6 && inPot.length) { const q = inPot[(rnd() * inPot.length) | 0], a = rnd() * 6.283; x = q.rest.pos.x + Math.cos(a) * q.def.fr * 1.08; z = q.rest.pos.z + Math.sin(a) * q.def.fr * 1.08; }
      else { // along a compartment wall
        const cell = oc.cells[(rnd() * oc.cells.length) | 0], side = (rnd() * 4) | 0, u = rnd() - 0.5;
        x = oc.group.position.x + cell.x + (side < 2 ? u * oc.cellW * 0.9 : (side === 2 ? -1 : 1) * oc.cellW * 0.46);
        z = oc.group.position.z + cell.z + (side >= 2 ? u * oc.cellD * 0.9 : (side === 0 ? -1 : 1) * oc.cellD * 0.46);
      }
      const n = 1 + ((rnd() * 2.2) | 0);
      for (let i = 0; i < n; i++) bubbles.spawn(POT, x + (rnd() - 0.5) * 0.007, z + (rnd() - 0.5) * 0.007, 0.0012 + rnd() * rnd() * 0.0026);
    }
    if (rnd() < dt * 0.8 && pieces.some((p) => p.inBowl)) { const bp = bowl.group.position, a = rnd() * 6.283, r = 0.03 + rnd() * 0.03; bubbles.spawn(BOWL, bp.x + Math.cos(a) * r, bp.z + Math.sin(a) * r, 0.001 + rnd() * 0.001); }
  }

  // ---- frame -----------------------------------------------------------------------------------------------------------------------
  const tipPrev = [null, null];
  function syncSpace() {
    root.updateMatrixWorld();
    uFromS.value.copy(root.matrixWorld); uToS.value.copy(root.matrixWorld).invert();
  }
  // dt: seconds since the last call (the host clamps it)
  function tick(dt) {
    uTime.value += dt; const t = uTime.value;
    syncSpace();
    // with picks waiting, the hand works a little faster (up to ~1.5×), so choosing several never feels like waiting
    tongSpeed += (1 + 0.17 * Math.min(queue.length, 3) - tongSpeed) * Math.min(1, dt * 4);
    if (tongJob && tongJob.next(dt * tongSpeed).done) tongJob = null;
    for (const j of jobs) if (j.next(dt).done) jobs.delete(j);

    // restock: a compartment refills a moment after its last piece has left it
    for (const k of ORDER) {
      const cs = cells[k];
      if (cs.restocking) continue;
      const empty = available(k).length === 0 && !pieces.some((p) => p.key === k && (p.state === 'toPot' || (p.state === 'moving' && p.home !== null)));
      if (!empty) { cs.at = null; continue; }
      if (cs.at === null) cs.at = t + 1.6;
      else if (t >= cs.at) { const g = restock(k); g.next(); jobs.add(g); }
    }

    // the hand
    if (HAND.prev) { V1.subVectors(HAND.pos, HAND.prev).divideScalar(dt); HAND.acc.lerp(V2.subVectors(V1, HAND.vel).divideScalar(dt), 0.3); HAND.vel.copy(V1); }
    HAND.prev = (HAND.prev || new THREE.Vector3()).copy(HAND.pos);
    const zH = V3.set(1, 0, 0).applyQuaternion(HAND.quat).cross(UP).normalize();
    HAND.swing.target = HAND.held ? clamp(HAND.acc.dot(zH) / 9.8 * 0.55, -0.12, 0.12) : 0; HAND.swing.step(dt);
    HAND.idle.target = tongJob ? 0 : 1; HAND.idle.step(dt);
    HAND.lean.target = hoverPiece && hoverPiece.state === 'pot' && !tongJob && !locked ? 1 : 0; HAND.lean.step(dt);
    if (hoverPiece) HAND.leanTo.copy(hoverPiece.mesh.position).addScaledVector(UP, 0.06);
    const sw = HAND.idle.value;
    HAND.shown.copy(HAND.pos).add(V1.set(Math.sin(t * 0.71) * 0.0018 * sw, Math.sin(t * 0.93 + 1) * 0.0024 * sw, Math.sin(t * 0.57 + 2) * 0.0014 * sw));
    if (HAND.lean.value > 0.001) HAND.shown.addScaledVector(V2.copy(HAND.leanTo).sub(HAND.ready), 0.1 * HAND.lean.value);
    tongs.group.position.copy(HAND.shown); tongs.group.quaternion.copy(HAND.quat); tongs.setGap(HAND.gap);

    // pieces: the held one follows the tongs (swinging about the grip line); the rest rest, settle and simmer
    for (const p of pieces) {
      p.hover.target = hoverPiece === p && p.press.target === 0 ? 1 : 0;
      p.hover.step(dt); p.press.step(dt); p.sel.step(dt); p.tilt.step(dt); p.drop.step(dt); p.squash.step(dt);
      if (p === HAND.held) {
        M1.compose(HAND.shown, HAND.quat, ONE).multiply(M2.makeRotationAxis(X_AXIS, HAND.swing.value)).multiply(HAND.offset);
        M1.decompose(p.mesh.position, p.mesh.quaternion, S1);
      } else if (p.state !== 'restock' && !p.flying) {
        const inPot = p.state === 'pot' || p.state === 'toBowl';
        const bob = inPot ? Math.sin(t * 1.1 + p.phase) * 0.0005 : 0;
        const chosen = p.state === 'toBowl' ? (0.003 + Math.sin(t * 6 + p.phase) * 0.0012) * p.sel.value : 0;
        p.mesh.position.copy(p.rest.pos); p.mesh.position.y += p.drop.value + bob + chosen - p.press.value * 0.0012;
        p.mesh.quaternion.copy(Q1.setFromAxisAngle(p.tiltAxis, p.tilt.value)).multiply(p.rest.quat);
      }
      const pulse = p.state === 'toBowl' || p.state === 'toPot' ? 0.75 + 0.25 * Math.sin(t * 6 + p.phase) : 1;
      p.u.uSquash.value = p.squash.value; p.u.uHover.value = p.hover.value; p.u.uPress.value = p.press.value; p.u.uSel.value = p.sel.value * pulse;
      p.wet += ((p.inBowl ? 0.65 : 0.85) - p.wet) * Math.min(1, dt * 0.12); p.u.uWet.value = p.wet;
      const within = p.state === 'restock' ? null : [POT, BOWL].find((c) => c.contains(p.mesh.position.x, p.mesh.position.z));
      p.u.uLevel.value = within ? levelW(within) : -10;
    }
    root.updateMatrixWorld();

    // broth: the bowl rises a touch with each piece; the held piece's meniscus, entry ripples and broth neck
    BOWL.level.target = BOWL.base + 0.0006 * pieces.filter((p) => p.inBowl).length;
    const held = HAND.held;
    const bottom = held ? V4.set(held.mesh.position.x, lowestY(held, held.mesh.position, held.mesh.quaternion), held.mesh.position.z) : null;
    for (const c of [POT, BOWL]) {
      c.level.step(dt);
      const L = levelW(c), gp = c.group.position;
      c.broth.mesh.position.set(gp.x, L, gp.z);
      c.broth.u.uShape.value.x = gp.x; c.broth.u.uShape.value.y = gp.z;
      if (c === BOWL) c.broth.u.uShape.value.z = bowl.radiusAt(c.level.value);
      const inside = !!held && c.contains(bottom.x, bottom.z, 0.005);
      c.broth.u.uMen.value.set(held ? held.mesh.position.x : 0, held ? held.mesh.position.z : 0, held ? held.def.fr * 0.95 : 0, inside && bottom.y < L && bottom.y > L - held.def.h ? 0.6 : 0);
      if (inside && c.prevBottom !== undefined && c.prevBottom > L && bottom.y <= L) { c.broth.impulse(bottom.x, bottom.z, 0.00015, held.def.fr * 0.9); splash(c, bottom, held); }
      c.prevBottom = inside ? bottom.y : undefined;
    }
    if (neckState.armed && held === neckState.p) {
      const c = neckState.c, gap = bottom.y - levelW(c), R = held.def.neckR;
      if (gap <= 0) { neck.mesh.visible = false; c.cling.set(0); }
      else if (gap < SNAP) {
        const cl = gap * 0.5; c.cling.set(cl); c.clingXZ.set(bottom.x, bottom.z);
        neck.mesh.visible = true; neck.mesh.position.copy(bottom);
        neck.u.uLen.value = gap - cl; neck.u.uTop.value = R * 0.97; neck.u.uBot.value = R * 1.16;
        neck.u.uWaist.value = lerp(R * 0.98, 0.0016, Math.pow(gap / SNAP, 0.8));
      } else snap(c, bottom, held);
    } else if (neck.mesh.visible) neck.mesh.visible = false;
    for (const c of [POT, BOWL]) { c.cling.step(dt); c.broth.u.uCling.value.set(c.clingXZ.x, c.clingXZ.y, (held ? held.def.neckR : 0.02) * 0.92, c.cling.value); }

    // tong tips dipping in and out
    for (let i = 0; i < 2; i++) {
      const p = tongs.tipWorld(i, V3).applyMatrix4(uToS.value);
      for (const c of [POT, BOWL]) {
        if (tipPrev[i] === null || !c.contains(p.x, p.z)) continue;
        const L = levelW(c);
        if (tipPrev[i] > L && p.y <= L) c.broth.impulse(p.x, p.z, 0.00005, 0.003);
        else if (tipPrev[i] <= L && p.y > L) c.broth.impulse(p.x, p.z, 0.000035, 0.002);
      }
      tipPrev[i] = p.y;
    }

    // the simmer: small rings rising beside pieces, here and there in the case
    if ((simmerT -= dt) <= 0) {
      simmerT = 0.25 + rnd() * 0.5;
      const inPot = pieces.filter((p) => p.state === 'pot'), q = inPot[(rnd() * inPot.length) | 0], a = rnd() * 6.283;
      if (q) potBroth.impulse(q.rest.pos.x + Math.cos(a) * q.def.fr * 1.2, q.rest.pos.z + Math.sin(a) * q.def.fr * 1.2, 0.000025, 0);
    }

    for (const k of ORDER) { tagPulse[k] = Math.max(0, tagPulse[k] - dt * 4); const s = 1 + tagPulse[k] * 0.06; tags[k].mesh.scale.set(s, s, 1); }
    spawnBubbles(dt);
    bubbles.update(dt, levelW, (b) => { b.c.broth.impulse(b.x, b.z, 0.00001 + b.r * 0.004, b.r); if (rnd() < 0.15) steam.burst(V1.set(b.x, levelW(b.c) + 0.003, b.z), 1, 0.012, 0.1); });
    drips.update(dt, land);
    steam.update(dt, t);
    if (camera) {
      steam.setViewport(viewH, camera.fov / (camera.zoom || 1), root.matrixWorld.getMaxScaleOnAxis());
      shared.uKeyDirView.value.copy(keyDir).transformDirection(root.matrixWorld).transformDirection(camera.matrixWorldInverse);
    }
  }

  // world position of the middle of a piece of kind k (in the pot, or in the bowl): for tests and screen anchors
  function anchor(k, inBowl = false, out = new THREE.Vector3()) {
    const p = inBowl ? pieces.find((x) => x.key === k && x.state === 'bowl') : available(k)[0]; if (!p) return null;
    return out.copy(p.def.bound.c).applyMatrix4(p.mesh.matrixWorld);
  }

  return {
    root, bowl, holder, keyDir, FOODS, ORDER,
    get oc() { return oc; }, get layoutL() { return layoutL; }, get housing() { return housing; },
    lamp: lampU.value,
    // the camera that looks at the station and the height of what it draws into, in device px (steam sizing, drips)
    setCamera(cam, heightPx) { camera = cam; if (heightPx) viewH = heightPx; },
    // reflections for a host without scene.environment; k scales each material's own envMapIntensity
    setEnvironment(tex, k = 1) { env = tex; envK = k; dress(root); },
    layout, tick, pick, act, press, hover, refresh, model, anchor, setDetail,
    addKind, removeKind, undo: undoLast, emptyBowl,
    lock(v) { locked = !!v; if (locked) hoverPiece = null; },
    get locked() { return locked; },
    takeBowl, serveMotion, fillBowl,
    busy: () => !!tongJob || jobs.size > 0,
    // for checks from the console / automated tests
    inspect: () => ({ pieces, queue: queue.length, tong: !!tongJob, jobs: jobs.size, restocking: ORDER.filter((k) => cells[k].restocking),
      stock: Object.fromEntries(ORDER.map((k) => [k, available(k).length])), bowl: pieces.filter((p) => p.inBowl).map((p) => p.key) }),
    available,
  };
}
