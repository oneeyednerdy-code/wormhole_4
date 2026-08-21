import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState,
  describeRoom,
  deserializeGame,
  executeCommand,
  FINAL_TRANSMISSION,
  serializeGame,
} from '../js/lost-signal-engine.js';

function play(commands, initialState = createGameState()) {
  return commands.reduce((state, command) => executeCommand(state, command).state, initialState);
}

test('starts in the cryobay with an accessible room description', () => {
  const state = createGameState();
  assert.equal(state.location, 'cryobay');
  assert.match(describeRoom(state), /^Cryobay/m);
  assert.match(describeRoom(state), /Exits: east/);
});

test('understands direction shorthand and common parser verbs', () => {
  let state = play(['e', 'n']);
  assert.equal(state.location, 'observatory');
  let result = executeCommand(state, 'x viewport');
  assert.match(result.output, /same stars/i);
  result = executeCommand(result.state, 'grab prism');
  assert.deepEqual(result.state.inventory, ['spectral prism']);
  assert.match(executeCommand(result.state, 'i').output, /spectral prism/);
});

test('blocks powered areas until the engineering puzzle is solved', () => {
  let state = play(['east']);
  let result = executeCommand(state, 'down');
  assert.equal(result.state.location, 'junction');
  assert.match(result.output, /has no power/i);

  state = play(['east', 'east', 'take fuse', 'use fuse on socket', 'operate console']);
  assert.equal(state.flags.power, true);
  result = executeCommand(play(['west'], state), 'down');
  assert.equal(result.state.location, 'archive');
});

test('dropped items remain only in the room where they were dropped', () => {
  let state = play(['east', 'north', 'take prism', 'south', 'drop prism']);
  assert.match(describeRoom(state), /spectral prism/);
  state = executeCommand(state, 'west').state;
  assert.doesNotMatch(describeRoom(state), /spectral prism/);
  state = play(['east', 'take prism'], state);
  assert.deepEqual(state.inventory, ['spectral prism']);
});

test('completes the primary wormhole ending through the intended puzzle path', () => {
  const commands = [
    'east', 'north', 'take prism', 'south',
    'east', 'take fuse', 'use fuse on socket', 'operate console',
    'west', 'south', 'operate terminal', 'north',
    'down', 'take star chart', 'take harmonic key', 'up',
    'up', 'use star chart on console', 'down',
    'east', 'east', 'use prism on cradle', 'use harmonic key on console',
  ];
  const ready = play(commands);
  assert.deepEqual(ready.flags, {
    fuseInstalled: true,
    power: true,
    beacon: true,
    navigationAligned: true,
    prismInstalled: true,
    resonanceTuned: true,
  });
  const result = executeCommand(ready, 'enter wormhole');
  assert.equal(result.state.ending, 'wormhole');
  assert.match(result.output, /THE LISTENING DOOR/);
  assert.match(result.output, new RegExp(FINAL_TRANSMISSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('supports the rescue-pod and reactor endings', () => {
  let escapeState = play([
    'east', 'east', 'take fuse', 'use fuse on socket', 'operate console',
    'west', 'south', 'operate terminal', 'south', 'take suit',
  ]);
  let result = executeCommand(escapeState, 'launch pod');
  assert.equal(result.state.ending, 'escape');
  assert.match(result.output, /Tell no one what you learned today\./);

  const overloadState = play(['east', 'east', 'take fuse', 'use fuse on socket', 'operate console']);
  result = executeCommand(overloadState, 'overload reactor');
  assert.equal(result.state.ending, 'overload');
  assert.match(result.output, /survey crew/i);
  assert.match(result.output, /Tell no one what you learned today\./);
});

test('serializes valid progress and rejects incompatible saves', () => {
  const state = play(['east', 'north', 'take prism']);
  assert.deepEqual(deserializeGame(serializeGame(state)), state);
  assert.throws(() => deserializeGame('{"version":999,"location":"cryobay","inventory":[]}'), /not compatible/);
  assert.throws(() => deserializeGame('not json'));
});

test('provides contextual hints and useful unknown-command feedback', () => {
  assert.match(executeCommand(createGameState(), 'hint').output, /engineering/i);
  assert.match(executeCommand(createGameState(), 'sing to the reactor').output, /does not understand/i);
});
