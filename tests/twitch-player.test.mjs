import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTwitchPlayerUrl, buildTwitchWatchUrl } from '../js/twitch-player.js';

test('builds a non-autoplay live player for the hosting domain', () => {
  const url = new URL(buildTwitchPlayerUrl({ hostname: 'wormhole.example', channel: 'OneEyedNerdy' }));
  assert.equal(url.origin, 'https://player.twitch.tv');
  assert.equal(url.searchParams.get('channel'), 'oneeyednerdy');
  assert.equal(url.searchParams.get('parent'), 'wormhole.example');
  assert.equal(url.searchParams.get('autoplay'), 'false');
  assert.equal(url.searchParams.get('muted'), 'true');
});

test('builds a VOD player with Twitch v prefix and no channel override', () => {
  const url = new URL(buildTwitchPlayerUrl({ hostname: 'wormhole.example', videoId: 'v123456' }));
  assert.equal(url.searchParams.get('video'), 'v123456');
  assert.equal(url.searchParams.has('channel'), false);
  assert.equal(buildTwitchWatchUrl({ videoId: '123456' }), 'https://www.twitch.tv/videos/123456');
});

test('rejects missing hosts and invalid media identifiers', () => {
  assert.equal(buildTwitchPlayerUrl({ hostname: '', channel: 'oneeyednerdy' }), null);
  assert.equal(buildTwitchPlayerUrl({ hostname: 'wormhole.example', videoId: 'not-a-vod' }), null);
  assert.equal(buildTwitchWatchUrl({ channel: 'bad/name' }), null);
});
