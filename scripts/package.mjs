import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = 'sushi-rush-alignerr';
const outputDirectory = path.resolve(root, '..');
const safeEnvironment = { ...process.env };
for (const key of Object.keys(safeEnvironment)) {
  if (key === 'EMAIL' || key.startsWith('GIT_')) delete safeEnvironment[key];
}
Object.assign(safeEnvironment, {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  COPYFILE_DISABLE: '1',
});

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: safeEnvironment, ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Tool diagnostics can contain machine-specific paths or identities.
    throw new Error(`${program} failed while preparing the upload.`);
  }
  return typeof result.stdout === 'string' ? result.stdout.trim() : result.stdout;
}

const forbiddenPatterns = [
  new RegExp('[A-Z0-9._%+\\-]+' + String.fromCharCode(64) + '[A-Z0-9.\\-]+\\.[A-Z]{2,}', 'i'),
  new RegExp(['street', 'sushi'].join('[\\s_-]*'), 'i'),
];
function checkBytes(bytes, location) {
  const value = bytes.toString('latin1');
  if (forbiddenPatterns.some(pattern => pattern.test(value))) {
    throw new Error(`Upload scan rejected identity or branding content in ${location}.`);
  }
}

async function checkFiles(directory, relative = '') {
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const filename = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Upload cannot include a symbolic link: ${filename}`);
    if (entry.isDirectory()) await checkFiles(directory, filename);
    else if (entry.isFile()) checkBytes(await readFile(path.join(directory, filename)), filename);
    else throw new Error(`Upload cannot include a special file: ${filename}`);
  }
}

function checkGitObjects(checkout) {
  const objects = run('git', ['cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)'], { cwd: checkout });
  for (const object of objects.split('\n').filter(Boolean)) {
    const [sha, type] = object.split(' ');
    const bytes = run('git', ['cat-file', type, sha], { cwd: checkout, encoding: null });
    checkBytes(bytes, `Git ${type} object ${sha}`);
  }
}

let temporary;
try {
  const sourceCommit = run('git', ['rev-parse', '--verify', 'HEAD']);
  if (run('git', ['status', '--porcelain'])) throw new Error('Commit all source changes before packaging.');
  const remote = run('git', ['remote', 'get-url', 'origin']);
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote)) {
    throw new Error('Use a credential-free HTTPS GitHub origin before packaging.');
  }
  const trackedFiles = run('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD']).split('\0').filter(Boolean);
  for (const filename of trackedFiles) {
    if (filename.split('/').some(part => ['node_modules', 'dist', '.DS_Store', '.env'].includes(part) || part.startsWith('.env.'))) {
      throw new Error(`Remove excluded local or generated files from Git before packaging: ${filename}`);
    }
  }

  temporary = await mkdtemp(path.join(tmpdir(), 'sushi-rush-upload-'));
  const checkout = path.join(temporary, name);
  await mkdir(checkout);
  const exported = path.join(temporary, 'source.tar');
  // Export tracked source only. The published repository's history is untouched.
  run('git', ['archive', '--format=tar', `--output=${exported}`, 'HEAD']);
  run('tar', ['-xf', exported, '-C', checkout]);
  await checkFiles(checkout);

  // A new anonymous history avoids carrying previous identities into the upload.
  run('git', ['init', '--template=', '-b', 'main'], { cwd: checkout });
  await writeFile(path.join(checkout, '.git/config'), `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = false\n[remote "origin"]\n\turl = ${remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "main"]\n\tremote = origin\n\tmerge = refs/heads/main\n`);
  run('git', ['add', '--all'], { cwd: checkout });
  run('git', [
    '-c', 'user.name=Project', '-c', 'user.email=',
    '-c', 'commit.gpgsign=false', '-c', 'core.logAllRefUpdates=false',
    'commit', '-m', 'Isolated desktop source snapshot',
  ], { cwd: checkout });
  await rm(path.join(checkout, '.git/logs'), { recursive: true, force: true });
  run('git', ['fsck', '--strict'], { cwd: checkout });
  if (run('git', ['status', '--porcelain'], { cwd: checkout })) throw new Error('Upload snapshot is not clean.');
  await checkFiles(checkout);
  checkGitObjects(checkout);
  const snapshotCommit = run('git', ['rev-parse', 'HEAD'], { cwd: checkout });

  const zipName = `${name}-upload.zip`;
  const tarName = `${name}-upload.tar.gz`;
  run('zip', ['-X', '-q', '-r', path.join(temporary, zipName), name], { cwd: temporary });
  const tarVersion = run('tar', ['--version']);
  const ownershipFlags = tarVersion.includes('GNU tar')
    ? ['--owner=0', '--group=0', '--numeric-owner']
    : ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root'];
  run('tar', [...ownershipFlags, '-czf', path.join(temporary, tarName), '-C', temporary, name]);
  await copyFile(path.join(temporary, zipName), path.join(outputDirectory, zipName));
  await copyFile(path.join(temporary, tarName), path.join(outputDirectory, tarName));
  console.log(`Upload ZIP: ../${zipName}`);
  console.log(`Upload TAR: ../${tarName}`);
  console.log(`Source commit: ${sourceCommit}`);
  console.log(`Anonymous snapshot commit: ${snapshotCommit}`);
  console.log('Both archives include clean source and a fresh .git folder. Identity and branding scans passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
