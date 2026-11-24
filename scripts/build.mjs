import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const inputs = ['index.html', 'src', 'public'];
for (const input of inputs) await stat(path.join(root, input));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const input of inputs) {
  await cp(path.join(root, input), path.join(output, input), {
    recursive: true,
    filter: source => !source.endsWith('.test.js') && !path.basename(source).startsWith('.'),
  });
}
console.log('Built dist/ with local browser assets. No packages or network required.');
