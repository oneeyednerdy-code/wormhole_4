import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const page = await readFile(new URL('../signal.html', import.meta.url), 'utf8');
const browserGame = await readFile(new URL('../js/lost-signal-game.js', import.meta.url), 'utf8');
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');

test('the subtle footer entrance opens the standalone game', () => {
  assert.match(index, /href="signal\.html"[^>]*>Signal detected<\/a>/);
  assert.match(page, /Wormhole: Lost Signal/);
  assert.match(page, /href="index\.html">Return to Wormhole<\/a>/);
});

test('the game is keyboard and screen-reader operable', () => {
  assert.match(page, /<label[^>]*for="command-input"/);
  assert.match(page, /id="game-output"[^>]*role="log"[^>]*aria-label="Game transcript"/);
  assert.match(page, /id="game-announcer"[^>]*aria-live="polite"/);
  assert.match(page, /type="submit">Enter command<\/button>/);
  assert.match(browserGame, /event\.key === 'ArrowUp'/);
  assert.match(browserGame, /event\.key === 'ArrowDown'/);
});

test('the game uses an isolated save key and imports no Twitch modules', () => {
  assert.match(browserGame, /wormhole_lost_signal_save_v1/);
  assert.doesNotMatch(browserGame, /twitch|oauth|access_token/i);
  assert.doesNotMatch(page, /wormhole-app|twitch-auth|twitch-api/i);
  assert.doesNotMatch(browserGame, /\bBlob\b|createObjectURL|\.download\s*=|downloadFile/);
});

test('all game assets and imports use the current cache version', () => {
  for (const asset of [
    'assets/favicon.ico',
    'assets/wormhole-logo.svg',
    'css/signal.css',
    'js/appearance-boot.js',
    'js/version-check.js',
    'js/lost-signal-game.js',
  ]) {
    assert.match(page, new RegExp(`${asset.replaceAll('.', '\\.')}\\?v=91`));
  }
  assert.match(browserGame, /lost-signal-engine\.js\?v=91/);
  assert.match(headers, /\/signal\.html\s+Cache-Control: no-store, max-age=0/);
});
