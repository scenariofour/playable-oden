// Props: the stainless oden case, a glazed bowl, spring tongs and the staff's restock tray. All procedural.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// parts that share a material and never move against each other become one mesh (one draw call)
function merged(parts, mat) {
  const geos = parts.map(([geo, x = 0, y = 0, z = 0, rx = 0, rz = 0]) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1))); });
  return new THREE.Mesh(mergeGeometries(geos, false), mat);
}

const steel = () => new THREE.MeshPhysicalMaterial({ color: 0xd6d4d0, metalness: 1, roughness: 0.36, envMapIntensity: 1.1 });

function roundedRect(path, half, r) {
  const h = half;
  path.moveTo(-h + r, -h); path.lineTo(h - r, -h); path.quadraticCurveTo(h, -h, h, -h + r);
  path.lineTo(h, h - r); path.quadraticCurveTo(h, h, h - r, h); path.lineTo(-h + r, h);
  path.quadraticCurveTo(-h, h, -h, h - r); path.lineTo(-h, -h + r); path.quadraticCurveTo(-h, -h, -h + r, -h);
  return path;
}

// ---- pot: one square well of a konbini oden case -----------------------------------------------------------
export function createPot() {
  const outerHalf = 0.062, innerHalf = 0.0555, outerR = 0.018, innerR = 0.012, height = 0.052, floorY = 0.006;
  const group = new THREE.Group(); group.name = 'pot';
  const shape = roundedRect(new THREE.Shape(), outerHalf, outerR);
  shape.holes.push(roundedRect(new THREE.Path(), innerHalf, innerR));
  const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0016, bevelSegments: 4, curveSegments: 14 });
  wallGeo.rotateX(-Math.PI / 2); wallGeo.translate(0, 0.002, 0);
  const wall = new THREE.Mesh(wallGeo, steel());
  wall.castShadow = true; wall.receiveShadow = true; group.add(wall);
  const floorGeo = new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), innerHalf + 0.001, innerR), 10);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0xb07a40, roughness: 0.8 })); // seen through deep broth
  floor.position.y = floorY; floor.receiveShadow = true; group.add(floor);
  return { group, innerHalf, innerCorner: innerR, outerHalf, height, floorY };
}

// ---- bowl: teal glaze outside (RIRRI'S counter colour), iron-brown rim, warm cream inside ----------------
export function createBowl({ scale = 1 } = {}) {
  const outer = [[0.0, 0.002], [0.026, 0.002], [0.028, 0.0], [0.032, 0.0], [0.033, 0.006], [0.04, 0.0085], [0.052, 0.016], [0.061, 0.027], [0.066, 0.037], [0.0685, 0.0425]];
  const rim = [[0.068, 0.0443], [0.0662, 0.0447], [0.0646, 0.0428]];
  const inner = [[0.061, 0.0345], [0.054, 0.0245], [0.042, 0.0148], [0.025, 0.0106], [0.0, 0.0096]];
  const ctrl = [...outer, ...rim, ...inner].map(([r, y]) => new THREE.Vector2(r, y));
  const curve = new THREE.SplineCurve(ctrl);
  const pts = curve.getSpacedPoints(180);
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  const geo = new THREE.LatheGeometry(pts, 112);
  geo.scale(scale, scale, scale);
  // colour by place on the profile
  // where each control point landed among the evenly spaced points
  const at = ctrl.map((cp) => { let b = 0; pts.forEach((p, i) => { if (p.distanceTo(cp) < pts[b].distanceTo(cp)) b = i; }); return b; });
  const nOuter = outer.length - 1, nRim = nOuter + rim.length, n = ctrl.length - 1;
  const tOf = (i) => { for (let k = 1; k < at.length; k++) if (i <= at[k]) return k - 1 + (i - at[k - 1]) / Math.max(1, at[k] - at[k - 1]); return n; };
  const glaze = new THREE.Color(0x1f6359), iron = new THREE.Color(0x5e3826), cream = new THREE.Color(0xefe3cf), clay = new THREE.Color(0xc29a76);
  const col = [], c = new THREE.Color();
  const per = pts.length;
  for (let s = 0; s <= 112; s++) for (let i = 0; i < per; i++) {
    const t = tOf(i); // position in control-point units
    if (t < 3.6) c.copy(clay);
    else if (t < nOuter - 0.35) c.copy(glaze).lerp(clay, Math.max(0, 1 - (t - 3.6) * 2.5));
    else if (t < nRim + 0.15) c.copy(iron);
    else c.copy(cream).lerp(iron, Math.max(0, 1 - (t - nRim - 0.15) * 3));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'bowl'; group.add(mesh);
  // the inside surface as a lookup: radius at a height, height at a radius
  const inside = pts.filter((p, i) => tOf(i) > nRim + 0.1).map((p) => p.clone().multiplyScalar(scale)).sort((a, b) => a.y - b.y);
  const radiusAt = (y) => { for (let i = 1; i < inside.length; i++) if (inside[i].y >= y) { const a = inside[i - 1], b = inside[i]; return a.x + (b.x - a.x) * (y - a.y) / Math.max(1e-6, b.y - a.y); } return inside[inside.length - 1].x; };
  const floorAt = (r) => { for (let i = 1; i < inside.length; i++) if (inside[i].x >= r) { const a = inside[i - 1], b = inside[i]; return a.y + (b.y - a.y) * (r - a.x) / Math.max(1e-6, b.x - a.x); } return inside[inside.length - 1].y; };
  return { group, radiusAt, floorAt, floorY: inside[0].y, rimR: 0.0685 * scale, height: 0.0447 * scale };
}

// ---- tongs: two stainless arms on a spring loop, coral silicone grips, rounded ridged paddles --------------------
// Local frame: origin = midpoint between the paddle centres (the grip), +Y runs up the arms to the loop,
// X is the squeeze axis. setGap(h) puts each paddle's inner face h from the origin.
// The arms are seen edge-on from the counter, so they are wider and thicker than real ones and taper toward the
// food; the coral grips make them read as a tool someone holds, and tie them to the slip's colour.
export function createTongs() {
  const L = 0.26, hinge = 0.007, thick = 0.0024;
  const group = new THREE.Group(); group.name = 'tongs';
  const mat = steel(); mat.color.set(0xe6e4e0); mat.roughness = 0.26;
  const grip = new THREE.MeshPhysicalMaterial({ color: 0xdf7558, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: 0xffc0a8 });
  const armLen = L - 0.012;
  // a flat strip, wider at the hinge than at the paddle, with softened edges
  const armGeo = new RoundedBoxGeometry(thick, armLen, 0.011, 2, 0.0009);
  { const p = armGeo.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / armLen + 0.5; p.setZ(i, p.getZ(i) * (0.72 + 0.28 * t)); } armGeo.computeVertexNormals(); }
  const gripLen = armLen * 0.42, gripGeo = new RoundedBoxGeometry(thick + 0.0026, gripLen, 0.0128, 3, 0.0017);
  const padGeo = new RoundedBoxGeometry(thick * 1.25, 0.03, 0.0175, 2, 0.0011);
  const ridgeGeo = new THREE.CylinderGeometry(0.0007, 0.0007, 0.015, 6); ridgeGeo.rotateX(Math.PI / 2);
  const pivots = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * hinge, L, 0); group.add(pivot);
    // the arm, its paddle and the paddle's ridges are one piece of steel (one mesh); no arm shadow: it would streak
    // across the whole counter
    pivot.add(merged([[armGeo, 0, -armLen / 2, 0], [padGeo, 0, -L, 0], ...Array.from({ length: 5 }, (_, k) => [ridgeGeo, -s * thick * 0.62, -L - 0.012 + k * 0.006, 0])], mat));
    const g = new THREE.Mesh(gripGeo, grip); g.position.set(s * 0.0004, -gripLen / 2 - 0.004, 0); pivot.add(g);
    pivots.push({ pivot, s });
  }
  const loop = new THREE.Mesh(new THREE.TorusGeometry(hinge, 0.0024, 10, 28, Math.PI), mat);
  loop.position.y = L; group.add(loop);
  const tip = new THREE.Vector3();
  return {
    group,
    setGap(h) {
      const a = Math.asin(Math.min(0.5, Math.max(-0.2, (h + thick * 0.65 - hinge) / L)));
      for (const { pivot, s } of pivots) pivot.rotation.z = s * a;
    },
    // world position of each paddle's lower end (for touching the broth)
    tipWorld(i, out) { const { pivot } = pivots[i]; tip.set(0, -L - 0.015, 0); return out.copy(pivot.localToWorld(tip)); },
  };
}

// ---- the oden case: a stainless well split into cells by thin dividers -----------------------------------------
// cols × rows cells; row 0 is the back. cells[i] = { col, row, x, z } in the case's local frame, centre of the cell.
// floorY is the false floor the food rests on; divTop is where the dividers stop (just above the broth, so the
// compartments read as one pot of broth, not six boxes).
export function createOdenCase({ cols = 3, rows = 2, cellW = 0.12, cellD = 0.11, div = 0.004, wall = 0.008, height = 0.064, floorY = 0.006, divTop = floorY + height - 0.012 } = {}) {
  const hx = (cols * cellW + (cols - 1) * div) / 2, hz = (rows * cellD + (rows - 1) * div) / 2, inR = 0.01, outR = inR + wall;
  const group = new THREE.Group(); group.name = 'odenCase';
  const mat = steel();
  const rr = (path, x, z, r) => { path.moveTo(-x + r, -z); path.lineTo(x - r, -z); path.quadraticCurveTo(x, -z, x, -z + r); path.lineTo(x, z - r); path.quadraticCurveTo(x, z, x - r, z);
    path.lineTo(-x + r, z); path.quadraticCurveTo(-x, z, -x, z - r); path.lineTo(-x, -z + r); path.quadraticCurveTo(-x, -z, -x + r, -z); return path; };
  const shape = rr(new THREE.Shape(), hx + wall, hz + wall, outR);
  shape.holes.push(rr(new THREE.Path(), hx, hz, inR));
  const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0018, bevelSegments: 4, curveSegments: 12 });
  wallGeo.rotateX(-Math.PI / 2); wallGeo.translate(0, 0.002, 0);
  const walls = new THREE.Mesh(wallGeo, mat); walls.castShadow = true; walls.receiveShadow = true; group.add(walls);
  const floorGeo = new THREE.ShapeGeometry(rr(new THREE.Shape(), hx + 0.001, hz + 0.001, inR), 8); floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x8f6a42, roughness: 0.75 })); // steel, seen through 2 cm of broth
  floor.position.y = floorY; floor.receiveShadow = true; group.add(floor);
  const divMat = mat.clone(); divMat.roughness = 0.3;
  const dh = divTop - floorY, parts = [];
  for (let c = 1; c < cols; c++) {
    const x = -hx + c * cellW + (c - 0.5) * div;
    parts.push([new THREE.BoxGeometry(div, dh, hz * 2), x, floorY + dh / 2, 0], [new THREE.CylinderGeometry(div * 0.6, div * 0.6, hz * 2, 8), x, floorY + dh, 0, Math.PI / 2]);
  }
  for (let r = 1; r < rows; r++) {
    const z = -hz + r * cellD + (r - 0.5) * div;
    parts.push([new THREE.BoxGeometry(hx * 2, dh, div), 0, floorY + dh / 2, z], [new THREE.CylinderGeometry(div * 0.6, div * 0.6, hx * 2, 8), 0, floorY + dh, z, 0, Math.PI / 2]);
  }
  if (parts.length) { const dividers = merged(parts, divMat); dividers.castShadow = true; dividers.name = 'dividers'; group.add(dividers); }
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ col: c, row: r, x: -hx + cellW / 2 + c * (cellW + div), z: -hz + cellD / 2 + r * (cellD + div) });
  return { group, cells, hx, hz, wall, height, floorY, inR, cellW, cellD };
}

// ---- a countertop warmer: the same well, standing on a counter in its own stainless housing -------------------------
// For a host whose counter has no opening cut for the well (RIRRI'S). hx, hz: the well's outer half-size (the case's
// walls fill the opening); h: the housing's height; deck: the steel border round the well; label: a front panel
// (customer side, +z) with おでん and ODEN, true for the default, or { text, sub, bg, ink }.
export function createWarmerBody({ hx, hz, h, deck, label = true }) {
  const group = new THREE.Group(); group.name = 'warmerBody';
  const X = hx + deck, Z = hz + deck, inR = 0.018;
  const rr = (path, x, z, r) => { path.moveTo(-x + r, -z); path.lineTo(x - r, -z); path.quadraticCurveTo(x, -z, x, -z + r); path.lineTo(x, z - r); path.quadraticCurveTo(x, z, x - r, z);
    path.lineTo(-x + r, z); path.quadraticCurveTo(-x, z, -x, z - r); path.lineTo(-x, -z + r); path.quadraticCurveTo(-x, -z, -x + r, -z); return path; };
  const shape = rr(new THREE.Shape(), X, Z, 0.022);
  shape.holes.push(rr(new THREE.Path(), hx, hz, inR));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h - 0.014, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0025, bevelSegments: 3, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0.011, 0); // from the foot (0.008) to the deck (h)
  const top = steel(); top.color.set(0x9a9894); top.roughness = 0.4; top.envMapIntensity = 0.85; // the lab counter's deck
  const side = steel(); side.color.set(0xb4b2ae); side.roughness = 0.34;
  const body = new THREE.Mesh(geo, [top, side]); body.castShadow = true; body.receiveShadow = true; body.name = 'housing'; group.add(body);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(X * 2 - 0.012, 0.01, Z * 2 - 0.012, 2, 0.003), new THREE.MeshStandardMaterial({ color: 0x3a3436, roughness: 0.7 }));
  foot.position.y = 0.005; foot.name = 'housingFoot'; group.add(foot);
  if (label) {
    const L = { text: 'おでん', sub: 'ODEN', bg: '#a8643a', ink: '#fff6ea', ...(label === true ? {} : label) };
    const w = X * 2 * 0.6, hh = Math.min(h * 0.6, w * 0.32), c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * hh / w);
    const g = c.getContext('2d'), F = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", sans-serif';
    g.fillStyle = L.bg; g.beginPath(); g.roundRect(0, 0, c.width, c.height, c.height * 0.18); g.fill();
    g.fillStyle = L.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(c.height * 0.5)}px ${F}`; g.fillText(L.text, c.width * 0.42, c.height * 0.53);
    g.font = `800 ${Math.round(c.height * 0.2)}px ${F}`; g.globalAlpha = 0.8; g.fillText(L.sub, c.width * 0.82, c.height * 0.55);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, transparent: true }));
    panel.position.set(0, 0.008 + (h - 0.008) * 0.5, Z + 0.0012); panel.name = 'housingLabel'; group.add(panel);
  }
  group.userData.size = [X, Z];
  return group;
}

// ---- the restock tray: a shallow stainless バット the staff slides in from behind -----------------------------------
export function createTray() {
  const group = new THREE.Group(); group.name = 'tray';
  const mat = steel(); mat.roughness = 0.28;
  const w = 0.15, d = 0.12, h = 0.014, t = 0.0015;
  const add = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); m.castShadow = true; group.add(m); };
  add(w, t, d, 0, 0, 0);
  add(w, h, t, 0, h / 2, d / 2); add(w, h, t, 0, h / 2, -d / 2); add(t, h, d, w / 2, h / 2, 0); add(t, h, d, -w / 2, h / 2, 0);
  group.visible = false;
  return { group, w, d };
}

// ---- the karashi packet and wrapped chopsticks that come with a finished bowl -----------------------------------
export function createCondiments() {
  const group = new THREE.Group(); group.name = 'condiments';
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#f4c531'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#7a4a12';
  g.font = '900 46px "Zen Maru Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('からし', 128, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const packet = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.019), [0, 0, 1, 0, 0, 0].map((t) => t ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }) : new THREE.MeshStandardMaterial({ color: 0xf4c531, roughness: 0.45 })));
  packet.position.set(0, 0.0015, 0); packet.castShadow = true; group.add(packet);
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.006, 0.016), new THREE.MeshStandardMaterial({ color: 0xe6d9c6, roughness: 0.75 }));
  sleeve.position.set(0.02, 0.003, 0.03); sleeve.rotation.y = -0.08; sleeve.castShadow = true; group.add(sleeve);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0065, 0.0165), new THREE.MeshStandardMaterial({ color: 0xd64a34, roughness: 0.6 }));
  tag.position.set(-0.04, 0.003, 0.034); tag.rotation.y = -0.08; group.add(tag);
  for (const dz of [-0.003, 0.003]) {
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.004), new THREE.MeshStandardMaterial({ color: 0xe0c99a, roughness: 0.8 }));
    stick.position.set(0.135, 0.003, 0.022 + dz); stick.rotation.y = -0.08; group.add(stick);
  }
  group.visible = false;
  return group;
}

// ---- the tongs' holder: a small glazed crock beside the well, the bowl's teal outside, cream inside ----------------
export function createTongHolder() {
  const group = new THREE.Group(); group.name = 'tongHolder';
  const R = 0.026, H = 0.066, t = 0.003;
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.9, H, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x1f6359, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 }));
  outer.position.y = H / 2; outer.castShadow = true; group.add(outer);
  const cream = new THREE.MeshStandardMaterial({ color: 0xefe3cf, roughness: 0.45, side: THREE.BackSide });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(R - t, R * 0.9 - t, H - 0.004, 40, 1, true), cream); inner.position.y = H / 2 + 0.002; group.add(inner);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9 - t, 32), new THREE.MeshStandardMaterial({ color: 0xd8c8b0, roughness: 0.6 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.006; group.add(floor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - t / 2, t / 2 + 0.0004, 8, 40), new THREE.MeshPhysicalMaterial({ color: 0x5e3826, roughness: 0.35, clearcoat: 0.5 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = H; group.add(rim);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.86, 0.004, 32), new THREE.MeshStandardMaterial({ color: 0xc29a76, roughness: 0.8 })); foot.position.y = 0.002; group.add(foot);
  return group;
}
