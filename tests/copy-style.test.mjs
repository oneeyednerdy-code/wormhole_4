import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textExtensions = new Set(['.html', '.js', '.mjs', '.md', '.css', '.json']);
const blockedPunctuation = /[\u2013\u2014\u2018\u2019\u201c\u201d\u2026]/u;

async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return textFiles(fullPath);
    if (textExtensions.has(path.extname(entry.name)) || entry.name === '_headers') return [fullPath];
    return [];
  }));
  return nested.flat();
}

test('project text uses plain punctuation', async () => {
  for (const file of await textFiles(root)) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, blockedPunctuation, `${path.relative(root, file)} contains blocked smart punctuation`);
  }
});

test('visible copy avoids common filler phrases', async () => {
  const files = [
    'index.html',
    'privacy.html',
    'sponsorship.html',
    'signal.html',
    'README.md',
    'js/wormhole-app-v90.js',
  ];
  const blockedPhrases = /\b(seamlessly|effortlessly|game-changing|cutting-edge|more than just|actually fits|the goal is simple|designed to empower|unlock your|revolutionize)\b/i;
  for (const file of files) {
    assert.doesNotMatch(await readFile(path.join(root, file), 'utf8'), blockedPhrases, `${file} contains filler copy`);
  }
});

test('release text consistently uses the Alpha phase label', async () => {
  const productionFiles = (await textFiles(root)).filter((file) => !file.includes(`${path.sep}tests${path.sep}`));
  for (const file of productionFiles) {
    assert.doesNotMatch(await readFile(file, 'utf8'), new RegExp('\\b\\x62eta\\b', 'i'), `${path.relative(root, file)} contains an old phase label`);
  }
  assert.match(await readFile(path.join(root, 'index.html'), 'utf8'), /Alpha-0\.0\.90/);
  assert.match(await readFile(path.join(root, 'PATCH_NOTES_v90.md'), 'utf8'), /Alpha-0\.0\.90/);
});
