import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the entry point and complete browser module graph share one cache version', async () => {
  const indexHtml = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
  const entryVersion = indexHtml.match(/js\/wormhole-app-v66\.js\?v=(\d+)/)?.[1];
  assert.ok(entryVersion, 'index.html must version the app entry point');
  const manifest = JSON.parse(await readFile(path.join(projectRoot, 'version.json'), 'utf8'));
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.cacheVersion, entryVersion);
  assert.equal(manifest.version, packageJson.version);
  assert.match(indexHtml, new RegExp(`name="wormhole-release" content="${manifest.version.replaceAll('.', '\\.')}"`));
  assert.match(indexHtml, new RegExp(`name="wormhole-cache-version" content="${entryVersion}"`));
  for (const asset of [
    'assets/favicon.ico',
    'assets/wormhole-logo.svg',
    'css/styles.css',
    'css/mobile.css',
    'js/appearance-boot.js',
    'js/version-check.js',
  ]) {
    assert.match(
      indexHtml,
      new RegExp(`${asset.replaceAll('.', '\\.')}\\?v=${entryVersion}`),
      `${asset} must use the current cache version`
    );
  }

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
