// Copy the 3D station (src/station/) into another project that embeds it, or check that its copy is current.
//
//   node scripts/sync-station.mjs <target-dir> --check   report which files differ; changes nothing (exit 1 on drift)
//   node scripts/sync-station.mjs <target-dir>           copy the station files and write <target-dir>/STATION_VERSION.json
//
// The station is a set of plain ES modules with one external import ('three', resolved by the host's import map).
// A host vendors the files at one folder and imports station.js from there. See docs/EMBEDDING.md.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { moduleGraph, STATION_ENTRY } from './build.mjs';

const [target, flag] = process.argv.slice(2);
if (!target) { console.error('Usage: node scripts/sync-station.mjs <target-dir> [--check]'); process.exit(2); }
if (!existsSync(target)) { console.error(`No such folder: ${target}`); process.exit(2); }

const files = moduleGraph(STATION_ENTRY);
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const rows = files.map((f) => {
  const dest = join(target, basename(f));
  const state = !existsSync(dest) ? 'missing' : hash(dest) === hash(f) ? 'same' : 'differs';
  return { file: basename(f), src: f, dest, state };
});

let commit = 'unknown', dirty = false;
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/station'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== '';
} catch { /* not a git checkout */ }

if (flag === '--check') {
  for (const r of rows) console.log(`${r.state.padEnd(8)} ${r.file}`);
  const drift = rows.filter((r) => r.state !== 'same');
  console.log(drift.length ? `\n${drift.length} station file(s) differ from playable-oden ${commit}.` : `\n${target} matches playable-oden ${commit}${dirty ? ' (with uncommitted station changes)' : ''}.`);
  process.exit(drift.length ? 1 : 0);
}

for (const r of rows) copyFileSync(r.src, r.dest);
writeFileSync(join(target, 'STATION_VERSION.json'), JSON.stringify({
  source: 'playable-oden', commit, dirty, syncedAt: new Date().toISOString().slice(0, 10),
  files: Object.fromEntries(rows.map((r) => [r.file, hash(r.src).slice(0, 16)])),
}, null, 2) + '\n');
console.log(`Copied ${rows.length} station files to ${target} (playable-oden ${commit}${dirty ? ', uncommitted changes' : ''}):`);
for (const r of rows) console.log(`  ${r.state === 'same' ? 'unchanged' : r.state === 'missing' ? 'added    ' : 'updated  '} ${r.file}`);
