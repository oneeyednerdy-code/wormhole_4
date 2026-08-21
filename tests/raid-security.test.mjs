import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRaidAuthorizationFailure,
  getRaidChannelFailure,
  releaseRaidActionLock,
  tryAcquireRaidActionLock,
} from '../js/raid-security.js';

test('raid authorization requires a valid scoped token for the exact broadcaster', () => {
  assert.equal(getRaidAuthorizationFailure({ reason: 'unavailable' }, 'source-1'), 'validation_unavailable');
  assert.equal(getRaidAuthorizationFailure({ reason: 'missing_scopes' }, 'source-1'), 'raid_permission_required');
  assert.equal(getRaidAuthorizationFailure({ reason: 'invalid' }, 'source-1'), 'invalid_session');
  assert.equal(getRaidAuthorizationFailure({ valid: true, validation: { user_id: 'other' } }, 'source-1'), 'identity_mismatch');
  assert.equal(getRaidAuthorizationFailure({ valid: true, validation: { user_id: 'source-1' } }, 'source-1'), null);
});

test('raid preflight requires two distinct and exactly matching live channels', () => {
  const valid = {
    broadcasterStream: { user_id: 'source-1' },
    targetStream: { user_id: 'target-1' },
    expectedBroadcasterId: 'source-1',
    expectedTargetId: 'target-1',
  };
  assert.equal(getRaidChannelFailure(valid), null);
  assert.equal(getRaidChannelFailure({ ...valid, expectedTargetId: 'source-1' }), 'same_channel');
  assert.equal(getRaidChannelFailure({ ...valid, broadcasterStream: null }), 'broadcaster_offline');
  assert.equal(getRaidChannelFailure({ ...valid, broadcasterStream: { user_id: 'other' } }), 'broadcaster_identity_mismatch');
  assert.equal(getRaidChannelFailure({ ...valid, targetStream: null }), 'target_offline');
  assert.equal(getRaidChannelFailure({ ...valid, targetStream: { user_id: 'other' } }), 'target_identity_mismatch');
});

test('the raid action lock rejects a second submission until released', () => {
  const state = { raidActionInProgress: false };
  assert.equal(tryAcquireRaidActionLock(state), true);
  assert.equal(tryAcquireRaidActionLock(state), false);
  releaseRaidActionLock(state);
  assert.equal(tryAcquireRaidActionLock(state), true);
});
