import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production build includes and rewrites Lost Signal stylesheet', async () => {
  const build = await readFile(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.match(build, /\['styles\.css','mobile\.css','signal\.css'\]/);
  assert.match(build, /signalCss/);
  assert.match(build, /css\\\/signal\\\.css/);
});
