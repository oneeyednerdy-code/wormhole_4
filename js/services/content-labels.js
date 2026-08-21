import { state } from '../app/state.js?v=90';
import { logger } from '../app/logger.js?v=90';

export async function attachContentClassificationLabels(streams, { signal } = {}) {
  if (!streams.length) return streams;
  try {
    const channelInformation = await state.api.getChannelInformationForUsers(
      streams.map((stream) => stream.user_id),
      { signal }
    );
    for (const stream of streams) {
      const channel = channelInformation.get(stream.user_id);
      stream.content_classification_labels = channel?.content_classification_labels ?? [];
      stream.content_labels_available = Boolean(channel);
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    for (const stream of streams) stream.content_labels_available = false;
    logger.warn('Content classification labels are temporarily unavailable:', error);
  }
  return streams;
}

