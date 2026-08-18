import { StorageConsent } from './storage-consent.js?v=64';

export function initializeStorageConsent(documentRef = document, storage = localStorage) {
  const panel = documentRef.getElementById('storage-choice-panel');
  const essentialButton = documentRef.getElementById('storage-essential-btn');
  const historyButton = documentRef.getElementById('storage-history-btn');
  const settingsButtons = documentRef.querySelectorAll('[data-open-storage-settings]');
  const closeButton = documentRef.getElementById('storage-choice-close');
  const deleteButton = documentRef.getElementById('delete-local-history-btn');
  const status = documentRef.getElementById('storage-choice-status');
  if (!panel || !essentialButton || !historyButton || !closeButton || !deleteButton || !status) return false;

  const render = () => {
    const choice = StorageConsent.getChoice(storage);
    status.textContent = choice === 'history'
      ? 'Current choice: local history enabled.'
      : choice === 'essential'
        ? 'Current choice: essential storage only.'
        : 'Choose how Wormhole may store information on this device.';
    deleteButton.hidden = choice !== 'history';
    closeButton.hidden = choice === null;
    return choice;
  };

  const open = () => {
    panel.hidden = false;
    render();
    panel.querySelector('h2')?.focus();
  };
  const close = () => { panel.hidden = true; };
  const choose = (choice) => {
    StorageConsent.setChoice(choice, storage);
    render();
    close();
    window.dispatchEvent(new CustomEvent('wormhole:storage-choice', { detail: { choice } }));
  };

  essentialButton.addEventListener('click', () => choose('essential'));
  historyButton.addEventListener('click', () => choose('history'));
  closeButton.addEventListener('click', close);
  deleteButton.addEventListener('click', () => {
    StorageConsent.clearLocalHistory(storage);
    status.textContent = 'Local viewer, channel, and previous-stream history deleted.';
    deleteButton.hidden = true;
    window.dispatchEvent(new CustomEvent('wormhole:local-history-cleared'));
  });
  settingsButtons.forEach((button) => button.addEventListener('click', open));

  if (render() === null) open();
  return true;
}

if (typeof document !== 'undefined') initializeStorageConsent();
