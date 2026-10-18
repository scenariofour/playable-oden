// In-world price cards, one per compartment, like the little cards clipped to a konbini oden case:
// name, demo price, unit, and a row of dots for how many are left. Sold out / restocking shows as a stamp.
// { price: false } draws the same card without a price (inside RIRRI'S, where nothing is for sale).
import * as THREE from 'three';

const FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", sans-serif';
let fontsReady = false;
const fontWaiters = new Set();
if (document.fonts) Promise.all(['700 54px', '800 52px', '500 26px'].map((w) => document.fonts.load(`${w} "Zen Maru Gothic"`))).then(() => { fontsReady = true; for (const f of fontWaiters) f(); });

export function createTag(def, { price = true } = {}) {
  const W = 384, H = 168, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const w = 0.074, mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * H / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  mesh.renderOrder = 4; mesh.name = 'tag-' + def.key;
  let last = '', state = { avail: def.stock, stock: def.stock, restocking: false, hover: false };
  const rr = (x, y, ww, hh, r) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); };
  function draw(next = state) {
    state = next;
    const { avail, stock, restocking, hover } = state;
    const key = [avail, stock, restocking, hover, fontsReady].join();
    if (key === last) return; last = key;
    g.clearRect(0, 0, W, H);
    rr(8, 12, W - 16, H - 18, 24); g.fillStyle = '#e2cfbd'; g.fill();                 // the card's lip
    rr(8, 6, W - 16, H - 20, 24); g.fillStyle = hover ? '#fff4e4' : '#fbf3e4'; g.fill();
    if (hover) { g.lineWidth = 6; g.strokeStyle = '#df7558'; g.stroke(); }
    g.save(); rr(8, 6, W - 16, H - 20, 24); g.clip(); g.fillStyle = def.swatch; g.fillRect(8, 6, 20, H); g.restore();
    g.fillStyle = '#4d3d52'; g.textBaseline = 'alphabetic';
    g.textAlign = 'left'; g.font = `700 50px ${FONT}`; g.fillText(def.jp, 44, 66);
    g.font = `500 25px ${FONT}`; g.fillStyle = 'rgba(77,61,82,0.7)'; g.fillText(def.en, 46, 102);
    if (price) {
      g.textAlign = 'right'; g.fillStyle = '#4d3d52'; g.font = `800 50px ${FONT}`; g.fillText('¥' + def.price, W - 26, 66);
      g.font = `500 22px ${FONT}`; g.fillStyle = 'rgba(77,61,82,0.6)'; g.fillText('/ ' + def.unit, W - 26, 100);
    }
    for (let i = 0; i < stock; i++) {
      g.beginPath(); g.arc(52 + i * 28, 128, 9, 0, Math.PI * 2);
      if (i < avail) { g.fillStyle = '#c9744f'; g.fill(); } else { g.lineWidth = 3; g.strokeStyle = 'rgba(77,61,82,0.35)'; g.stroke(); }
    }
    if (avail === 0) {
      rr(8, 6, W - 16, H - 20, 24); g.fillStyle = 'rgba(251,243,228,0.72)'; g.fill();
      g.save(); g.translate(W / 2, H / 2); g.rotate(-0.07);
      const label = restocking ? 'Restocking · 補充中' : 'Sold out · 売り切れ';
      g.font = `800 ${restocking ? 34 : 36}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(label).width + 36;
      rr(-tw / 2, -30, tw, 60, 14); g.lineWidth = 5; g.strokeStyle = '#df7558'; g.stroke();
      g.fillStyle = '#df7558'; g.fillText(label, 0, 2);
      g.restore();
    }
    tex.needsUpdate = true;
  }
  fontWaiters.add(() => { last = ''; draw(); });
  draw();
  return { mesh, draw, def, get state() { return state; } };
}
