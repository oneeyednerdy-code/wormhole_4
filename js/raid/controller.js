import { state } from '../app/state.js?v=90';
import { el } from '../app/elements.js?v=90';
import { escapeHtml, fmtNumber } from '../app/format.js?v=90';
import { logger } from '../app/logger.js?v=90';
import { createRaidCountdown, getRaidCountdownSnapshot } from '../raid-countdown.js?v=90';
import { getRaidDestinationEmbedUrls, getTwitchRaidControlsUrl, isMatchingRaidConfirmation } from '../raid-completion.js?v=90';
import { getRaidAuthorizationFailure, getRaidChannelFailure, releaseRaidActionLock, tryAcquireRaidActionLock } from '../raid-security.js?v=90';
import { startLoading, finishLoading } from '../loading-state.js?v=90';

let deps = null;
export function configureRaidController(value) { deps = value; }
function requireDeps() { if (!deps) throw new Error('Raid controller is not configured.'); return deps; }
function showToast(...args) { return requireDeps().showToast(...args); }
function renderStreamPanel(...args) { return requireDeps().renderStreamPanel(...args); }
function endInvalidTwitchSession(...args) { return requireDeps().endInvalidTwitchSession(...args); }

// ---- Raid confirm dialog -----------------------------------------------

let pendingRaid = null;

function clearRaidTimers() {
  clearInterval(state.raidCountdownTimer);
  state.raidCountdownTimer = null;
}

export function clearActiveRaid({ closeDialog = true } = {}) {
  clearRaidTimers();
  state.activeRaid = null;
  state.raidCompletionInProgress = false;
  el.raidProgressDialog.classList.remove('raid-progress-dialog--complete');
  el.raidProgressPreview.src = 'about:blank';
  if (closeDialog && el.raidProgressDialog.open) el.raidProgressDialog.close();
}

function showRaidAwaitingConfirmation() {
  if (!state.activeRaid) return;
  clearRaidTimers();
  el.raidProgressTitle.textContent = 'Waiting for Twitch confirmation...';
  el.raidProgressText.textContent = 'The countdown ended. Waiting for Twitch to confirm this exact raid destination.';
  el.raidCountdownValue.textContent = '0';
  el.raidProgressBar.style.width = '100%';
  el.raidProgressRing.style.setProperty('--raid-progress', '360deg');
  el.raidProgressCancelBtn.disabled = true;
}

function renderRaidCountdown() {
  if (!state.activeRaid) return;
  const snapshot = getRaidCountdownSnapshot(state.activeRaid);
  el.raidCountdownValue.textContent = String(snapshot.remainingSeconds);
  el.raidProgressBar.style.width = `${snapshot.progressPercent}%`;
  el.raidProgressRing.style.setProperty('--raid-progress', `${snapshot.progressPercent * 3.6}deg`);

  if (snapshot.complete) showRaidAwaitingConfirmation();
}

function beginRaidCountdown(target, createdAt) {
  clearActiveRaid();
  state.activeRaid = createRaidCountdown({
    userId: target.stream.user_id,
    userName: target.stream.user_name,
    userLogin: target.stream.user_login,
    createdAt,
  });
  state.raidCompletionInProgress = false;
  el.raidProgressTitle.textContent = `Raiding ${target.stream.user_name}`;
  el.raidProgressText.textContent = 'Twitch is preparing your viewers. Wormhole will wait for confirmation of this exact destination.';
  const thumbnail = (target.stream.thumbnail_url || '')
    .replace('{width}', '160')
    .replace('{height}', '160');
  el.raidProgressAvatar.src = thumbnail;
  el.raidProgressAvatar.alt = `${target.stream.user_name} live preview`;
  el.raidProgressAvatar.classList.toggle('hidden', !thumbnail);
  el.raidProgressAudience.textContent = `${fmtNumber(state.myStream?.viewer_count ?? 0)} viewers are preparing to travel through the wormhole.`;
  const previewUrl = buildTwitchPlayerUrl({
    hostname: window.location.hostname,
    channel: target.stream.user_login,
  });
  el.raidProgressPreview.src = previewUrl ?? 'about:blank';
  el.raidProgressPreview.title = `${target.stream.user_name} live preview during the raid countdown`;
  el.raidProgressWatchLink.href = `https://www.twitch.tv/${encodeURIComponent(target.stream.user_login)}`;
  el.raidControlsLink.href = getTwitchRaidControlsUrl(state.user.login);
  el.raidProgressCancelBtn.disabled = false;
  renderRaidCountdown();
  if (!el.raidProgressDialog.open) el.raidProgressDialog.showModal();
  state.raidCountdownTimer = setInterval(renderRaidCountdown, 1_000);
}

export async function handleRaidCompleted(event) {
  if (!state.activeRaid) {
    showToast(`Raid completed to ${event.to_broadcaster_user_name}!`);
    return;
  }
  if (!isMatchingRaidConfirmation(state.activeRaid, event)) return;

  if (state.raidCompletionInProgress) return;
  state.raidCompletionInProgress = true;

  if (event.to_broadcaster_user_login) {
    state.activeRaid.userLogin = event.to_broadcaster_user_login;
  }
  const target = {
    userId: state.activeRaid.userId,
    userLogin: state.activeRaid.userLogin,
    userName: event.to_broadcaster_user_name || state.activeRaid.userName,
  };

  clearRaidTimers();
  el.raidProgressTitle.textContent = 'Raid confirmed!';
  el.raidProgressText.textContent = `Twitch confirmed the raid to ${target.userName}.`;
  el.raidProgressCancelBtn.disabled = true;

  if (!state.activeRaid || state.activeRaid.userId !== target.userId) return;
  showRaidDestination(target);
}

function showRaidDestination(target) {
  const embeds = getRaidDestinationEmbedUrls(target.userLogin, window.location.hostname);

  el.raidDestinationTitle.textContent = `Now watching ${target.userName}`;
  el.raidDestinationStatus.textContent = 'Raid complete. Twitch confirmed the destination.';
  el.raidDestinationPlayer.src = embeds.video;
  el.raidDestinationPlayer.title = `${target.userName} live on Twitch`;
  el.raidDestinationChat.src = embeds.chat;
  el.raidDestinationChat.title = `${target.userName} Twitch chat`;
  el.raidDestinationOpenLink.href = `https://www.twitch.tv/${encodeURIComponent(target.userLogin)}`;
  el.raidDestinationDashboardLink.href = getTwitchRaidControlsUrl(state.user.login);
  el.raidProgressPreview.src = 'about:blank';
  el.discoveryView.classList.add('hidden');
  el.raidDestinationView.classList.remove('hidden');
  if (el.raidProgressDialog.open) el.raidProgressDialog.close();
  clearRaidTimers();
  state.activeRaid = null;
  state.raidCompletionInProgress = false;
  window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
}

el.raidDestinationBackBtn.addEventListener('click', () => {
  el.raidDestinationPlayer.src = 'about:blank';
  el.raidDestinationChat.src = 'about:blank';
  el.raidDestinationView.classList.add('hidden');
  el.discoveryView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
});

export function openRaidDialog(match) {
  if (!state.raidPermissionEnabled) {
    showToast('Enable Twitch raid controls before starting a raid.', true);
    return;
  }
  if (state.activeRaid || state.raidActionInProgress) {
    showToast('A raid action is already in progress.', true);
    return;
  }
  pendingRaid = match;
  el.raidDialogText.textContent = `Raid ${match.stream.user_name} with your viewers right now?`;
  const previewUrl = buildTwitchPlayerUrl({
    hostname: window.location.hostname,
    channel: match.stream.user_login,
  });
  el.raidConfirmPreview.src = previewUrl ?? 'about:blank';
  el.raidConfirmPreview.title = `Live preview of ${match.stream.user_name} before confirming the raid`;
  el.raidMessagePreview.value = `We are raiding @${match.stream.user_login}! Please show them some support.`;
  el.raidDialog.showModal();
}

el.raidMessageCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.raidMessagePreview.value.trim());
    showToast('Raid message copied. Paste it into Twitch chat when ready.');
  } catch {
    showToast('Could not copy the message. Select the text and copy it manually.', true);
  }
});

el.raidCancelBtn.addEventListener('click', () => {
  pendingRaid = null;
  el.raidDialog.close();
});

el.raidDialog.addEventListener('close', () => {
  el.raidConfirmPreview.src = 'about:blank';
});

async function validateRaidActionAuthorization() {
  const token = TwitchAuth.getSavedToken();
  if (!token) {
    throw Object.assign(new Error('Your Twitch session is missing.'), { code: 'missing_session' });
  }
  const status = await TwitchAuth.validateToken(token, {
    requiredScopes: [...TWITCH_CONFIG.discoveryScopes, ...TWITCH_CONFIG.raidScopes],
  });
  if (status.validation) updateRaidPermission(status.validation);
  const failure = getRaidAuthorizationFailure(status, state.user?.id);
  if (failure) {
    if (failure === 'invalid_session') {
      await endInvalidTwitchSession('Your Twitch authorization expired. Log in again before starting a raid.');
    } else if (failure === 'identity_mismatch') {
      await endInvalidTwitchSession('The authorized Twitch account did not match the broadcaster. Log in again.');
    }
    const messages = {
      validation_unavailable: 'Twitch could not verify your authorization right now.',
      raid_permission_required: 'Twitch raid permission is not enabled.',
      invalid_session: 'Your Twitch authorization expired.',
      identity_mismatch: 'The Twitch broadcaster identity did not match.',
    };
    throw Object.assign(new Error(messages[failure]), { code: failure });
  }
  state.tokenValidation = status.validation;
  updateRaidPermission(status.validation);
  return status.validation;
}

el.raidConfirmBtn.addEventListener('click', async () => {
  if (!pendingRaid || !tryAcquireRaidActionLock(state)) return;
  const loadingId = startLoading('Checking the raid with Twitch...');
  const target = pendingRaid;
  const originalButtonText = el.raidConfirmBtn.textContent;
  el.raidConfirmBtn.disabled = true;
  el.raidConfirmBtn.textContent = 'Checking Twitch...';
  el.raidDialog.close();
  try {
    await validateRaidActionAuthorization();
    const [currentBroadcasterStream, currentTargetStream] = await Promise.all([
      state.api.getLiveStreamForUser(state.user.id),
      state.api.getLiveStreamForUser(target.stream.user_id),
    ]);
    const channelFailure = getRaidChannelFailure({
      broadcasterStream: currentBroadcasterStream,
      targetStream: currentTargetStream,
      expectedBroadcasterId: state.user.id,
      expectedTargetId: target.stream.user_id,
    });
    if (channelFailure === 'broadcaster_offline') {
      state.myStream = null;
      renderStreamPanel();
    }
    if (channelFailure) {
      throw Object.assign(new Error('The Twitch raid channel verification failed.'), {
        code: channelFailure,
      });
    }
    state.myStream = { ...state.myStream, ...currentBroadcasterStream };
    target.stream = { ...target.stream, ...currentTargetStream };
    const raid = await state.api.startRaid(state.user.id, target.stream.user_id);
    beginRaidCountdown(target, raid?.created_at);
  } catch (e) {
    logger.error(e);
    if (Number(e?.status) === 401) {
      await endInvalidTwitchSession('Twitch rejected the raid authorization. Log in again before starting another raid.');
    }
    const messages = {
      400: 'Twitch would not allow this raid. The channel may restrict incoming raids.',
      401: 'Your Twitch permission expired. Log out and back in, then try again.',
      404: 'That channel is no longer available.',
      409: 'A raid countdown is already in progress.',
      429: "Twitch's raid limit was reached. Please wait before trying again.",
    };
    const securityMessages = {
      validation_unavailable: 'Twitch could not verify your permission, so the raid was not started. Try again shortly.',
      raid_permission_required: 'Raid permission is not enabled. Use Enable raid controls and approve it on Twitch.',
      missing_session: 'Your Twitch session is missing. Log in again before starting a raid.',
      invalid_session: 'Your Twitch authorization expired. Log in again before starting a raid.',
      identity_mismatch: 'The authorized Twitch account did not match the broadcaster. The raid was blocked.',
      broadcaster_offline: 'Your channel is no longer live, so the raid was not started.',
      target_offline: `${target.stream.user_name} is no longer live. The raid was not started.`,
      same_channel: 'Wormhole will not start a raid to your own channel.',
      broadcaster_identity_mismatch: 'Twitch returned a different broadcaster identity. The raid was blocked.',
      target_identity_mismatch: 'Twitch returned a different raid destination. The raid was blocked.',
    };
    showToast(securityMessages[e.code] ?? messages[e.status] ?? 'Could not start the raid. Please try again.', true);
  } finally {
    finishLoading(loadingId);
    releaseRaidActionLock(state);
    el.raidConfirmBtn.disabled = false;
    el.raidConfirmBtn.textContent = originalButtonText;
    pendingRaid = null;
  }
});

el.raidProgressDialog.addEventListener('cancel', (event) => {
  // Escape must not hide an active raid while Twitch's countdown continues.
  event.preventDefault();
});

el.raidProgressCancelBtn.addEventListener('click', async () => {
  if (!state.activeRaid) return;
  const loadingId = startLoading('Canceling the raid...');
  el.raidProgressCancelBtn.disabled = true;
  el.raidProgressText.textContent = 'Canceling the raid...';
  try {
    await state.api.cancelRaid(state.user.id);
    clearActiveRaid();
    showToast('Raid canceled.');
  } catch (error) {
    logger.error(error);
    el.raidProgressCancelBtn.disabled = false;
    el.raidProgressText.textContent =
      error.status === 404
        ? 'The raid is no longer pending. Waiting for Twitch to confirm completion...'
        : 'Twitch could not cancel the raid. Try again before the countdown ends.';
  } finally {
    finishLoading(loadingId);
  }
});

