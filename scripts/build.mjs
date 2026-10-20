// Production build: copies only what the page loads into dist/, ready for any static host.
// There is no bundling or transpiling. The page already runs as plain ES modules; three.js comes from a pinned CDN
// URL in index.html's import map. The build follows every relative import from the entry module, so a missing file
// fails here rather than in a visitor's browser, and it checks that the station never imports the shop.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENTRY = 'src/shop/main.js';
export const STATION_ENTRY = 'src/station/station.js';
const STATIC = ['index.html', 'favicon.svg', 'social.jpg'];

// every local module reachable from `entry` through relative imports
export function moduleGraph(entry) {
  const seen = new Set();
  (function walk(file) {
    file = normalize(file);
    if (seen.has(file)) return;
    if (!existsSync(file)) throw new Error(`Missing module: ${file}`);
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const [, spec] of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) walk(join(dirname(file), spec));
  })(entry);
  return [...seen].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const station = moduleGraph(STATION_ENTRY);
  const shopInStation = station.filter((f) => !f.startsWith(normalize('src/station/')));
  if (shopInStation.length) throw new Error(`The station must not import outside src/station/: ${shopInStation.join(', ')}`);

  const html = readFileSync('index.html', 'utf8');
  if (!html.includes(`src="./${ENTRY}"`)) throw new Error(`index.html does not load ./${ENTRY}`);

  rmSync('dist', { recursive: true, force: true });
  const files = [...STATIC, ...moduleGraph(ENTRY)];
  for (const f of files) { mkdirSync(dirname(join('dist', f)), { recursive: true }); copyFileSync(f, join('dist', f)); }
  console.log(`dist/: ${files.length} files\n  ${files.join('\n  ')}`);
}
