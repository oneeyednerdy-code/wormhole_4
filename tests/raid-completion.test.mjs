import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRaidDestinationEmbedUrls,
  getTwitchRaidControlsUrl,
  isMatchingRaidConfirmation,
} from '../js/raid-completion.js';

test('accepts only Twitch confirmations for the active raid destination', () => {
  const activeRaid = { userId: 'destination-1' };
  assert.equal(isMatchingRaidConfirmation(activeRaid, {
    to_broadcaster_user_id: 'destination-1',
  }), true);
  assert.equal(isMatchingRaidConfirmation(activeRaid, {
    to_broadcaster_user_id: 'different-channel',
  }), false);
  assert.equal(isMatchingRaidConfirmation(activeRaid, {}), false);
  assert.equal(isMatchingRaidConfirmation(null, {
    to_broadcaster_user_id: 'destination-1',
  }), false);
});

test('builds Twitch player and chat embeds for the Wormhole hosting domain', () => {
  const embeds = getRaidDestinationEmbedUrls('Raid_Friend', 'wormhole.example');
  const player = new URL(embeds.video);
  const chat = new URL(embeds.chat);

  assert.equal(player.hostname, 'player.twitch.tv');
  assert.equal(player.searchParams.get('channel'), 'raid_friend');
  assert.equal(player.searchParams.get('parent'), 'wormhole.example');
  assert.equal(chat.pathname, '/embed/raid_friend/chat');
  assert.equal(chat.searchParams.get('parent'), 'wormhole.example');
});

test('builds the official Twitch Stream Manager URL for Raid Now controls', () => {
  assert.equal(
    getTwitchRaidControlsUrl('OneEyedNerdy'),
    'https://dashboard.twitch.tv/u/oneeyednerdy/stream-manager'
  );
});

test('rejects unsafe channel logins before building embed URLs', () => {
  assert.throws(
    () => getRaidDestinationEmbedUrls('bad/channel', 'wormhole.example'),
    /Invalid Twitch channel login/
  );
});
