// The project's seams, checked from the source: the station stands alone, the page loads the shop entry, and every
// product on the menu has what the shop UI needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { normalize } from 'node:path';
import { moduleGraph, ENTRY, STATION_ENTRY } from '../scripts/build.mjs';

test('the station only imports station modules (and three)', () => {
  const graph = moduleGraph(STATION_ENTRY);
  assert.ok(graph.every((f) => f.startsWith(normalize('src/station/'))), graph.join(', '));
  const files = readdirSync('src/station').filter((f) => f.endsWith('.js')).map((f) => normalize(`src/station/${f}`)).sort();
  assert.deepEqual(graph, files, 'every file in src/station/ is part of the station, and nothing else is');
  for (const f of graph) {
    for (const [, spec] of readFileSync(f, 'utf8').matchAll(/from\s*['"]([^.'"][^'"]*)['"]/g)) assert.match(spec, /^three(\/addons\/.*)?$/, `${f} imports ${spec}`);
  }
});

test('the page loads the shop, and the shop reaches every shop module', () => {
  assert.match(readFileSync('index.html', 'utf8'), new RegExp(`<script type="module" src="\\./${ENTRY}">`));
  const graph = moduleGraph(ENTRY);
  for (const f of ['main', 'shop', 'checkout', 'merchant', 'ui']) assert.ok(graph.includes(normalize(`src/shop/${f}.js`)), f);
});

test('three.js is pinned to one exact version in the import map', () => {
  const urls = [...readFileSync('index.html', 'utf8').matchAll(/"(https:\/\/cdn\.jsdelivr\.net\/npm\/three@[^"]+)"/g)].map((m) => m[1]);
  assert.equal(urls.length, 2);
  assert.equal(new Set(urls.map((u) => u.match(/three@([\d.]+)/)[1])).size, 1);
});

test('every menu item has a name, a price, a unit, stock and a receipt icon', () => {
  const foods = readFileSync('src/station/foods.js', 'utf8'), ui = readFileSync('src/shop/ui.js', 'utf8');
  const order = JSON.parse(foods.match(/export const ORDER = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.equal(order.length, 6);
  for (const k of order) {
    const entry = foods.match(new RegExp(`\\n  ${k}: \\{\\n    key: '${k}', jp: '[^']+', en: '[^']+', price: (\\d+), unit: '(piece|skewer)', stock: (\\d+)`));
    assert.ok(entry, `FOODS.${k} has jp, en, price, unit and stock`);
    assert.ok(new RegExp(`\\n  ${k}: '<`).test(ui), `ICONS.${k} exists in ui.js`);
  }
});
