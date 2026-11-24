import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.ico', 'image/x-icon'],
]);

function isInside(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function browserPath(requestUrl) {
  // Inspect the raw path before URL normalization can erase traversal segments.
  const encoded = (requestUrl || '/').split('?')[0];
  let decoded;
  try { decoded = decodeURIComponent(encoded); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) return null;
  if (decoded.split('/').some(segment => segment === '..' || segment.startsWith('.'))) return null;
  if (decoded === '/') return 'index.html';
  const relative = decoded.slice(1);
  if (relative === 'index.html' || relative === 'favicon.svg') return relative;
  if (relative.startsWith('src/') || relative.startsWith('public/')) return relative;
  return null;
}

export function createStaticServer({ root = projectRoot } = {}) {
  const rootPath = path.resolve(root);
  return http.createServer(async (request, response) => {
    const reply = (status, text) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : text);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      reply(405, 'Method not allowed');
      return;
    }
    const relative = browserPath(request.url);
    if (!relative) { reply(404, 'Not found'); return; }
    try {
      const [canonicalRoot, filename] = await Promise.all([
        realpath(rootPath), realpath(path.join(rootPath, relative)),
      ]);
      const canonicalRelative = path.relative(canonicalRoot, filename).split(path.sep).join('/');
      if (!isInside(canonicalRoot, filename) || !browserPath(`/${canonicalRelative}`)) {
        reply(404, 'Not found'); return;
      }
      const info = await stat(filename);
      if (!info.isFile()) { reply(404, 'Not found'); return; }
      response.writeHead(200, {
        'Content-Type': mimeTypes.get(path.extname(filename).toLowerCase()) || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      });
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = createReadStream(filename);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) reply(404, 'Not found');
      else reply(500, 'Could not read the file');
    }
  });
}

function optionsFrom(argv) {
  const options = { host: '127.0.0.1', port: process.env.PORT || '3000', directory: projectRoot };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (!['--host', '--port', '--directory'].includes(flag) || !argv[index + 1]) {
      throw new Error('Usage: npm start -- [--host 127.0.0.1] [--port 3000] [--directory dist]');
    }
    const value = argv[++index];
    options[flag.slice(2)] = value;
  }
  options.port = Number(options.port);
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error('Port must be an integer between 0 and 65535.');
  }
  options.root = path.resolve(options.directory);
  return options;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = optionsFrom(process.argv.slice(2));
    const server = createStaticServer(options);
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const host = options.host.includes(':') ? `[${options.host}]` : options.host;
      console.log(`Sushi Rush 60: http://${host}:${address.port}`);
      console.log('Press Ctrl+C to stop.');
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => server.close(() => process.exit(0)));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
