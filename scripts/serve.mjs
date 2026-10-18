// A tiny static file server for local development, with no dependencies.
//   node scripts/serve.mjs            serves the project root (the page works straight from source)
//   node scripts/serve.mjs dist       serves the production build
// PORT=8080 by default; HOST=127.0.0.1 by default (use HOST=0.0.0.0 to open it on a phone on the same network).
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || '.');
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.md': 'text/markdown; charset=utf-8',
};

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); }
  catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(`Playable Oden: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/  (serving ${root})`);
});
