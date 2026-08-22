import { estimateStreamEnd } from '../stream-end-estimate.js?v=91';
import { escapeHtml, fmtDate, fmtDuration, fmtNumber } from '../app/format.js?v=91';

export function recentActivityHtml({ stream, match, videos, clips, scheduleContext, profile, history, trackerSummary }) {
  const recentVods = videos.slice(0, 3);
  const accountAge = profile?.created_at ? fmtDate(profile.created_at) : 'Unavailable';
  const nextStream = scheduleContext?.next?.start_time
    ? `${fmtDate(scheduleContext.next.start_time, { dateStyle: 'medium', timeStyle: 'short' })}${scheduleContext.next.title ? `: ${escapeHtml(scheduleContext.next.title)}` : ''}`
    : 'No upcoming stream published';
  const plannedEnd = scheduleContext?.current?.end_time
    ? fmtDate(scheduleContext.current.end_time, { dateStyle: 'medium', timeStyle: 'short' })
    : 'No current scheduled end';
  const endEstimate = estimateStreamEnd(stream.started_at, videos);
  const estimatedEndMs = endEstimate
    ? new Date(endEstimate.estimatedEndAt).getTime()
    : null;
  const estimatedEnd = endEstimate
    ? estimatedEndMs > Date.now()
      ? fmtDate(endEstimate.estimatedEndAt, { dateStyle: 'medium', timeStyle: 'short' })
      : `${fmtDuration(Date.now() - estimatedEndMs)} past typical end`
    : 'Not enough VOD history';
  const estimateBasis = endEstimate
    ? `${fmtDuration(endEstimate.medianDurationMs)} typical length · median of ${endEstimate.sampleCount} VOD${endEstimate.sampleCount === 1 ? '' : 's'}`
    : 'Requires at least one public VOD with duration';
  const categories = history?.categories?.slice(0, 4) ?? [];
  const trackerAverage = Number.isFinite(trackerSummary?.averageViewers) ? trackerSummary.averageViewers : null;
  const trackerPeak = Number.isFinite(trackerSummary?.maxViewers) ? trackerSummary.maxViewers : null;
  const followerGrowth = history?.sampleCount > 1 && Number.isFinite(history.followerDelta)
    ? `${history.followerDelta >= 0 ? '+' : ''}${fmtNumber(history.followerDelta)} since ${fmtDate(history.followerStartAt)}`
    : 'Collecting snapshots for future comparisons';

  const vodsHtml = recentVods.length
    ? `<ul class="activity-list">${recentVods.map((video) => `
        <li>
          <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(video.title || 'Untitled broadcast')}</a>
          <span>${fmtDate(video.created_at)} · ${escapeHtml(video.duration || 'duration unknown')} · ${fmtNumber(video.view_count || 0)} VOD views</span>
        </li>`).join('')}</ul>`
    : '<p class="activity-empty">No public past broadcasts found in the last 30 days.</p>';

  const clipsHtml = clips.length
    ? `<div class="clip-grid">${clips.map((clip) => `
        <article class="clip-card">
          <img src="${escapeHtml(clip.thumbnail_url || '')}" alt="" loading="lazy" />
          <p>${escapeHtml(clip.title || 'Untitled clip')}</p>
          <span>${fmtNumber(clip.view_count || 0)} views · ${fmtDate(clip.created_at)}</span>
          <button class="btn btn--ghost" type="button" data-clip-id="${escapeHtml(clip.id)}">Preview clip</button>
          <a href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer">Open clip ↗</a>
          <div class="clip-player" data-clip-player="${escapeHtml(clip.id)}"></div>
        </article>`).join('')}</div>`
    : '<p class="activity-empty">No clips found from the last 30 days.</p>';

  return `
    <div class="activity-overview">
      <div><strong>${trackerAverage !== null ? fmtNumber(trackerAverage) : 'Unavailable'}</strong><span>30-day average · TwitchTracker</span></div>
      <div><strong>${trackerPeak !== null ? fmtNumber(trackerPeak) : 'Unavailable'}</strong><span>30-day peak · TwitchTracker</span></div>
      <div><strong>~${fmtNumber(match.estimatedAverageViewers)}</strong><span>Wormhole observed average${match.averageIsHistorical ? '' : ' · early estimate'}</span></div>
      <div><strong>${videos.length}</strong><span>streams in 30 days</span></div>
      <div><strong>${escapeHtml(accountAge)}</strong><span>account created</span></div>
      <div><strong>${escapeHtml(followerGrowth)}</strong><span>local follower growth</span></div>
      <div><strong>${escapeHtml(estimatedEnd)}</strong><span>estimated end · ${escapeHtml(estimateBasis)}</span></div>
    </div>
    <p class="activity-schedule"><strong>Current scheduled end:</strong> ${escapeHtml(plannedEnd)}</p>
    <p class="activity-schedule"><strong>Next scheduled:</strong> ${nextStream}</p>
    <p class="activity-history"><strong>Observed categories:</strong> ${categories.length ? categories.map(escapeHtml).join(', ') : `First snapshot recorded for ${escapeHtml(stream.game_name)}`}</p>
    <h4>Recent broadcasts</h4>
    ${vodsHtml}
    <h4>Popular clips from the last 30 days</h4>
    ${clipsHtml}
    <p class="activity-note">TwitchTracker statistics are requested only when you open this channel's details and are cached briefly to reduce requests. Wormhole's observed average remains separate and comes from local live snapshots when history permission is enabled. Twitch does not provide historical average concurrent viewers through Helix. The estimated end uses recent VOD durations and is not Twitch-confirmed. VOD views are replay views, not average live viewers.</p>`;
}

