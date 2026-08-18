import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the entry point and complete browser module graph share one cache version', async () => {
  const indexHtml = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
  const entryVersion = indexHtml.match(/js\/wormhole-app-v49\.js\?v=(\d+)/)?.[1];
  assert.ok(entryVersion, 'index.html must version the app entry point');

  const jsDirectory = path.join(projectRoot, 'js');
  const files = (await readdir(jsDirectory)).filter((name) => name.endsWith('.js'));
  for (const file of files) {
    const source = await readFile(path.join(jsDirectory, file), 'utf8');
    const localImports = [...source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)];
    for (const [, specifier] of localImports) {
      assert.equal(
        specifier.match(/\?v=(\d+)$/)?.[1],
        entryVersion,
        `${file} imports ${specifier} without the current release version`
      );
    }
  }
});
