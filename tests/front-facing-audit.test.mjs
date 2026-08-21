import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageNames = ['index.html', 'privacy.html', 'sponsorship.html', 'signal.html'];
const pages = await Promise.all(pageNames.map(async (name) => ({
  name,
  source: await readFile(new URL(`../${name}`, import.meta.url), 'utf8'),
})));

test('every public page provides core document metadata', () => {
  for (const { name, source } of pages) {
    assert.match(source, /<html lang="en">/, `${name} needs a document language`);
    assert.match(source, /<meta name="viewport"/, `${name} needs a mobile viewport`);
    assert.match(source, /<title>[^<]+<\/title>/, `${name} needs a page title`);
    assert.match(source, /<meta name="description" content="[^"]+" \/>/, `${name} needs a description`);
    assert.match(source, /<h1\b/, `${name} needs a primary heading`);
  }
});

test('public links opened in a new tab use safe relationship attributes', () => {
  for (const { name, source } of pages) {
    const externalLinks = [...source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((match) => match[0]);
    for (const link of externalLinks) {
      assert.match(link, /rel="[^"]*noopener[^"]*"/, `${name} has an unsafe new-tab link`);
      assert.match(link, /rel="[^"]*noreferrer[^"]*"/, `${name} has an unsafe referrer link`);
    }
  }
});

test('Lost Signal is a human story with no creator or AI plot language', async () => {
  const story = await readFile(new URL('../js/lost-signal-engine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(story, /\b(ai|artificial intelligence|algorithm|creator|streamer|twitch|social media)\b/i);
  assert.match(story, /No one chose the pods while anyone was still missing/);
  assert.match(story, /wraps a blanket around your shoulders/);
});

test('Lost Signal states that nothing is downloaded', () => {
  const signal = pages.find(({ name }) => name === 'signal.html').source;
  assert.match(signal, /Nothing is downloaded\./);
});
