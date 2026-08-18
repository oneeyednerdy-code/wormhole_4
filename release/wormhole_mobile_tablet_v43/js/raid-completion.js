export const RAID_COMPLETION_MESSAGE = 'Wormhole Networking Tool has completed the Raid';

function normalizeChannelLogin(channelLogin) {
  const login = String(channelLogin ?? '').trim().toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(login)) throw new Error('Invalid Twitch channel login.');
  return login;
}

export function buildRaidCompletionMessage(channelLogin) {
  const login = normalizeChannelLogin(channelLogin);
  return `${RAID_COMPLETION_MESSAGE} to @${login}`;
}

export function isMatchingRaidConfirmation(activeRaid, event) {
  return Boolean(
    activeRaid?.userId &&
    event?.to_broadcaster_user_id &&
    event.to_broadcaster_user_id === activeRaid.userId
  );
}

export function getRaidDestinationEmbedUrls(channelLogin, parentHostname) {
  const login = normalizeChannelLogin(channelLogin);
  const parent = String(parentHostname ?? '').trim();
  if (!parent) throw new Error('A hosting domain is required for Twitch embeds.');

  const video = new URL('https://player.twitch.tv/');
  video.searchParams.set('channel', login);
  video.searchParams.set('parent', parent);
  video.searchParams.set('autoplay', 'true');

  const chat = new URL(`https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat`);
  chat.searchParams.set('parent', parent);

  return { video: video.toString(), chat: chat.toString() };
}

export function getTwitchRaidControlsUrl(channelLogin) {
  const login = normalizeChannelLogin(channelLogin);
  return `https://dashboard.twitch.tv/u/${encodeURIComponent(login)}/stream-manager`;
}
