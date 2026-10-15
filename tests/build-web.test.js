import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildWeb, WEB_ASSETS } from '../scripts/build-web.mjs';

test('Desktop bundle copies only allowlisted assets (including linked roadmap)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-web-test-'));
  try {
    for (const path of WEB_ASSETS) {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, path);
    }
    await mkdir(join(root, 'src-tauri'), { recursive: true });
    await writeFile(join(root, 'src-tauri', 'secrets.txt'), 'never bundle');
    await writeFile(join(root, 'README.md'), 'unapproved documentation');
    const count = await buildWeb({ sourceRoot: root, outputRoot: join(root, 'dist') });
    assert.equal(count, WEB_ASSETS.length);
    for (const path of WEB_ASSETS) assert.equal(await readFile(join(root, 'dist', path), 'utf8'), path);
    const actual = await readdir(join(root, 'dist'));
    assert.deepEqual(actual.sort(), ['assets', 'docs', 'index.html', 'js', 'styles.css']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
