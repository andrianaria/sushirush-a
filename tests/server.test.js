import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStaticServer } from '../scripts/server.mjs';

let directory;
let server;
let port;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'sushi-rush-server-'));
  await mkdir(path.join(directory, 'src'));
  await mkdir(path.join(directory, 'public/menu'), { recursive: true });
  await mkdir(path.join(directory, '.git'));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Sushi Rush</title>');
  await writeFile(path.join(directory, 'src/app.js'), 'export const ready = true;');
  await writeFile(path.join(directory, 'public/menu/roll.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>');
  await writeFile(path.join(directory, '.git/config'), 'private repository configuration');
  await writeFile(path.join(directory, '.env'), 'PRIVATE=hidden');
  await writeFile(path.join(directory, 'outside.txt'), 'not a browser asset');
  await symlink(path.join(directory, '.env'), path.join(directory, 'public/leak.txt'));
  server = createStaticServer({ root: directory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

function request(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves the page, browser modules, and local menu assets with correct content types', async () => {
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>Sushi Rush<\/title>/);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.equal((await request('/src/app.js?version=1')).headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal((await request('/public/menu/roll.svg')).headers['content-type'], 'image/svg+xml');
  assert.match(page.headers['content-security-policy'], /default-src 'self'/);
});

test('HEAD returns metadata without sending a response body', async () => {
  const response = await request('/', 'HEAD');
  assert.equal(response.status, 200);
  assert.equal(response.body, '');
  assert.ok(Number(response.headers['content-length']) > 0);
});

test('rejects hidden files, source traversal, malformed URLs, and unsupported methods', async () => {
  for (const url of ['/.git/config', '/.env', '/outside.txt', '/src/../.env', '/public/%2e%2e/.env', '/public/%5c../.env', '/public/%00', '/public/%ZZ']) {
    assert.equal((await request(url)).status, 404, url);
  }
  const response = await request('/', 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
});

test('does not expose hidden files through symlinks', async () => {
  // Symlinks within the browser tree may not point to hidden/private files.
  const response = await request('/public/leak.txt');
  assert.equal(response.status, 404);
});
