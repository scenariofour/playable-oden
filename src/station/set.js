// The set: reflections (a painted equirect run through PMREM), a plain neutral backdrop,
// the wooden counter and soft contact shadows. Everything is painted on canvases, no image files.
import * as THREE from 'three';

const rand = mulberry(20261017);
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// ---- reflections ---------------------------------------------------------------------------------------
// Equirect: u = atan(z, x) / 2π + 0.5, so −Z (behind the set) is u = 0.25, +X is 0.5, +Z (the viewer) is 0.75.
// It is HDR: a dim painted room, plus light sources painted into a separate mask and added several times brighter
// than white. Only real lights can put a bright, sharp highlight on wet food and broth; an 8-bit white can't.
// The key one is a long ceiling strip behind the food, at the angle the broth and the daikon top mirror to the camera.
// A host can paint its own room instead (RIRRI'S does): room(g, W, H, v, soft) paints the base colours, lights(mg, …)
// the light sources into the mask (added `glow` times brighter than white).
export function createEnvironment(renderer, { room = paintRoom, lights = paintLights, glow = 5 } = {}) {
  const W = 512, H = 256, v = (deg) => (1 - (deg / 180 + 0.5)) * H; // elevation → canvas y
  const [c, g] = canvas(W, H), [m, mg] = canvas(W, H);
  const soft = (ctx, x, y, w, h, color, blur) => { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.restore(); };
  room(g, W, H, v, soft);
  mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H);
  lights(mg, W, H, v, soft);
  const b = g.getImageData(0, 0, W, H).data, k = mg.getImageData(0, 0, W, H).data;
  const lin = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const data = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, o = ((H - 1 - y) * W + x) * 4; // DataTexture rows run bottom-up
    for (let ch = 0; ch < 3; ch++) data[o + ch] = lin(b[i + ch]) + lin(k[i + ch]) * glow;
    data[o + 3] = 1;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  tex.dispose(); pmrem.dispose();
  return env;
}

function paintRoom(g, W, H, v, soft) {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#b9a79d'); sky.addColorStop(0.3, '#6e5a52'); sky.addColorStop(0.5, '#4f3d36');
  sky.addColorStop(0.56, '#7a6052'); sky.addColorStop(0.75, '#5a4436'); sky.addColorStop(1, '#2a1f1a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  soft(g, 0.75 * W - 130, v(52), 260, v(2) - v(52), '#857266', 30);   // the store behind the viewer
  soft(g, 0, v(24), 22, v(4) - v(24), '#7d82b8', 14);                 // the rainy window, left
  soft(g, W - 22, v(24), 22, v(4) - v(24), '#7d82b8', 14);
}
function paintLights(mg, W, H, v, soft) {
  soft(mg, 0.25 * W - 44, v(27.5), 88, v(24.5) - v(27.5), '#fff1de', 3); // a thin ceiling tube behind the food
  soft(mg, 0.25 * W - 30, v(36), 60, v(34) - v(36), '#ffe9d0', 3);        // a second, further back
  soft(mg, 0.75 * W - 90, v(60), 180, v(57) - v(60), '#ffffff', 4);      // fluorescent tubes over the viewer
}

// ---- backdrop ----------------------------------------------------------------------------------------------
// Neutral on purpose: the station is the subject, and a host (RIRRI'S World) brings its own room. A warm, dim
// falloff, a touch lighter behind the pot, so the steam has something dark to read against.
export function createBackdrop() {
  const W = 512, H = 288, [c, g] = canvas(W, H);
  g.fillStyle = '#231d24'; g.fillRect(0, 0, W, H);
  const gr = g.createRadialGradient(W * 0.46, H * 0.62, 0, W * 0.46, H * 0.62, W * 0.62);
  gr.addColorStop(0, '#4a3a38'); gr.addColorStop(0.55, '#30262c'); gr.addColorStop(1, '#1c171d');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false, depthWrite: false }) /* a background: never hides the set, however far the camera sits */);
  mesh.renderOrder = -1;
  mesh.userData.aspect = W / H;
  return mesh;
}
function hex(a) { return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0'); }
// ---- counter -----------------------------------------------------------------------------------------------
// RIRRI'S counter: warm wood top over the teal panel, seen close enough to read the grain.
export function createCounter() {
  const W = 1024, H = 512, [c, g] = canvas(W, H);
  g.fillStyle = '#8c6a52'; g.fillRect(0, 0, W, H); // a darker walnut, so the food is the warmest, brightest thing
  for (let i = 0; i < 170; i++) {
    const y0 = rand() * H, amp = 2 + rand() * 6, f = 0.004 + rand() * 0.006, ph = rand() * 6;
    const dark = rand() < 0.75;
    g.strokeStyle = dark ? `rgba(80,46,26,${0.03 + rand() * 0.07})` : `rgba(255,226,190,${0.04 + rand() * 0.07})`;
    g.lineWidth = 0.8 + rand() * 2.6;
    g.beginPath();
    for (let x = 0; x <= W; x += 16) { const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * 0.3; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const group = new THREE.Group();
  const depth = 0.9, width = 1.6, t = 0.034; // deep enough that the built-in well never cuts its back edge
  const topMat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.45 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, t, depth), topMat);
  top.position.y = -t / 2; top.receiveShadow = true; group.add(top);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, 0.02), new THREE.MeshStandardMaterial({ color: 0x1d6b5f, roughness: 0.6 }));
  panel.position.set(0, -t - 0.2, depth / 2 - 0.03); group.add(panel);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.006, 0.02), new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.5 }));
  lip.position.set(0, -t - 0.003, depth / 2 - 0.018); group.add(lip);
  group.userData.depth = depth;
  // The oden well is built into the counter: cut its opening out of the top and lay a stainless deck around it.
  // x, z: the well's centre in the counter's frame; hx, hz: its outer half-size; deck: the steel border's width.
  let deckMesh = null;
  group.userData.cutWell = (x, z, hx, hz, deck) => {
    const rr = (path, x0, z0, x1, z1, r) => { const a = x0, b = -z1, c = x1, d = -z0; // shape space is (x, -z)
      path.moveTo(a + r, b); path.lineTo(c - r, b); path.quadraticCurveTo(c, b, c, b + r); path.lineTo(c, d - r); path.quadraticCurveTo(c, d, c - r, d);
      path.lineTo(a + r, d); path.quadraticCurveTo(a, d, a, d - r); path.lineTo(a, b + r); path.quadraticCurveTo(a, b, a + r, b); return path; };
    const slab = (shape, h) => { const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 10 }); geo.rotateX(-Math.PI / 2); return geo; };
    const outer = rr(new THREE.Shape(), -width / 2, -depth / 2, width / 2, depth / 2, 0.004);
    outer.holes.push(rr(new THREE.Path(), x - hx - deck, z - hz - deck, x + hx + deck, z + hz + deck, 0.02));
    top.geometry.dispose(); top.geometry = slab(outer, t); top.position.y = -t;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1 / width, 1 / depth); map.offset.set(0.5, 0.5); map.needsUpdate = true;
    const ring = rr(new THREE.Shape(), x - hx - deck, z - hz - deck, x + hx + deck, z + hz + deck, 0.02);
    ring.holes.push(rr(new THREE.Path(), x - hx + 0.001, z - hz + 0.001, x + hx - 0.001, z + hz - 0.001, 0.016));
    if (deckMesh) { deckMesh.geometry.dispose(); group.remove(deckMesh); }
    deckMesh = new THREE.Mesh(slab(ring, 0.004), new THREE.MeshPhysicalMaterial({ color: 0x9a9894, metalness: 1, roughness: 0.42, envMapIntensity: 0.8 }));
    deckMesh.position.y = -0.0005; deckMesh.receiveShadow = true; group.add(deckMesh);
  };
  return group;
}

// Soft contact shadow: a blurred dark footprint laid on the counter under each vessel.
export function createSoftShadow(drawPath, size, opacity) {
  const N = 256, [c, g] = canvas(N, N);
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N); // alphaMap reads the green channel: white = shadow
  g.shadowColor = '#fff'; g.shadowBlur = 26; g.shadowOffsetX = N * 2;
  g.fillStyle = '#fff'; g.translate(-N * 2, 0); drawPath(g, N); g.fill();
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0x1a0e08, alphaMap: tex, transparent: true, opacity, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.0006; mesh.renderOrder = 1;
  return mesh;
}
