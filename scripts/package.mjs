import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = 'sushi-rush-alignerr';
const archive = path.resolve(root, `../${name}-upload.tar.gz`);
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `${program} failed.`);
  return result.stdout.trim();
}

let temporary;
try {
  run('git', ['rev-parse', '--verify', 'HEAD']);
  if (run('git', ['status', '--porcelain'])) throw new Error('Commit all source changes before packaging.');
  const remote = run('git', ['remote', 'get-url', 'origin']);
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote)) {
    throw new Error('Use a credential-free https://github.com/owner/repository origin before packaging.');
  }
  temporary = await mkdtemp(path.join(tmpdir(), 'sushi-rush-upload-'));
  const template = path.join(temporary, 'empty-template');
  await mkdir(template);
  const checkout = path.join(temporary, name);
  run('git', ['clone', '--no-hardlinks', '--single-branch', '--no-tags', `--template=${template}`, root, checkout]);
  // Construct a portable config rather than copying local auth/configuration.
  await writeFile(path.join(checkout, '.git/config'), `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n[remote "origin"]\n\turl = ${remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "main"]\n\tremote = origin\n\tmerge = refs/heads/main\n`);
  await rm(path.join(checkout, '.git/logs'), { recursive: true, force: true });
  run('tar', ['-czf', archive, '-C', temporary, name]);
  console.log(`Upload archive: ${archive}`);
  console.log(`Commit: ${run('git', ['rev-parse', 'HEAD'])}`);
  console.log('Contains committed source and .git; excludes ignored local files and credentials.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
