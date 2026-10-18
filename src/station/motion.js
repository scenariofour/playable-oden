// Small motion kit: easing curves, a damped spring and a generator-based tween.
// A choreography is a generator: `yield* tween(0.3, u => ...)` runs one beat; the scene loop feeds it `dt`.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const ease = {
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

// Semi-implicit Euler with fixed substeps, so stiff springs stay stable at 30 fps.
export class Spring {
  constructor(value = 0, k = 170, c = 26) { this.value = value; this.target = value; this.v = 0; this.k = k; this.c = c; }
  set(v) { this.value = this.target = v; this.v = 0; return this; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.value - this.target) - this.c * this.v;
      this.v += a * h; this.value += this.v * h;
    }
    return this.value;
  }
}

export function* tween(duration, fn) {
  let t = 0;
  fn(0);
  while (t < duration) { t += yield; fn(Math.min(1, t / duration)); }
}

export function* wait(duration) { let t = 0; while (t < duration) t += yield; }

export function bezier3(out, p0, p1, p2, p3, t) {
  const s = 1 - t, a = s * s * s, b = 3 * s * s * t, c = 3 * s * t * t, d = t * t * t;
  return out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  );
}
