export const RAID_COUNTDOWN_MS = 90_000;

export function createRaidCountdown({ userId, userName, userLogin, createdAt }) {
  const requestedAt = new Date(createdAt).getTime();
  const startedAt = Number.isFinite(requestedAt) ? requestedAt : Date.now();
  return {
    userId,
    userName,
    userLogin,
    startedAt,
    deadline: startedAt + RAID_COUNTDOWN_MS,
  };
}

export function getRaidCountdownSnapshot(raid, now = Date.now()) {
  const remainingMs = Math.min(RAID_COUNTDOWN_MS, Math.max(0, raid.deadline - now));
  const elapsedMs = Math.min(RAID_COUNTDOWN_MS, Math.max(0, now - raid.startedAt));
  return {
    remainingSeconds: Math.ceil(remainingMs / 1000),
    progressPercent: Math.round((elapsedMs / RAID_COUNTDOWN_MS) * 1000) / 10,
    complete: remainingMs === 0,
  };
}

export function twitchChannelUrl(login) {
  return `https://www.twitch.tv/${encodeURIComponent(String(login ?? '').trim())}`;
}
