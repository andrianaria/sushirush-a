import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const ts = require('../vendor/typescript.cjs');
const compiledRoot = path.join(root, 'browser');
const vendors = {
  react: 'react.js', 'react-dom/client': 'react-dom-client.js',
  'react/jsx-runtime': 'jsx-runtime.js', 'lucide-react': 'lucide-react.js',
  three: 'three.js', 'three/examples/jsm/utils/BufferGeometryUtils.js': 'three-buffer-geometry.js',
};
async function sources(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sources(filename));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) files.push(filename);
  }
  return files;
}
await rm(compiledRoot, { recursive: true, force: true });
for (const filename of await sources(path.join(root, 'src'))) {
  const relative = path.relative(path.join(root, 'src'), filename).replace(/\.tsx?$/, '.js');
  const output = path.join(compiledRoot, relative);
  const source = (await readFile(filename, 'utf8'))
    .replace(/import\.meta\.env\.BASE_URL/g, "'./public/'")
    .replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
  const result = ts.transpileModule(source, {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const errors = (result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: value => value, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  const code = result.outputText.replace(/(\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g, (whole, prefix, specifier) => {
    let resolved;
    if (specifier.startsWith('.')) {
      resolved = specifier.replace(/\.tsx?$/, '.js');
      if (!/\.[a-z]+$/i.test(resolved)) resolved += '.js';
    } else {
      if (!vendors[specifier]) throw new Error(`Unknown browser dependency: ${specifier}`);
      resolved = path.relative(path.dirname(output), path.join(root, 'vendor/browser', vendors[specifier])).split(path.sep).join('/');
      if (!resolved.startsWith('.')) resolved = `./${resolved}`;
    }
    return `${prefix}'${resolved}'`;
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, code);
}
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const relative of ['index.html', 'browser', 'public', 'vendor/browser', 'src/styles.css', 'src/components/cpu-kitchen.css']) {
  const destination = path.join(dist, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, relative), destination, { recursive: true });
}
console.log('Built the original 3D game using local JavaScript tools. No downloads or native binaries.');
