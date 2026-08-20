export const STORAGE_CHOICE_KEY = 'wormhole_storage_choice_v1';
export const OPTIONAL_HISTORY_KEYS = Object.freeze([
  'wormhole_viewer_history_v2',
  'wormhole_channel_history_v1',
  'wormhole_previous_streams_v1',
  'wormhole_diagnostics_v1',
]);

export const StorageConsent = {
  getChoice(storage = localStorage) {
    try {
      const choice = storage.getItem(STORAGE_CHOICE_KEY);
      return choice === 'essential' || choice === 'history' ? choice : null;
    } catch {
      return null;
    }
  },

  allowsLocalHistory(storage = localStorage) {
    return this.getChoice(storage) === 'history';
  },

  setChoice(choice, storage = localStorage) {
    if (choice !== 'essential' && choice !== 'history') {
      throw new TypeError('Storage choice must be essential or history.');
    }
    storage.setItem(STORAGE_CHOICE_KEY, choice);
    if (choice === 'essential') this.clearLocalHistory(storage);
    return choice;
  },

  clearLocalHistory(storage = localStorage) {
    for (const key of OPTIONAL_HISTORY_KEYS) storage.removeItem(key);
  },
};
