export const RAID_COMPLETION_MESSAGE = 'Wormhole Networking Tool has completed the Raid';

export function isMatchingRaidConfirmation(activeRaid, event) {
  return Boolean(
    activeRaid?.userId &&
    event?.to_broadcaster_user_id &&
    event.to_broadcaster_user_id === activeRaid.userId
  );
}

export function getRaidDestinationEmbedUrls(channelLogin, parentHostname) {
  const login = String(channelLogin ?? '').trim().toLowerCase();
  const parent = String(parentHostname ?? '').trim();
  if (!/^[a-z0-9_]{1,25}$/.test(login)) throw new Error('Invalid Twitch channel login.');
  if (!parent) throw new Error('A hosting domain is required for Twitch embeds.');

  const video = new URL('https://player.twitch.tv/');
  video.searchParams.set('channel', login);
  video.searchParams.set('parent', parent);
  video.searchParams.set('autoplay', 'true');

  const chat = new URL(`https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat`);
  chat.searchParams.set('parent', parent);

  return { video: video.toString(), chat: chat.toString() };
}
