// Broth: a clear amber liquid that answers locally. Two layers, like a real clear liquid: a tint that multiplies
// whatever is under it (daikon, steel, glaze), and a surface that only adds light (reflections, the meniscus). No fluid solver: a small ring buffer of impulses (each an
// expanding, decaying ring), a mound where the surface clings to a rising daikon, a meniscus line where it meets the
// food and the walls, and a whisper of simmer. The same height function displaces the mesh and bends the normals.
// The neck is the liquid bridge between a lifting daikon and the surface; it thins and snaps.
// Positions are worked out in station space (uToS: world → station, uFromS: back), so the station can be moved,
// turned and scaled as a whole; on its own page both are the identity.
import * as THREE from 'three';

const N_IMP = 16;

const HEIGHT_GLSL = /* glsl */`
  uniform float uTime; uniform vec4 uImp[${N_IMP}]; uniform float uR0[${N_IMP}];
  uniform vec4 uCling; uniform vec4 uMen; uniform vec4 uShape; uniform float uCorner, uCircle; uniform mat4 uToS, uFromS;
  varying vec3 vBW;
  float brothH(vec2 p) {
    float h = 0.0;
    for (int i = 0; i < ${N_IMP}; i++) {
      vec4 I = uImp[i];
      float age = uTime - I.z;
      if (I.w <= 0.0 || age < 0.0 || age > 3.5) continue;
      float r = length(p - I.xy);
      float x = r - (uR0[i] + 0.075 * age);
      float w = 0.0035 + 0.014 * age;
      h += I.w * exp(-age * 1.8) * exp(-x * x / (w * w)) * cos(x * 820.0) / (1.0 + r * 18.0);
    }
    // simmer: two slow, incommensurate swells, barely there
    h += 0.000012 * sin(p.x * 130.0 + p.y * 40.0 + uTime * 1.3 + sin(p.y * 70.0 + uTime * 0.7) * 1.5)
       + 0.000009 * sin(p.y * 115.0 - p.x * 55.0 - uTime * 1.05 + sin(p.x * 60.0 - uTime * 0.5) * 1.2);
    float rc = length(p - uCling.xy);
    h += uCling.w * exp(-pow(max(rc - uCling.z, 0.0) / 0.006, 2.0));
    float rm = length(p - uMen.xy);
    h += uMen.w * 0.0007 * exp(-pow((rm - uMen.z) / 0.0018, 2.0));
    return h;
  }
  float shapeSD(vec2 p) {
    vec2 q = p - uShape.xy;
    if (uCircle > 0.5) return length(q) - uShape.z;
    vec2 d = abs(q) - (uShape.zw - uCorner);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uCorner;
  }`;

// rectangle: halfX/halfZ (+ corner); circle: radius. uShape = (centre x, centre z, half x | radius, half z)
// tint is the colour where the broth is deepest; shallow (optional) where it thins out toward a bowl's sloping wall.
// lamp: a shared { value: Vector3 } the surface mirrors as a soft hot highlight (station space).
// space: the station's shared { uToS, uFromS } matrices.
export function createBroth({ halfX, halfZ, corner = 0, radius, tint, shallow = tint, glow = 0x6a3a12, uTime, lamp, space }) {
  const rect = !!halfX, sx = rect ? halfX * 2 : radius * 2 + 0.012, sz = rect ? halfZ * 2 : sx;
  const geo = new THREE.PlaneGeometry(sx, sz, Math.round(sx / 0.0022), Math.round(sz / 0.0022));
  geo.rotateX(-Math.PI / 2);
  const u = {
    uTime,
    uImp: { value: Array.from({ length: N_IMP }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uR0: { value: new Array(N_IMP).fill(0) },
    uCling: { value: new THREE.Vector4(0, 0, 0, 0) },
    uMen: { value: new THREE.Vector4(0, 0, 0, 0) },
    uShape: { value: new THREE.Vector4(0, 0, rect ? halfX : radius, rect ? halfZ : radius) },
    uCorner: { value: corner }, uCircle: { value: rect ? 0 : 1 },
    uToS: space ? space.uToS : { value: new THREE.Matrix4() }, uFromS: space ? space.uFromS : { value: new THREE.Matrix4() },
  };
  u.uTint = { value: new THREE.Color(tint) }; u.uShallow = { value: new THREE.Color(shallow) };
  u.uLamp = lamp || { value: new THREE.Vector3(0, 1, 0) };
  const tintMat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
    vertexShader: HEIGHT_GLSL + /* glsl */`
      void main() { vec4 w = uToS * modelMatrix * vec4(position, 1.0); vBW = w.xyz; w.y += brothH(w.xz); gl_Position = projectionMatrix * viewMatrix * (uFromS * w); }`,
    fragmentShader: HEIGHT_GLSL + /* glsl */`
      uniform vec3 uTint, uShallow;
      void main() {
        float sd = shapeSD(vBW.xz); if (sd > 0.0) discard;
        // a bowl is deepest in the middle; a square well is evenly deep but darker in the corners the walls shade
        float deep = uCircle > 0.5 ? 1.0 - pow(length(vBW.xz - uShape.xy) / uShape.z, 2.0) : 1.0;
        vec3 c = mix(uShallow, uTint, smoothstep(0.0, 0.85, deep));
        c *= uCircle > 0.5 ? 1.0 : mix(0.8, 1.0, smoothstep(0.0, 0.014, -sd));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: glow, emissiveIntensity: 0.05, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    roughness: 0.07, ior: 1.34, specularIntensity: 1, envMapIntensity: 0.9 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + HEIGHT_GLSL)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vec4 bwp = uToS * modelMatrix * vec4(transformed, 1.0);
        vBW = bwp.xyz;
        transformed.y += brothH(bwp.xz);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEIGHT_GLSL + 'uniform vec3 uLamp; vec3 bNW = vec3(0.0, 1.0, 0.0);')
      .replace('#include <clipping_planes_fragment>', /* glsl */`#include <clipping_planes_fragment>
        float bSD = shapeSD(vBW.xz);
        if (bSD > 0.0) discard;`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        float bRm = length(vBW.xz - uMen.xy);
        float bMen = uMen.w * exp(-pow((bRm - uMen.z - 0.0008) / 0.0011, 2.0)) + exp(-pow(bSD / 0.0012, 2.0)) * 0.5;
`)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        {
          float e = 0.0005, h0 = brothH(vBW.xz);
          float hx = brothH(vBW.xz + vec2(e, 0.0)) - h0, hz = brothH(vBW.xz + vec2(0.0, e)) - h0;
          vec3 nW = normalize(vec3(-hx / e, 1.0, -hz / e));
          bNW = nW;
          normal = normalize((viewMatrix * (uFromS * vec4(nW, 0.0))).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.82, 0.55) * bMen * 0.12;
        {
          // a few glints dancing on the hot surface, catching the lamp
          vec2 sp = vBW.xz * 520.0, id = floor(sp), f = fract(sp) - 0.5;
          float hsh = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
          float tw = 0.5 + 0.5 * sin(uTime * (2.0 + hsh * 5.0) + hsh * 40.0);
          totalEmissiveRadiance += vec3(1.0, 0.88, 0.66) * step(0.992, hsh) * smoothstep(0.32, 0.0, length(f)) * pow(tw, 8.0) * 0.6;
        }
        // the lamp mirrored in the broth: a soft warm pool that the ripples break up into sparkle
        vec3 bV = normalize((uToS * vec4(cameraPosition, 1.0)).xyz - vBW), bR = reflect(-bV, bNW), bL = normalize(uLamp - vBW);
        float bRL = max(dot(bR, bL), 0.0), sheen = pow(bRL, 14.0);
        totalEmissiveRadiance += vec3(1.0, 0.84, 0.6) * (sheen * 0.16 + pow(bRL, 220.0) * 1.4);
        {
          // the fat on a good dashi: little golden beads drifting on the surface, each a lens with a bright edge
          vec2 oq = vBW.xz * 170.0 + vec2(uTime * 0.05, uTime * 0.035) + vec2(sin(vBW.z * 40.0 + uTime * 0.3), cos(vBW.x * 35.0 - uTime * 0.25)) * 0.35;
          vec2 oid = floor(oq), of = fract(oq) - 0.5;
          float oh = fract(sin(dot(oid, vec2(91.7, 217.3))) * 43758.5453);
          vec2 oo = (vec2(fract(oh * 13.1), fract(oh * 7.7)) - 0.5) * 0.45;
          float orad = 0.05 + 0.14 * fract(oh * 3.3), od = length(of - oo), on = step(0.83, oh) * smoothstep(-0.006, -0.012, bSD);
          float disc = smoothstep(orad, orad - 0.03, od), ring = exp(-pow((od - orad * 0.8) / 0.03, 2.0));
          totalEmissiveRadiance += vec3(1.0, 0.76, 0.38) * on * (disc * 0.012 + ring * 0.05) * (0.5 + 5.0 * sheen);
        }`);
  };
  const mesh = new THREE.Group();
  const under = new THREE.Mesh(geo, tintMat); under.renderOrder = 2; under.frustumCulled = false;
  const surface = new THREE.Mesh(geo, mat); surface.renderOrder = 3; surface.frustumCulled = false;
  mesh.add(under, surface);
  return {
    mesh, u,
    // a ring wave starting at radius r0 around (x, z); replaces the oldest one
    impulse(x, z, amp, r0 = 0) {
      let k = 0;
      for (let i = 1; i < N_IMP; i++) if (u.uImp.value[i].z < u.uImp.value[k].z) k = i;
      u.uImp.value[k].set(x, z, uTime.value, amp); u.uR0.value[k] = r0;
    },
  };
}

export function createNeck(color) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 56, 24, true);
  geo.translate(0, -0.5, 0); // y: 0 at the daikon, −1 at the surface
  const u = { uTop: { value: 0.03 }, uBot: { value: 0.032 }, uWaist: { value: 0.02 }, uLen: { value: 0.001 } };
  const mat = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.8, roughness: 0.05, ior: 1.34, envMapIntensity: 1.3 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform float uTop, uBot, uWaist, uLen;
        float neckR(float s) { float b = mix(uTop, uBot, s); return b - (b - uWaist) * pow(max(sin(3.14159265 * s), 0.0), 0.7); }`)
      .replace('#include <beginnormal_vertex>', /* glsl */`
        float nS = clamp(-position.y, 0.0, 1.0);
        float nR = neckR(nS);
        float nS2 = min(nS + 0.01, 1.0), nS1 = nS2 - 0.01;
        float nDr = (neckR(nS2) - neckR(nS1)) / 0.01;
        vec3 nRad = normalize(vec3(position.x, 0.0, position.z));
        vec3 objectNormal = normalize(nRad + vec3(0.0, nDr / max(uLen, 0.0001), 0.0));`)
      .replace('#include <begin_vertex>', /* glsl */`
        vec3 transformed = vec3(nRad.x * nR, position.y * uLen, nRad.z * nR);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false; mesh.renderOrder = 3;
  return { mesh, u };
}
