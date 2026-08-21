import {
  createGameState,
  describeRoom,
  deserializeGame,
  executeCommand,
  HELP_TEXT,
  serializeGame,
} from './lost-signal-engine.js?v=90';

const SAVE_KEY = 'wormhole_lost_signal_save_v1';
const output = document.querySelector('#game-output');
const form = document.querySelector('#command-form');
const input = document.querySelector('#command-input');
const liveRegion = document.querySelector('#game-announcer');
const moves = document.querySelector('#game-moves');
const location = document.querySelector('#game-location');
const clearButton = document.querySelector('#clear-transcript');
const history = [];
let historyIndex = 0;
let state = createGameState();

function appendTranscript(text, kind = 'response') {
  const entry = document.createElement('div');
  entry.className = `terminal-entry terminal-entry--${kind}`;
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  entry.append(paragraph);
  output.append(entry);
  output.scrollTop = output.scrollHeight;
  if (kind !== 'command') liveRegion.textContent = text;
}

function updateStatus() {
  moves.textContent = String(state.moves);
  const firstLine = describeRoom(state).split('\n')[0];
  location.textContent = firstLine;
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, serializeGame(state));
    return 'Game saved on this device. This save contains only your Lost Signal game progress.';
  } catch {
    return 'The browser blocked local storage, so the game could not be saved.';
  }
}

function loadGame() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return 'No saved transmission was found on this device.';
    state = deserializeGame(saved);
    updateStatus();
    return `Saved transmission restored.\n\n${describeRoom(state)}`;
  } catch {
    return 'The saved transmission is damaged or incompatible and could not be loaded.';
  }
}

function runCommand(rawCommand) {
  const command = rawCommand.trim();
  if (!command) return;
  history.push(command);
  historyIndex = history.length;
  appendTranscript(`> ${command}`, 'command');

  const normalized = command.toLowerCase();
  let response;
  if (normalized === 'save') response = saveGame();
  else if (normalized === 'load') response = loadGame();
  else if (normalized === 'restart') {
    state = createGameState();
    response = `A new transmission begins.\n\n${describeRoom(state)}`;
  } else {
    const result = executeCommand(state, command);
    state = result.state;
    response = result.output;
  }
  appendTranscript(response);
  updateStatus();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const command = input.value;
  input.value = '';
  runCommand(command);
  input.focus();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp' && history.length) {
    event.preventDefault();
    historyIndex = Math.max(0, historyIndex - 1);
    input.value = history[historyIndex] || '';
  }
  if (event.key === 'ArrowDown' && history.length) {
    event.preventDefault();
    historyIndex = Math.min(history.length, historyIndex + 1);
    input.value = history[historyIndex] || '';
  }
});

document.querySelectorAll('[data-game-command]').forEach((button) => {
  button.addEventListener('click', () => runCommand(button.dataset.gameCommand));
});

clearButton.addEventListener('click', () => {
  output.replaceChildren();
  appendTranscript('Transcript cleared. Your game progress was not changed.');
  input.focus();
});

appendTranscript('WORMHOLE NETWORK // RECOVERED TRANSMISSION 80', 'system');
appendTranscript('WORMHOLE: LOST SIGNAL\nA science-fiction text adventure by OneEyedNerdy\n\nType HELP for commands. Type HINT if you become stranded between bad decisions.');
appendTranscript(describeRoom(state));
updateStatus();
input.focus();

export { runCommand, HELP_TEXT };
