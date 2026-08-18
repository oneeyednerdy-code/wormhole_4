import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/wormhole-app-v63.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');

function luminance(hex) {
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('every static and generated image declares an alt attribute', () => {
  for (const source of [html, app]) {
    const images = [...source.matchAll(/<img\b[^>]*>/gs)].map((match) => match[0]);
    assert.ok(images.length > 0);
    for (const image of images) assert.match(image, /\balt=/);
  }
  assert.match(app, /el\.userAvatar\.alt = ''/);
  assert.match(app, /el\.raidProgressAvatar\.alt = `\$\{target\.stream\.user_name\} live preview`/);
});

test('embedded Twitch content and action dialogs have accessible names', () => {
  for (const iframe of html.matchAll(/<iframe\b[^>]*>/gs)) assert.match(iframe[0], /\btitle=/);
  assert.match(html, /id="raid-dialog"[^>]*aria-labelledby="raid-dialog-title"/);
  assert.match(html, /id="raid-progress-dialog"[^>]*aria-labelledby="raid-progress-title"/);
});

test('low-vision controls are available before and after login', () => {
  assert.match(html, /id="login-contrast-toggle"[^>]*data-contrast-toggle/);
  assert.match(html, /class="skip-link" href="#discovery-view"/);
  assert.ok((html.match(/data-open-accessibility/g) ?? []).length >= 3);
  for (const size of ['100', '125', '150', '200']) {
    assert.match(html, new RegExp(`<option value="${size}">${size}%<\\/option>`));
  }
});

test('primary button gradient meets normal-text contrast against white', () => {
  for (const color of ['#7c3aed', '#6d28d9', '#5b21b6']) {
    assert.ok(contrastRatio(color, '#ffffff') >= 4.5, `${color} must reach 4.5:1 against white`);
  }
  assert.doesNotMatch(css, /#666876/i);
});

test('magnification, forced colors, reduced motion, and dismissible notices are supported', () => {
  assert.match(css, /html\[data-text-scale='200'\] \{ font-size: 200%; \}/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /html\[data-reduce-motion\]/);
  assert.match(html, /id="toast-close"[^>]*aria-label="Dismiss notification"/);
  assert.match(app, /10_000/);
  assert.match(app, /preferredScrollBehavior\(\)/);
});
