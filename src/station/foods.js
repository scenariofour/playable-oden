// The ingredients. Each type has a procedural geometry built in its resting pose (origin = the point it rests on),
// a small GLSL colour function, and a motion character: where the tongs hold it, how soft it is under them, and how
// it settles when set down. All of them share one material recipe: a wet clearcoat film, the dent the tong paddles
// press in, a warm rim glow standing in for translucency, and hover / chosen highlights. Each piece also knows the
// broth level it sits in (uLevel): just above it the food is darker where it has soaked, a thin bright meniscus hugs it
// at the surface, and below it the glaze gives way to the broth's own (the tint layer in broth.js does the colour).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function withPart(g, part) { g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1)); return g; }
function strip(g, keepNormal = false) { g.deleteAttribute('uv'); if (!keepNormal) g.deleteAttribute('normal'); return g; }

// ---- geometry ----------------------------------------------------------------------------------------------------
function daikonGeo(R, H) {
  const c = 0.0034, pts = [], P = (r, y) => pts.push(new THREE.Vector2(r, y));
  P(0, 0);
  for (let i = 1; i <= 5; i++) P((R - c) * i / 5, 0);
  for (let i = 1; i <= 7; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * i / 7; P(R - c + c * Math.cos(a), c + c * Math.sin(a)); }
  for (let i = 1; i <= 8; i++) { const t = i / 8; P(R + 0.0007 * Math.sin(Math.PI * t), c + (H - 2 * c) * t); }
  for (let i = 1; i <= 7; i++) { const a = (Math.PI / 2) * i / 7; P(R - c + c * Math.cos(a), H - c + c * Math.sin(a)); }
  for (let i = 4; i >= 0; i--) P((R - c) * i / 5, H);
  let g = new THREE.LatheGeometry(pts, 88);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x), r = Math.hypot(x, z);
    const k = 1 + 0.016 * Math.sin(2 * th + 0.7) + 0.008 * Math.sin(3 * th + 2.1) + 0.0035 * Math.sin(7 * th + 0.4) - 0.012 * (y / H);
    p.setXYZ(i, x * k, y + (y > H * 0.5 ? 0.0004 * Math.sin(3 * th + 1) * (r / R) : 0), z * k);
  }
  g = mergeVertices(strip(g), 1e-6); g.computeVertexNormals();
  return withPart(g, 0);
}

function eggGeo(L, W) {
  const pts = [];
  for (let i = 0; i <= 44; i++) { const f = Math.PI * i / 44; pts.push(new THREE.Vector2((W / 2) * Math.sin(f) * (1 + 0.09 * Math.cos(f)), -(L / 2) * Math.cos(f))); }
  pts[0].x = 0; pts[44].x = 0;
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateZ(-Math.PI / 2); // long axis along X, lying on its side
  g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0);
  return withPart(strip(g, true), 0);
}

// a grilled tube with a slanted cut at one end
function chikuwaGeo(ro, ri, len) {
  const outer = new THREE.CylinderGeometry(ro, ro, len, 44, 8, true);
  const inner = new THREE.CylinderGeometry(ri, ri, len, 24, 1, true);
  const top = new THREE.RingGeometry(ri, ro, 44, 1); top.rotateX(-Math.PI / 2); top.translate(0, len / 2, 0);
  const bot = new THREE.RingGeometry(ri, ro, 44, 1); bot.rotateX(Math.PI / 2); bot.translate(0, -len / 2, 0);
  const g = mergeGeometries([outer, inner, top, bot].map((x) => x.toNonIndexed()));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x);
    const k = 1 + 0.03 * Math.sin(5 * th + y * 90) * (Math.hypot(x, z) > ri * 1.5 ? 1 : 0); // a little lumpy
    p.setXYZ(i, x * k, y + Math.max(0, y / (len / 2)) * (x / ro) * 0.0095, z * k);
  }
  // keep the parts' own normals: smooth round the tube, hard at the cut faces
  g.rotateZ(-Math.PI / 2); g.translate(0, ro, 0);
  return withPart(strip(g, true), 0);
}

// a rounded triangle of konnyaku, lying flat
function konnyakuGeo(s, T) {
  const h = s * 0.866, rc = 0.006;
  const C = [[-s / 2, -h / 3], [s / 2, -h / 3], [0, 2 * h / 3]].map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape();
  for (let i = 0; i < 3; i++) {
    const a = C[i], prev = C[(i + 2) % 3], next = C[(i + 1) % 3];
    const p0 = a.clone().add(prev.clone().sub(a).setLength(rc)), p1 = a.clone().add(next.clone().sub(a).setLength(rc));
    i ? shape.lineTo(p0.x, p0.y) : shape.moveTo(p0.x, p0.y);
    shape.quadraticCurveTo(a.x, a.y, p1.x, p1.y);
  }
  shape.closePath();
  const bt = 0.003;
  const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.0026, bevelSegments: 3, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, bt, 0);
  const p = g.attributes.position; // a softer, slightly slumped top
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (1 - 0.06 * Math.hypot(p.getX(i), p.getZ(i)) / s));
  const m = mergeVertices(strip(g), 1e-6); m.computeVertexNormals(); // soft all round, like the jelly it is
  return withPart(m, 0);
}

// mochi kinchaku: a fried-tofu pouch gathered at the neck and tied with a kanpyō strip
function kinchakuGeo() {
  const prof = [[0, 0], [0.01, 0.0006], [0.0168, 0.0042], [0.0202, 0.011], [0.0208, 0.018], [0.0188, 0.025], [0.0142, 0.031], [0.0086, 0.0352], [0.0068, 0.0374], [0.0088, 0.0396], [0.0112, 0.0422], [0.0122, 0.0446], [0.0098, 0.0462], [0.004, 0.0467], [0, 0.0466]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const pts = new THREE.SplineCurve(prof).getPoints(70);
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  let pouch = new THREE.LatheGeometry(pts, 72);
  const p = pouch.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x);
    const w = THREE.MathUtils.smoothstep(y, 0.022, 0.034);
    const k = 1 + w * 0.06 * Math.sin(11 * th + 0.7 * Math.sin(3 * th)) + (1 - w) * 0.035 * Math.sin(3 * th + y * 90) + 0.012 * Math.sin(17 * th + y * 400);
    p.setXYZ(i, x * k, y, z * k);
  }
  pouch = mergeVertices(strip(pouch), 1e-6); pouch.computeVertexNormals();
  const tie = new THREE.TorusGeometry(0.0079, 0.0019, 10, 36); tie.rotateX(Math.PI / 2); tie.rotateZ(0.12); tie.translate(0, 0.0376, 0);
  return mergeGeometries([withPart(pouch, 0), withPart(strip(tie, true), 1)]);
}

// tsumire: three fish balls on a bamboo skewer, lying along X (the handle runs toward +X)
function tsumireGeo(r) {
  const balls = [-0.024, 0, 0.024].map((cx, j) => {
    let b = new THREE.SphereGeometry(r, 30, 22);
    b = mergeVertices(strip(b), 1e-7);
    const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.05 * Math.sin(x * 900 + j) * Math.sin(y * 700 + 1.3) + 0.035 * Math.sin(z * 1300 + y * 500) - (Math.abs(x) > r * 0.92 ? 0.08 : 0);
      p.setXYZ(i, x * k + cx, y * k + r, z * k);
    }
    b.computeVertexNormals();
    return withPart(b, 0);
  });
  const stick = new THREE.CylinderGeometry(0.0015, 0.0012, 0.13, 10, 1); stick.rotateZ(-Math.PI / 2); stick.translate(0.025, r, 0);
  return mergeGeometries([...balls, withPart(strip(stick, true), 1)]);
}

// ---- colour functions ------------------------------------------------------------------------------------------------
// Each sets fRough / fCoat and returns the albedo. vLocal / vLocalN are the undeformed resting-pose position / normal.
const GLSL = {
  daikon: /* glsl */`
    uniform vec3 cCore, cAmber, cDeep;
    vec3 foodBase() {
      float R = 0.028, H = 0.024;
      float rr = length(vLocal.xz) / R, ang = atan(vLocal.z, vLocal.x);
      float capT = smoothstep(0.55, 0.92, vLocalN.y), cap = max(capT, smoothstep(0.55, 0.92, -vLocalN.y));
      vec3 cf = mix(cCore * 1.06, cAmber, smoothstep(0.35, 1.0, rr));
      cf = mix(cf, cAmber, (1.0 - smoothstep(0.0, 0.22, rr)) * 0.22);
      cf = mix(cf, cAmber, smoothstep(0.5, 0.85, vnoise(vLocal.xz * 110.0 + 7.0)) * 0.1);
      cf = mix(cf, cDeep, exp(-pow((rr - 0.86) / 0.022, 2.0)) * 0.24);
      cf *= 1.0 - vnoise(vec2(ang * 26.0, rr * 3.0)) * vnoise(vec2(ang * 61.0, rr * 9.0 + 3.0)) * 0.1 * smoothstep(0.15, 0.6, rr);
      cf = mix(cf, cCore * 1.14, (1.0 - smoothstep(0.0, 0.45, rr)) * 0.35 * vnoise(vLocal.xz * 60.0 + 2.0)); // the glassy, soaked-through middle
      float edgeY = min(vLocal.y, H - vLocal.y) / (H * 0.5);
      vec3 sf = mix(cAmber, cCore * 1.05, 0.6 + 0.25 * smoothstep(0.1, 0.9, edgeY));
      sf *= 1.0 - vnoise(vec2(ang * 90.0, vLocal.y * 60.0)) * vnoise(vec2(ang * 210.0, vLocal.y * 20.0)) * 0.16;
      sf = mix(sf, cDeep, (1.0 - smoothstep(0.0, H * 0.3, vLocal.y)) * 0.18);
      vec3 base = mix(sf, cf, cap);
      float ca = 0.42; vec2 gp = mat2(cos(ca), -sin(ca), sin(ca), cos(ca)) * vLocal.xz;
      float gd = min(abs(gp.x), abs(gp.y)), glen = 1.0 - smoothstep(0.5, 0.68, rr);
      float groove = (1.0 - smoothstep(0.0002, 0.0009, gd)) * glen * capT;
      float lip = (smoothstep(0.0006, 0.001, gd) - smoothstep(0.001, 0.002, gd)) * glen * capT;
      base = mix(base, cDeep, groove * 0.14) + lip * 0.015;
      float side = 1.0 - cap;
      fRough = mix(mix(0.34, 0.5, side), 0.6, groove);
      fCoat = (1.0 - groove * 0.7) * (1.0 - side * 0.45) * 0.75; fCoatR = 0.24;
      return base;
    }`,
  egg: /* glsl */`
    uniform vec3 cA, cB, cC;
    vec3 foodBase() {
      float n = vnoise(vLocal.xz * 120.0 + vLocal.y * 80.0) * 0.6 + vnoise(vLocal.xy * 300.0) * 0.4;
      float blot = vnoise(vLocal.xz * 45.0 + vLocal.y * 30.0 + 4.0);                 // the soy takes unevenly
      vec3 base = mix(cA, cB, smoothstep(0.3, 0.8, n) * 0.6 + smoothstep(0.45, 0.8, blot) * 0.5);
      base = mix(base, cC, smoothstep(0.012, 0.025, abs(vLocal.x)) * 0.35);
      base = mix(base, cA * 1.12, smoothstep(0.55, 0.95, vLocalN.y) * 0.2); // the top, out of the broth, a shade paler
      fRough = 0.42; fCoat = 0.75; fCoatR = 0.3;                           // satin, not lacquer
      return base;
    }`,
  chikuwa: /* glsl */`
    uniform vec3 cGrill, cBurnt, cPale, cPaste;
    vec3 foodBase() {
      vec2 yz = vec2(vLocal.y - 0.0135, vLocal.z);
      float r = length(yz), ang = atan(yz.y, yz.x);
      float capF = smoothstep(0.6, 0.9, abs(vLocalN.x));
      float outer = smoothstep(0.0105, 0.0124, r) * (1.0 - capF);
      // roasted, not burnt: broad golden-brown patches that fade into the pale side, a few small blisters
      float n = vnoise(vec2(vLocal.x * 130.0, ang * 3.5)) * 0.65 + vnoise(vec2(vLocal.x * 420.0, ang * 11.0)) * 0.35;
      vec3 skin = mix(cGrill, cBurnt, smoothstep(0.42, 0.82, n) * 0.85);
      skin = mix(skin, cPale, smoothstep(0.45, 0.95, -cos(ang - 0.3)) * 0.85);  // the side that rested on the grill rod
      skin = mix(skin, cBurnt * 0.85, step(0.93, hash21(floor(vec2(vLocal.x * 900.0, ang * 30.0)))) * 0.35); // blisters
      skin = mix(skin, cBurnt, smoothstep(0.55, 0.8, vnoise(vec2(vLocal.x * 90.0, ang * 2.5))) * smoothstep(0.0, 0.9, cos(ang - 0.3 + 3.14159)) * 0.5); // the char patches on top
      vec3 base = mix(cPaste, skin, outer);
      base = mix(base, cPaste * 0.8, (1.0 - smoothstep(0.0062, 0.0076, r)) * (1.0 - capF));
      fRough = mix(0.38, 0.6, outer * smoothstep(0.5, 0.9, n)); fCoat = mix(0.9, 0.55, outer); fCoatR = 0.24;
      return base;
    }`,
  konnyaku: /* glsl */`
    uniform vec3 cA, cB, cSpeck;
    vec3 foodBase() {
      vec2 p = vLocal.xz;
      vec3 base = mix(cA, cB, vnoise(p * 90.0));
      vec2 g = p * 900.0 + vLocal.y * 300.0, id = floor(g), f = fract(g) - 0.5;
      float sp = step(0.8, hash21(id)) * (1.0 - smoothstep(0.12, 0.26, length(f + (vec2(hash21(id + 3.1), hash21(id + 5.3)) - 0.5) * 0.3)));
      float face = smoothstep(0.6, 0.9, abs(vLocalN.y));
      float s = 0.0075; vec2 r1 = vec2(dot(p, vec2(0.707, 0.707)), dot(p, vec2(-0.707, 0.707)));
      float l = min(abs(fract(r1.x / s) - 0.5), abs(fract(r1.y / s) - 0.5)) * s;
      float score = (1.0 - smoothstep(0.0002, 0.0006, l)) * face;
      base = mix(base, cSpeck, sp * 0.8);
      base *= 1.0 - score * 0.1;
      fRough = mix(0.2, 0.36, score); fCoat = 1.0; fCoatR = 0.06;           // jelly: the glossiest thing in the pot
      return base;
    }`,
  kinchaku: /* glsl */`
    uniform vec3 cA, cB, cTie;
    vec3 foodBase() {
      float ang = atan(vLocal.z, vLocal.x);
      float n = vnoise(vec2(ang * 9.0, vLocal.y * 180.0)) * 0.55 + vnoise(vLocal.xz * 400.0 + vLocal.y * 300.0) * 0.45;
      vec3 skin = mix(cA, cB, smoothstep(0.35, 0.8, n));
      skin *= 1.0 - step(0.8, hash21(floor(vec2(ang * 60.0, vLocal.y * 1400.0)))) * 0.12;  // the fried skin's pores
      skin = mix(skin, cB * 0.85, smoothstep(0.026, 0.034, vLocal.y) * 0.35);
      vec3 tie = cTie * (0.85 + 0.25 * vnoise(vec2(ang * 3.0, vLocal.y * 900.0)));
      float t = step(0.5, vPart);
      skin = mix(skin, cB, smoothstep(0.03, 0.044, vLocal.y) * 0.3);       // the gathered top is darker, not a bright knot
      fRough = mix(0.55, 0.35, t); fCoat = mix(0.4, 0.8, t); fCoatR = 0.3;
      return mix(skin, tie, t);
    }`,
  tsumire: /* glsl */`
    uniform vec3 cA, cB, cStick;
    vec3 foodBase() {
      float n = vnoise(vLocal.xz * 500.0 + vLocal.y * 330.0) * 0.5 + vnoise(vLocal.xy * 1200.0) * 0.5;
      vec3 ball = mix(cA, cB, n);
      ball = mix(ball, cB * 0.6, step(0.9, hash21(floor(vLocal.xz * 1500.0 + vLocal.y * 700.0))) * 0.6);
      vec3 stick = cStick * (0.88 + 0.2 * vnoise(vec2(vLocal.x * 30.0, atan(vLocal.z, vLocal.y - 0.0115) * 6.0)));
      float t = step(0.5, vPart);
      fRough = mix(0.55, 0.6, t); fCoat = mix(0.5, 0.2, t); fCoatR = 0.3;
      return mix(ball, stick, t);
    }`,
};

// ---- the menu -------------------------------------------------------------------------------------------------------
// Prices are demo prices in yen, in the range a konbini charges; nothing here is a real order or real stock.
// settle: tilt kick / spring (k, c) about `axis` ('long' = the piece's own X, 'grip' = the squeeze axis), squash kick.
export const FOODS = {
  daikon: {
    key: 'daikon', jp: '大根', en: 'Daikon', price: 100, unit: 'piece', stock: 4, swatch: '#d7a85c',
    geo: () => daikonGeo(0.028, 0.024), colors: { cCore: 0xc98b44, cAmber: 0x9c5722, cDeep: 0x6c3411 },
    halfW: 0.028, gripC: V3(0, 0.0145, 0), gripAxis: null, pinch: 1, trans: 1,
    bound: { c: V3(0, 0.012, 0), r: 0.029 }, fr: 0.029, h: 0.024, neckR: 0.025,
    settle: { tilt: 0.03, k: 150, c: 7, squash: 0.18, sk: 300, sc: 20, axis: 'grip' },
  },
  egg: {
    key: 'egg', jp: 'たまご', en: 'Egg', price: 110, unit: 'piece', stock: 5, swatch: '#b8803f',
    geo: () => eggGeo(0.05, 0.037), colors: { cA: 0xd09e64, cB: 0xa86d38, cC: 0x8a5426 },
    halfW: 0.0186, gripC: V3(0, 0.0186, 0), gripAxis: V3(0, 0, 1), pinch: 0.2, trans: 0.35,
    bound: { c: V3(0, 0.0186, 0), r: 0.024 }, fr: 0.024, h: 0.037, neckR: 0.01,
    settle: { tilt: 0.14, k: 55, c: 3, squash: 0.05, sk: 400, sc: 30, axis: 'long' },
  },
  kinchaku: {
    key: 'kinchaku', jp: 'もち巾着', en: 'Mochi pouch', price: 150, unit: 'piece', stock: 4, swatch: '#c48a3c',
    geo: kinchakuGeo, colors: { cA: 0xc99149, cB: 0x9a612c, cTie: 0x7e4e24 },
    halfW: 0.0205, gripC: V3(0, 0.016, 0), gripAxis: V3(1, 0, 0), pinch: 1.4, trans: 0.35,
    bound: { c: V3(0, 0.022, 0), r: 0.025 }, fr: 0.021, h: 0.047, neckR: 0.014,
    settle: { tilt: 0.07, k: 90, c: 7, squash: 0.5, sk: 200, sc: 10, axis: 'grip' },
  },
  chikuwa: {
    key: 'chikuwa', jp: '焼ちくわ', en: 'Chikuwa', price: 100, unit: 'piece', stock: 4, swatch: '#a8672e',
    geo: () => chikuwaGeo(0.0135, 0.0058, 0.062), colors: { cGrill: 0xb07a44, cBurnt: 0x5e3818, cPale: 0xead6ac, cPaste: 0xf1e3c4 },
    halfW: 0.0135, gripC: V3(0, 0.0135, 0), gripAxis: V3(0, 0, 1), pinch: 0.5, trans: 0.2, side: THREE.DoubleSide,
    bound: { c: V3(0, 0.0135, 0), r: 0.026 }, fr: 0.028, h: 0.027, neckR: 0.009,
    settle: { tilt: 0.32, k: 70, c: 5, squash: 0.1, sk: 300, sc: 20, axis: 'long' },
  },
  konnyaku: {
    key: 'konnyaku', jp: 'こんにゃく', en: 'Konnyaku', price: 80, unit: 'piece', stock: 5, swatch: '#7d7068',
    geo: () => konnyakuGeo(0.058, 0.012), colors: { cA: 0x857a72, cB: 0x655a53, cSpeck: 0x2a2320 },
    halfW: 0.0187, gripC: V3(0, 0.009, 0), gripAxis: V3(1, 0, 0), pinch: 0.9, trans: 0.7,
    bound: { c: V3(0, 0.009, 0), r: 0.026 }, fr: 0.027, h: 0.018, neckR: 0.015,
    settle: { tilt: 0.05, k: 220, c: 9, squash: 0.9, sk: 520, sc: 9, axis: 'grip' },
  },
  tsumire: {
    key: 'tsumire', jp: 'つみれ串', en: 'Tsumire skewer', price: 130, unit: 'skewer', stock: 4, swatch: '#8a7260',
    geo: () => tsumireGeo(0.0115), colors: { cA: 0x9a8068, cB: 0x76604e, cStick: 0xd8c08a },
    halfW: 0.0115, gripC: V3(0, 0.0115, 0), gripAxis: V3(0, 0, 1), pinch: 0.3, trans: 0.15,
    bound: { c: V3(0, 0.0115, 0), r: 0.036 }, fr: 0.04, h: 0.023, neckR: 0,
    settle: { tilt: 0.08, k: 180, c: 9, squash: 0.05, sk: 400, sc: 30, axis: 'long' },
  },
};
export const ORDER = ['daikon', 'egg', 'kinchaku', 'chikuwa', 'konnyaku', 'tsumire'];

// ---- material ---------------------------------------------------------------------------------------------------------
const COMMON_V = /* glsl */`
  attribute float aPart;
  uniform float uPinch, uPinchAmt, uHalfW, uSquash; uniform vec3 uPinchDir, uGripC;
  uniform mat4 uToS;
  varying vec3 vLocal; varying vec3 vLocalN; varying float vPart; varying float vWY;
  vec3 pinchOffset(vec3 p, out vec3 nAdd) {
    vec3 off = vec3(0.0); nAdd = vec3(0.0);
    float k = uPinch * uPinchAmt * 0.0016, s2 = pow(max(uHalfW * 0.36, 0.0045), 2.0);
    vec3 d0 = normalize(vec3(uPinchDir.x, 0.0, uPinchDir.z) + vec3(1e-5, 0.0, 0.0));
    for (int i = 0; i < 2; i++) {
      vec3 d = d0 * (i == 0 ? 1.0 : -1.0);
      vec3 q = p - (uGripC + d * uHalfW);
      float g = exp(-dot(q, q) / s2);
      off -= d * g * k;
      nAdd -= (q - d * dot(q, d)) * (g * k * 2.0 / s2);
    }
    return off;
  }`;
const COMMON_F = /* glsl */`
  uniform float uWet, uHover, uPress, uSel, uTrans, uLevel; uniform vec3 uKeyDirView, uGlow;
  varying vec3 vLocal; varying vec3 vLocalN; varying float vPart; varying float vWY;
  float fRough, fCoat, fCoatR = 0.14;
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }`;

const geoCache = new Map();
export function createFood(key, shared) {
  const def = FOODS[key];
  if (!geoCache.has(key)) geoCache.set(key, def.geo());
  const { mat, u } = createFoodMaterial(key, shared);
  const mesh = new THREE.Mesh(geoCache.get(key), mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return { mesh, u, def };
}
// One piece's material and the uniforms that are its own (pinch, squash, hover, chosen, wet, the broth level). Pieces
// of one kind can also share one material when nobody is close enough to touch them (see the station's setDetail).
export function createFoodMaterial(key, shared) {
  const def = FOODS[key];
  const u = {
    uPinch: { value: 0 }, uPinchAmt: { value: def.pinch }, uHalfW: { value: def.halfW }, uSquash: { value: 0 },
    uPinchDir: { value: new THREE.Vector3(1, 0, 0) }, uGripC: { value: def.gripC.clone() },
    uWet: { value: 0.85 }, uLevel: { value: -10 }, uHover: { value: 0 }, uPress: { value: 0 }, uSel: { value: 0 }, uTrans: { value: def.trans },
    uKeyDirView: shared.uKeyDirView, uToS: shared.uToS || { value: new THREE.Matrix4() }, uGlow: { value: new THREE.Color(0xffa04a) },
  };
  for (const [k, v] of Object.entries(def.colors)) u[k] = { value: new THREE.Color(v) };
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1, specularIntensity: 0.45, envMapIntensity: 0.95, side: def.side || THREE.FrontSide });
  mat.customProgramCacheKey = () => 'food-' + key;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON_V)
      .replace('#include <beginnormal_vertex>', /* glsl */`
        vec3 pinchN; vec3 pinchOff = pinchOffset(position, pinchN);
        vec3 objectNormal = normalize(normal + pinchN);
        vLocalN = normal; vPart = aPart;`)
      .replace('#include <begin_vertex>', /* glsl */`
        vec3 transformed = position + pinchOff;
        transformed.y *= 1.0 - uSquash;
        transformed.xz *= 1.0 + uSquash * 0.45;
        vLocal = position;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWY = (uToS * modelMatrix * vec4(transformed, 1.0)).y; // height in station space');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON_F + GLSL[key])
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        diffuseColor.rgb = foodBase() * (1.0 + uPress * 0.07);
        float wl = vWY - uLevel;                                     // height above the broth it sits in
        diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.004, wl)) * step(-0.0004, wl) * 0.16; // the soaked band`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fRough;')
      .replace('#include <lights_physical_fragment>', /* glsl */`#include <lights_physical_fragment>
        material.clearcoat = clamp(uWet * fCoat, 0.0, 1.0) * mix(0.25, 1.0, smoothstep(-0.0012, 0.0002, wl));
        material.clearcoatRoughness = clamp(fCoatR + geometryRoughness, 0.0525, 1.0);`)
      .replace('#include <opaque_fragment>', /* glsl */`
        {
          vec3 V = normalize(vViewPosition);
          float rim = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 2.5);
          float back = pow(clamp(dot(-V, uKeyDirView), 0.0, 1.0), 2.0);
          outgoingLight += uGlow * diffuseColor.rgb * rim * uTrans * (0.06 + 0.42 * back);
          outgoingLight += vec3(1.0, 0.86, 0.62) * exp(-pow((wl - 0.0005) / 0.0005, 2.0)) * 0.16;  // the meniscus
          outgoingLight += vec3(1.0, 0.74, 0.44) * (rim * 0.9 + 0.06) * (uHover * 0.25 + uSel * 0.4);
        }
        #include <opaque_fragment>`);
  };
  return { mat, u };
}
