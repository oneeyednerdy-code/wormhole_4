import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTwitchLogin } from '../js/direct-search.js';

test('direct search accepts Twitch usernames, mentions, and channel URLs', () => {
  assert.equal(normalizeTwitchLogin('OneEyedNerdy'), 'oneeyednerdy');
  assert.equal(normalizeTwitchLogin('@OneEyedNerdy'), 'oneeyednerdy');
  assert.equal(
    normalizeTwitchLogin('https://www.twitch.tv/OneEyedNerdy/videos'),
    'oneeyednerdy'
  );
  assert.equal(normalizeTwitchLogin('twitch.tv/OneEyedNerdy'), 'oneeyednerdy');
});

test('direct search rejects blank and invalid Twitch logins', () => {
  assert.equal(normalizeTwitchLogin(''), null);
  assert.equal(normalizeTwitchLogin('not a login'), null);
  assert.equal(normalizeTwitchLogin('https://example.com/name'), null);
});
