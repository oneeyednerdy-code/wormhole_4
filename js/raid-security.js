export function getRaidAuthorizationFailure(status, expectedBroadcasterId) {
  if (!status?.valid) {
    if (status?.reason === 'unavailable') return 'validation_unavailable';
    if (status?.reason === 'missing_scopes') return 'raid_permission_required';
    return 'invalid_session';
  }
  if (String(status.validation?.user_id ?? '') !== String(expectedBroadcasterId ?? '')) {
    return 'identity_mismatch';
  }
  return null;
}

export function getRaidChannelFailure({
  broadcasterStream,
  targetStream,
  expectedBroadcasterId,
  expectedTargetId,
}) {
  if (String(expectedBroadcasterId ?? '') === String(expectedTargetId ?? '')) return 'same_channel';
  if (!broadcasterStream) return 'broadcaster_offline';
  if (String(broadcasterStream.user_id ?? '') !== String(expectedBroadcasterId ?? '')) {
    return 'broadcaster_identity_mismatch';
  }
  if (!targetStream) return 'target_offline';
  if (String(targetStream.user_id ?? '') !== String(expectedTargetId ?? '')) {
    return 'target_identity_mismatch';
  }
  return null;
}

export function tryAcquireRaidActionLock(state) {
  if (state.raidActionInProgress) return false;
  state.raidActionInProgress = true;
  return true;
}

export function releaseRaidActionLock(state) {
  state.raidActionInProgress = false;
}
