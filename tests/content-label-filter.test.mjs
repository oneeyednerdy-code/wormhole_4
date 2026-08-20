import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTENT_FILTER_LABELS,
  filterStreamsByContentLabels,
  getStreamContentLabels,
  normalizeContentLabelFilter,
} from '../js/content-label-filter.js';

const streams = [
  { user_id: 'mature', is_mature: true, content_classification_labels: ['ProfanityVulgarity'] },
  { user_id: 'politics', is_mature: false, content_classification_labels: ['DebatedSocialIssuesAndPolitics'] },
  { user_id: 'open', is_mature: false, content_classification_labels: [] },
];

test('publishes Twitch content labels plus the mature-audience stream setting', () => {
  assert.deepEqual(CONTENT_FILTER_LABELS.map((item) => item.id), [
    'MatureAudience', 'DebatedSocialIssuesAndPolitics', 'DrugsIntoxication',
    'SexualThemes', 'ViolentGraphic', 'Gambling', 'ProfanityVulgarity', 'MatureGame',
  ]);
  assert.deepEqual([...getStreamContentLabels(streams[0])], ['ProfanityVulgarity', 'MatureAudience']);
});

test('required labels match any selection and exclusions always remove matches', () => {
  assert.deepEqual(
    filterStreamsByContentLabels(streams, { include: ['MatureAudience', 'DebatedSocialIssuesAndPolitics'] })
      .map((stream) => stream.user_id),
    ['mature', 'politics']
  );
  assert.deepEqual(
    filterStreamsByContentLabels(streams, { exclude: ['MatureAudience', 'DebatedSocialIssuesAndPolitics'] })
      .map((stream) => stream.user_id),
    ['open']
  );
});

test('invalid labels are removed and exclusion wins a conflicting selection', () => {
  assert.deepEqual(normalizeContentLabelFilter({
    include: ['Gambling', 'unknown'],
    exclude: ['Gambling', 'SexualThemes'],
  }), { include: [], exclude: ['Gambling', 'SexualThemes'] });
});
