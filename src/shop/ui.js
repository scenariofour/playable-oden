// The order slip and the small floating feedback (price pops, toasts). The slip only ever renders a model the scene
// derives from where the pieces actually are, so the bowl and the slip cannot disagree. Its button puts the finished
// bowl in the cart (shop.js shows the cart and the checkout).
import { FOODS, ORDER } from '../station/foods.js';

const $ = (s) => document.querySelector(s);
export const yen = (n) => '¥' + n.toLocaleString('ja-JP');
// tiny silhouettes, like the marks on a konbini receipt: enough to scan the slip at a glance
export const ICONS = {
  daikon: '<circle cx="8" cy="8" r="6.2" fill="#e8cf96" stroke="#b97a33" stroke-width="1.4"/><path d="M5.6 5.6 10.4 10.4M10.4 5.6 5.6 10.4" stroke="#a8682a" stroke-width="0.9" stroke-linecap="round"/>',
  egg: '<ellipse cx="8" cy="8.4" rx="4.6" ry="6" fill="#c48a4c"/><ellipse cx="6.6" cy="6.4" rx="1.3" ry="1.8" fill="#e6b886"/>',
  kinchaku: '<path d="M4 9.5C4 13.5 12 13.5 12 9.5 12 7.2 10 6 9.2 5.2H6.8C6 6 4 7.2 4 9.5Z" fill="#cf9c55"/><path d="M6 3.4 8 4.6 10 3.4" stroke="#cf9c55" stroke-width="1.6" fill="none" stroke-linecap="round"/><rect x="6.2" y="4.7" width="3.6" height="1.3" rx="0.6" fill="#8e5a2a"/>',
  chikuwa: '<rect x="1.8" y="5" width="11" height="6" rx="3" fill="#b8743a"/><ellipse cx="12.4" cy="8" rx="2.2" ry="3" fill="#efdfbd"/><circle cx="12.4" cy="8" r="1.1" fill="#b38f5f"/>',
  konnyaku: '<path d="M8 2.6 13.6 12.6H2.4Z" fill="#7d7068" stroke="#7d7068" stroke-width="1.2" stroke-linejoin="round"/><circle cx="7" cy="9" r="0.6" fill="#2a2320"/><circle cx="9.4" cy="10.4" r="0.6" fill="#2a2320"/><circle cx="8.2" cy="6.8" r="0.5" fill="#2a2320"/>',
  tsumire: '<path d="M1.5 14.5 14.5 1.5" stroke="#d8c08a" stroke-width="1.2" stroke-linecap="round"/><circle cx="4.6" cy="11.4" r="2.3" fill="#8a7260"/><circle cx="7.6" cy="8.4" r="2.3" fill="#8a7260"/><circle cx="10.6" cy="5.4" r="2.3" fill="#8a7260"/>',
};
export const icon = (k) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${ICONS[k]}</svg>`;

export function createSlip({ onAdd, onRemove, onUndo, onDone }) {
  const slip = $('#slip'), head = $('.slip-head'), lines = $('#lines'), empty = $('.empty'), count = $('.slip-count');
  const total = $('#total'), done = $('#done'), undo = $('#undo'), title = $('.slip-title');
  const hint = $('#hint'), toastEl = $('#toast'), stage = $('#stage'), menu = $('#menu');
  const sheet = matchMedia('(max-aspect-ratio: 4/5), (max-width: 620px)');
  const isSheet = () => sheet.matches || document.body.classList.contains('framed');
  let prevQty = {}, toastTimer = 0, lastPop = 0, popStack = 0;

  head.addEventListener('click', () => { if (!isSheet()) return; const o = slip.classList.toggle('open'); head.setAttribute('aria-expanded', o); });
  lines.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    (b.dataset.act === 'add' ? onAdd : onRemove)(b.closest('[data-key]').dataset.key);
  });
  undo.addEventListener('click', () => onUndo());
  done.addEventListener('click', () => {
    onDone();
    slip.classList.remove('open'); head.setAttribute('aria-expanded', false); // fold the sheet so the fresh bowl shows
  });
  // the menu: on a phone a strip of chips in the sheet (the in-world price cards would be too small to read there);
  // on a wide screen visually hidden, for keyboards and screen readers
  menu.innerHTML = ORDER.map((k) => `<button type="button" class="chip" data-key="${k}" aria-label="Add ${FOODS[k].en}, ${yen(FOODS[k].price)}">
    <svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${ICONS[k]}</svg><span class="cn"><b>${FOODS[k].en}</b><small>${yen(FOODS[k].price)} <span lang="ja">${FOODS[k].jp}</span></small></span><span class="badge" hidden></span></button>`).join('');
  const chips = Object.fromEntries([...menu.querySelectorAll('.chip')].map((b) => [b.dataset.key, b]));
  let closedH = 0;
  menu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) onAdd(b.dataset.key); });

  // m: { lines: [{ key, qty, adding, leaving, avail }], count, total, pending, full, canUndo, menu, phase, bowlNo, inCart }
  function render(m) {
    const serving = m.phase === 'serving';
    title.textContent = serving ? 'A fresh bowl' : `Bowl ${m.bowlNo}`;
    const pieces = m.count === 1 ? '1 item' : `${m.count} items`;
    count.textContent = m.pending ? `${pieces} · +${m.pending} on the way` : pieces;
    total.textContent = yen(m.total);
    done.disabled = serving || m.count === 0 || m.pending > 0;
    done.innerHTML = serving ? 'Added to cart<small>a fresh bowl is coming…</small>'
      : `Add to cart<small>${m.pending ? 'wait for the tongs…' : m.count ? `this bowl · ${yen(m.total)}` : 'pick something first'}</small>`;
    undo.disabled = serving || !m.canUndo;
    empty.hidden = m.lines.length > 0;
    let changed = false;
    lines.innerHTML = m.lines.map((l) => {
      const f = FOODS[l.key];
      const bump = prevQty[l.key] !== undefined && prevQty[l.key] !== l.qty;
      changed ||= bump;
      const pend = l.adding ? ` <span class="pend">+${l.adding} coming</span>` : l.leaving ? ` <span class="pend">−${l.leaving} going back</span>` : '';
      return `<li class="line${bump ? ' bump' : ''}" data-key="${l.key}">
        ${icon(l.key)}
        <span class="nm"><b>${f.en}</b><small><span lang="ja">${f.jp}</span> · ${yen(f.price)}${f.unit === 'piece' ? '' : ' / ' + f.unit}${pend}</small></span>
        <span class="step"><button type="button" data-act="remove" aria-label="Remove one ${f.en}" ${l.qty + l.adding > 0 && !serving ? '' : 'disabled'}>−</button><span class="q" aria-label="${l.qty} in bowl">${l.qty}</span><button type="button" data-act="add" aria-label="Add one ${f.en}" ${l.avail > 0 && !m.full && !serving ? '' : 'disabled'}>+</button></span>
        <span class="amt">${yen(l.qty * f.price)}</span></li>`;
    }).join('');
    prevQty = Object.fromEntries(m.lines.map((l) => [l.key, l.qty]));
    for (const c of m.menu) {
      const b = chips[c.key], badge = b.lastElementChild, n = c.qty + c.adding;
      badge.hidden = !n; badge.textContent = n;
      const f = FOODS[c.key], status = c.avail ? '' : c.restocking ? 'Restocking' : 'Sold out';
      b.classList.toggle('out', c.avail === 0); b.querySelector('small').innerHTML = status || `${yen(f.price)} <span lang="ja">${f.jp}</span>`;
      b.setAttribute('aria-label', status ? `${f.en}: ${status.toLowerCase()}` : `Add ${f.en}, ${yen(f.price)}`);
    }
    if (changed) { slip.classList.remove('bump'); void slip.offsetWidth; slip.classList.add('bump'); }
    if (m.count + m.pending > 0 || m.inCart || m.bowlNo > 1) hint.hidden = true;
  }

  return {
    render,
    // a little "+¥100" that rises from a point on screen (px, relative to the stage)
    pop(text, x, y, kind = '') {
      const el = document.createElement('div'); el.className = 'pop' + (kind ? ' ' + kind : ''); el.textContent = text;
      const now = performance.now(); popStack = now - lastPop < 700 ? Math.min(popStack + 1, 2) : 0; lastPop = now; // quick picks stack instead of overlapping
      el.style.left = x + 'px'; el.style.top = y - popStack * 30 + 'px'; stage.appendChild(el);
      setTimeout(() => el.remove(), 1300);
    },
    toast(text) {
      toastEl.textContent = text; toastEl.hidden = false;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
    },
    // the part of the screen the 3D set should keep clear of the slip (and the cart button above it), in px
    reserve() {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (isSheet()) {
        if (!slip.classList.contains('open')) closedH = slip.offsetHeight;
        return { right: 0, bottom: Math.min(h * 0.36, (closedH || 150) + 14), top: 64 };
      }
      return { right: Math.min(slip.offsetWidth + 24, w * 0.4), bottom: 0, top: 40 };
    },
  };
}
