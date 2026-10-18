// Steam and drips: a few CPU particles each, written straight into buffers. Small counts on purpose.
import * as THREE from 'three';

const rnd = Math.random;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function puffTexture() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * N * 0.2, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, r = N * (0.14 + rnd() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
  }
  return new THREE.CanvasTexture(c);
}

// ---- steam ----------------------------------------------------------------------------------------------------
export function createSteam() {
  const MAX = 420;
  const pos = new Float32Array(MAX * 3), alpha = new Float32Array(MAX), size = new Float32Array(MAX), rot = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
  // premultiplied and partly additive: steam brightens what is behind it instead of greying it, so it reads as warm
  // vapour catching the light rather than as fog
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uMap: { value: puffTexture() }, uScale: { value: 800 }, uColor: { value: new THREE.Color(0xfff0e0) } },
    vertexShader: /* glsl */`
      attribute float aAlpha, aSize, aRot; uniform float uScale; varying float vA; varying float vRot;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; vA = aAlpha; vRot = aRot; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; varying float vA; varying float vRot;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), k = cos(vRot); c = mat2(k, -s, s, k) * c;
        float a = texture2D(uMap, c + 0.5).a * vA; if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * a * 0.8, a * 0.85); // mostly over, a little additive: visible on dark, never a flare
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 10;
  const P = Array.from({ length: MAX }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1, s0: 0, s1: 0, a: 0, r: 0, rv: 0, seed: 0 }));
  const emitters = [];
  function emit(e) {
    const q = P.find((x) => !x.alive); if (!q) return;
    e.sample(q.p);
    const lift = e.lift || 1;
    q.v.set((rnd() - 0.5) * 0.008, (0.02 + rnd() * 0.016) * lift, (rnd() - 0.5) * 0.008);
    q.age = 0; q.life = (e.life || 1.6) + rnd() * 1.4; q.s0 = e.size * (0.6 + rnd() * 0.5); q.s1 = q.s0 * (e.grow || 3.4);
    q.a = e.alpha * (0.6 + rnd() * 0.6); q.r = rnd() * 6.28; q.rv = (rnd() - 0.5) * 0.8; q.seed = rnd() * 100; q.alive = true;
  }
  return {
    points,
    addEmitter(e) { e.acc = 0; emitters.push(e); return e; },
    // a one-off puff (a piece landing in the bowl): n particles from one spot
    burst(at, n, size = 0.016, alpha = 0.16) { for (let i = 0; i < n; i++) emit({ size, alpha, life: 0.9, grow: 3.8, lift: 1.6, sample: (o) => o.copy(at).add(new THREE.Vector3((rnd() - 0.5) * 0.02, rnd() * 0.01, (rnd() - 0.5) * 0.02)) }); },
    // scale: how much bigger than its own metres the station is drawn (sizes are in station units)
    setViewport(heightPx, fovDeg, scale = 1) { mat.uniforms.uScale.value = scale * heightPx / (2 * Math.tan(fovDeg * Math.PI / 360)); },
    update(dt, t) {
      for (const e of emitters) { e.acc += e.rate() * dt; while (e.acc >= 1) { emit(e); e.acc -= 1; } }
      let n = 0;
      for (const q of P) {
        if (!q.alive) continue;
        q.age += dt; if (q.age > q.life) { q.alive = false; continue; }
        q.v.y += 0.014 * dt;
        q.p.x += (q.v.x + Math.sin(t * 1.3 + q.seed + q.p.y * 40) * 0.006) * dt;
        q.p.y += q.v.y * dt;
        q.p.z += (q.v.z + Math.cos(t * 1.1 + q.seed * 1.7 + q.p.y * 33) * 0.004) * dt;
        q.r += q.rv * dt;
        const u = q.age / q.life;
        pos[n * 3] = q.p.x; pos[n * 3 + 1] = q.p.y; pos[n * 3 + 2] = q.p.z;
        alpha[n] = q.a * smooth(0, 0.2, u) * (1 - smooth(0.4, 1, u));
        size[n] = q.s0 + (q.s1 - q.s0) * (1 - (1 - u) * (1 - u));
        rot[n] = q.r; n++;
      }
      geo.setDrawRange(0, n);
      for (const k of ['position', 'aAlpha', 'aSize', 'aRot']) geo.attributes[k].needsUpdate = true;
    },
  };
}

// ---- drips ----------------------------------------------------------------------------------------------------
// A drip first hangs from an anchor (the lowest point of the daikon), swells and stretches, then lets go and falls.
export function createDrips(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.75, envMapIntensity: 2.2 });
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const pool = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(geo, mat); m.visible = false; group.add(m); return { m, state: 'off' }; });
  const prev = new THREE.Vector3(), tmp = new THREE.Vector3();
  const free = () => pool.find((d) => d.state === 'off');
  return {
    group,
    hang(anchor, { delay = 0, grow = 0.28, r = 0.0021 } = {}) {
      const d = free(); if (!d) return;
      Object.assign(d, { state: 'wait', anchor, delay, grow, r, g: 0, v: new THREE.Vector3(), last: null, elong: 1 });
    },
    fling(p, v, r = 0.0016) {
      const d = free(); if (!d) return;
      Object.assign(d, { state: 'fall', r, g: 1, v: v.clone(), elong: 1.1 });
      d.m.position.copy(p); d.m.visible = true;
    },
    clear() { for (const d of pool) { d.state = 'off'; d.m.visible = false; } },
    update(dt, land) {
      for (const d of pool) {
        if (d.state === 'off') continue;
        if (d.state === 'wait') { d.delay -= dt; if (d.delay <= 0) { d.state = 'hang'; d.m.visible = true; } else continue; }
        if (d.state === 'hang') {
          const a = d.anchor(tmp);
          if (!a) { // nothing to hang from any more (set down, or no broth below): draw back in
            d.g -= dt / 0.12; if (d.g <= 0 || !d.last) { d.state = 'off'; d.m.visible = false; continue; }
            const s = d.r * (0.35 + 0.65 * d.g); d.m.scale.set(s, s * d.elong, s); continue;
          }
          if (d.last) d.v.subVectors(a, d.last).divideScalar(Math.max(dt, 1e-4)); d.last = (d.last || new THREE.Vector3()).copy(a);
          d.g = Math.min(1, d.g + dt / d.grow);
          const e = 1 + 0.75 * d.g * d.g, s = d.r * (0.35 + 0.65 * d.g);
          d.elong = e;
          d.m.scale.set(s, s * e, s);
          d.m.position.copy(a); d.m.position.y -= s * e * 0.92;
          // let go only once the daikon is (nearly) still: a drip should fall where it formed, into the broth
          if (d.g >= 1 && d.v.length() < 0.05) { d.state = 'fall'; d.v.set(0, Math.min(0, d.v.y), 0); }
          continue;
        }
        prev.copy(d.m.position);
        d.v.y -= 7.8 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.elong += (1.2 - d.elong) * Math.min(1, dt * 10);
        d.m.scale.set(d.r, d.r * d.elong, d.r);
        if (land(d.m.position, prev, d.r) || d.m.position.y < -0.05) { d.state = 'off'; d.m.visible = false; }
      }
    },
  };
}

// ---- bubbles --------------------------------------------------------------------------------------------------
// The simmer you can see: small glossy domes swell at the surface, often in little clusters by the walls and the
// food, wobble for a moment and pop, leaving a ring. Instanced, so dozens cost one draw call.
export function createBubbles() {
  const N = 110;
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xd8a868, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.42, envMapIntensity: 1.9 }); // broth-coloured film: the highlight, not the body, should read
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 4;
  const B = Array.from({ length: N }, () => ({ alive: false, x: 0, z: 0, c: null, r: 0, t: 0, grow: 0, hold: 0 }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  return {
    mesh,
    spawn(c, x, z, r) { const b = B.find((v) => !v.alive); if (!b) return; Object.assign(b, { alive: true, c, x, z, r, t: 0, grow: 0.25 + rnd() * 0.6, hold: 0.15 + rnd() * 1.0, w: rnd() * 6 }); },
    update(dt, level, pop) {
      let n = 0;
      for (const b of B) {
        if (!b.alive) continue;
        b.t += dt;
        const end = b.grow + b.hold;
        if (b.t > end + 0.05) { b.alive = false; pop(b); continue; }
        const g = b.t < b.grow ? THREE.MathUtils.smoothstep(b.t / b.grow, 0, 1) : b.t > end ? 1 - (b.t - end) / 0.05 : 1;
        const r = b.r * g * (1 + 0.06 * Math.sin(b.t * 18 + b.w));
        m.compose(p.set(b.x, level(b.c) - r * 0.12, b.z), q, sc.set(r, r * 0.72, r));
        mesh.setMatrixAt(n++, m);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
