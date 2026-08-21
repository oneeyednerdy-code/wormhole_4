export const GAME_VERSION = 1;

export const FINAL_TRANSMISSION = `FINAL TRANSMISSION

The wormhole was never empty.
It was waiting to see who would answer.

Now it knows your voice.

Close this channel.
Tell no one what you learned today.`;

const DIRECTIONS = {
  n: 'north', north: 'north', s: 'south', south: 'south',
  e: 'east', east: 'east', w: 'west', west: 'west',
  u: 'up', up: 'up', d: 'down', down: 'down',
};

const ITEM_NAMES = {
  fuse: 'phase fuse',
  'phase fuse': 'phase fuse',
  prism: 'spectral prism',
  'spectral prism': 'spectral prism',
  chart: 'star chart',
  'star chart': 'star chart',
  key: 'harmonic key',
  'harmonic key': 'harmonic key',
  suit: 'EVA suit',
  'eva suit': 'EVA suit',
};

const ROOMS = {
  cryobay: {
    name: 'Cryobay',
    description: 'Purple emergency lights flicker across the cryobay. Frost spills from your open capsule. A handwritten note is taped inside the glass: "If you wake before me, wait for me. E."',
    exits: { east: 'junction' },
    details: {
      capsule: 'Your capsule reports 183 years of subjective drift. That seems medically inadvisable.',
      plaque: 'Someone scratched a second message beneath the safety instructions: "We were still here."',
    },
  },
  junction: {
    name: 'Central Junction',
    description: 'Six pressure doors surround a holographic model of the Eventide. The model repeatedly folds itself through a tiny hourglass of purple light.',
    exits: { west: 'cryobay', north: 'observatory', east: 'engineering', south: 'comms', up: 'bridge', down: 'archive' },
    details: {
      model: 'The model marks the bridge, archive, communications bay, engineering deck, and an experimental chamber beyond engineering.',
      wormhole: 'The miniature wormhole pulses in time with a faint signal: three short tones, one long.',
    },
  },
  observatory: {
    name: 'Observatory',
    description: 'A fractured viewport faces a motionless field of stars. A spectral prism floats inside a failed containment beam.',
    exits: { south: 'junction' },
    items: ['spectral prism'],
    details: {
      viewport: 'The same stars appear on both sides of the ship. Space has folded back on itself.',
      stars: 'They are perfectly still. One star blinks in the rhythm of the signal.',
      beam: 'The containment beam is harmless now. The prism can be taken.',
    },
  },
  engineering: {
    name: 'Engineering',
    description: 'Dead conduits web the walls. A portable phase fuse lies beside an empty socket. The reactor console waits beneath a red manual-release cover.',
    exits: { west: 'junction', east: 'chamber' },
    items: ['phase fuse'],
    details: {
      socket: 'The socket is intact and exactly the size of the phase fuse.',
      reactor: 'The reactor is dormant. Its emergency startup requires a fuse and the console.',
      console: 'A label reads: INSERT PHASE FUSE BEFORE STARTUP. Another label reads: DO NOT OVERLOAD. Someone underlined it twice.',
      cover: 'The release cover protects the reactor console from accidental heroism.',
    },
  },
  comms: {
    name: 'Communications Bay',
    description: 'Banks of silent receivers surround a central transmission terminal. Static whispers from every speaker at once.',
    exits: { north: 'junction', south: 'airlock' },
    details: {
      terminal: 'The terminal can broadcast a rescue beacon when ship power is restored.',
      static: 'Beneath the noise, a voice repeats: "Bring the divided light to the throat of the hourglass."',
      speakers: 'All 64 speakers are receiving the same transmission from slightly different points in time.',
    },
  },
  airlock: {
    name: 'Forward Airlock',
    description: 'An EVA suit hangs beside a one-person escape pod. The pod window shows the purple rim of the wormhole filling half the sky.',
    exits: { north: 'comms' },
    items: ['EVA suit'],
    details: {
      pod: 'The pod can launch once a rescue beacon gives it a destination lock.',
      window: 'Lightning travels backward around the wormhole rim.',
      suit: 'A standard EVA suit. The name patch reads DR. M. VOSS.',
    },
  },
  archive: {
    name: 'Quantum Archive',
    description: 'Crystal memory stacks glow around a brass navigation table. A star chart and a tuning fork-shaped harmonic key rest beneath the final log.',
    exits: { up: 'junction' },
    items: ['star chart', 'harmonic key'],
    details: {
      log: 'DR. VOSS: We took a vote. No one chose the pods while anyone was still missing. We are going through together. If the sleeper wakes, tell them we tried to come back.',
      table: 'The engraved table maps two overlapping versions of the same solar system.',
      stacks: 'Most records are corrupted. One phrase survives: ALIGN, TUNE, ILLUMINATE, ANSWER.',
    },
  },
  bridge: {
    name: 'Bridge',
    description: 'The command chairs face an impossible horizon. A navigation console projects two mismatched star fields and requests a physical reference chart.',
    exits: { down: 'junction' },
    details: {
      console: 'The navigation console needs the archive star chart to align the Eventide with normal space.',
      horizon: 'The bow of the ship appears far ahead of itself, entering the wormhole and leaving it at the same time.',
      chairs: 'Every chair is empty except for a neatly folded note: "If you woke up, I did not."',
    },
  },
  chamber: {
    name: 'Wormhole Chamber',
    description: 'A circular laboratory surrounds a black aperture no wider than your hand. A prism cradle and resonance console face the opening.',
    exits: { west: 'engineering' },
    details: {
      aperture: 'It contains no reflection, yet you feel certain something on the other side is looking back.',
      cradle: 'The cradle splits a beam into the precise frequencies shown in the archive log.',
      console: 'The resonance console has a tuning slot shaped like the harmonic key.',
      wormhole: 'The aperture is the throat of the hourglass. It is currently too unstable to enter.',
    },
  },
};

export function createGameState() {
  return {
    version: GAME_VERSION,
    location: 'cryobay',
    inventory: [],
    removedItems: [],
    droppedItems: {},
    flags: {
      fuseInstalled: false,
      power: false,
      beacon: false,
      navigationAligned: false,
      prismInstalled: false,
      resonanceTuned: false,
    },
    moves: 0,
    ended: false,
    ending: null,
  };
}

function normalize(value = '') {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ');
}

function itemName(value) {
  const cleaned = normalize(value).replace(/^(the|a|an) /, '');
  return ITEM_NAMES[cleaned] || cleaned;
}

function visibleItems(state, roomId = state.location) {
  const originalItems = (ROOMS[roomId].items || []).filter((item) => !state.removedItems.includes(item));
  return [...originalItems, ...(state.droppedItems?.[roomId] || [])];
}

function hasItem(state, item) {
  return state.inventory.includes(itemName(item));
}

export function describeRoom(state) {
  const room = ROOMS[state.location];
  const items = visibleItems(state);
  const exits = Object.keys(room.exits).filter((direction) => canSeeExit(state, state.location, direction));
  const lines = [`${room.name}\n${room.description}`];
  if (items.length) lines.push(`You can see ${joinWords(items)} here.`);
  lines.push(`Exits: ${exits.join(', ')}.`);
  return lines.join('\n\n');
}

function joinWords(values) {
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}

function canSeeExit(state, roomId, direction) {
  if (roomId === 'engineering' && direction === 'east') return state.flags.power;
  return true;
}

function move(state, direction) {
  const room = ROOMS[state.location];
  const target = room.exits[direction];
  if (!target) return `You cannot go ${direction} from here.`;
  if ((target === 'archive' || target === 'bridge' || target === 'chamber') && !state.flags.power) {
    return `The door to the ${ROOMS[target].name.toLowerCase()} has no power.`;
  }
  state.location = target;
  return describeRoom(state);
}

function examine(state, target) {
  const subject = normalize(target).replace(/^(the|a|an) /, '');
  if (!subject || subject === 'room' || subject === 'around') return describeRoom(state);
  const item = itemName(subject);
  if (hasItem(state, item) || visibleItems(state).includes(item)) {
    const descriptions = {
      'phase fuse': 'A ceramic cylinder holding a tiny ribbon of contained lightning.',
      'spectral prism': 'A triangular crystal that divides ordinary light into colors you do not remember learning.',
      'star chart': "A flexible chart marked with the Eventide's original coordinates and a handwritten route home.",
      'harmonic key': 'A metal tuning key. When held, it vibrates in your bones rather than your hand.',
      'EVA suit': 'A sealed suit with enough oxygen for thirty minutes and a distress transponder.',
    };
    return descriptions[item];
  }
  const detail = ROOMS[state.location].details[subject]
    || Object.entries(ROOMS[state.location].details).find(([key]) => subject.includes(key))?.[1];
  return detail || `You find nothing useful about "${target.trim()}" here.`;
}

function take(state, target) {
  const item = itemName(target);
  if (hasItem(state, item)) return `You already have the ${item}.`;
  if (!visibleItems(state).includes(item)) return `You do not see a ${item} here.`;
  state.inventory.push(item);
  const droppedHere = state.droppedItems?.[state.location] || [];
  if (droppedHere.includes(item)) {
    state.droppedItems[state.location] = droppedHere.filter((entry) => entry !== item);
  } else if (!state.removedItems.includes(item)) {
    state.removedItems.push(item);
  }
  return `Taken: ${item}.`;
}

function drop(state, target) {
  const item = itemName(target);
  if (!hasItem(state, item)) return `You are not carrying the ${item}.`;
  state.inventory = state.inventory.filter((entry) => entry !== item);
  state.droppedItems ||= {};
  state.droppedItems[state.location] ||= [];
  state.droppedItems[state.location].push(item);
  return `Dropped: ${item}.`;
}

function useItem(state, itemInput, targetInput = '') {
  const item = itemName(itemInput);
  const target = normalize(targetInput).replace(/^(the|a|an) /, '');
  if (!hasItem(state, item)) return `You are not carrying the ${item}.`;

  if (item === 'phase fuse' && state.location === 'engineering' && (!target || target.includes('socket') || target.includes('reactor'))) {
    state.flags.fuseInstalled = true;
    state.inventory = state.inventory.filter((entry) => entry !== item);
    return 'You lock the phase fuse into the socket. The reactor console wakes with a low violet glow.';
  }
  if (item === 'star chart' && state.location === 'bridge' && (!target || target.includes('console') || target.includes('navigation'))) {
    state.flags.navigationAligned = true;
    return 'You spread the star chart across the console. The mismatched fields rotate into one clear route home.';
  }
  if (item === 'spectral prism' && state.location === 'chamber' && (!target || target.includes('cradle'))) {
    state.flags.prismInstalled = true;
    state.inventory = state.inventory.filter((entry) => entry !== item);
    return 'The prism settles into the cradle. Divided light pours toward the black aperture.';
  }
  if (item === 'harmonic key' && state.location === 'chamber' && (!target || target.includes('console') || target.includes('slot'))) {
    state.flags.resonanceTuned = true;
    return 'The harmonic key rings without sound. The aperture expands into a doorway filled with distant stars.';
  }
  if (item === 'EVA suit') return 'You check the EVA suit seals. It is ready if you decide to launch the escape pod.';
  return `The ${item} has no useful effect${target ? ` on the ${target}` : ''} here.`;
}

function operate(state, target) {
  const subject = normalize(target);
  if (state.location === 'engineering' && (subject.includes('console') || subject.includes('reactor'))) {
    if (!state.flags.fuseInstalled) return 'The reactor console flashes: PHASE FUSE REQUIRED.';
    if (state.flags.power) return 'Ship power is already stable, or at least stable-adjacent.';
    state.flags.power = true;
    return 'You start the reactor. Light races through the Eventide, and three distant doors unlock.';
  }
  if (state.location === 'comms' && (subject.includes('terminal') || subject.includes('beacon'))) {
    if (!state.flags.power) return 'The transmission terminal is powerless.';
    if (state.flags.beacon) return 'The rescue beacon is already broadcasting beyond the distortion.';
    state.flags.beacon = true;
    return `You broadcast the Eventide's rescue beacon. Something inside the wormhole answers with your own voice: "Signal received."`;
  }
  return `Nothing happens when you operate the ${target || 'equipment'}.`;
}

function inventory(state) {
  return state.inventory.length ? `You are carrying ${joinWords(state.inventory)}.` : 'You are carrying nothing.';
}

function status(state) {
  const objectives = [
    ['Restore ship power', state.flags.power],
    ['Broadcast the rescue beacon', state.flags.beacon],
    ['Align the navigation system', state.flags.navigationAligned],
    ['Install the spectral prism', state.flags.prismInstalled],
    ['Tune the wormhole resonance', state.flags.resonanceTuned],
  ];
  return objectives.map(([label, done]) => `${done ? '[complete]' : '[pending]'} ${label}`).join('\n');
}

function hint(state) {
  if (!state.flags.fuseInstalled) return hasItem(state, 'phase fuse') ? 'The empty socket in engineering matches the phase fuse.' : 'Search engineering for a way to restore power.';
  if (!state.flags.power) return 'Try operating the reactor console now that the fuse is installed.';
  if (!state.flags.beacon) return 'The communications terminal can send a beacon now that power is restored.';
  if (!state.flags.navigationAligned) return hasItem(state, 'star chart') ? 'The bridge console asked for a physical reference chart.' : 'The quantum archive contains navigation records.';
  if (!state.flags.prismInstalled) return hasItem(state, 'spectral prism') ? 'The voice mentioned divided light and an hourglass throat.' : 'The observatory contains an optical device.';
  if (!state.flags.resonanceTuned) return hasItem(state, 'harmonic key') ? 'The resonance console in the chamber has a suspiciously familiar slot.' : 'Read the final log in the quantum archive.';
  return 'The wormhole is stable. You may ENTER WORMHOLE, or return to the escape pod if you prefer fewer impossible geometries.';
}

function ending(state, type) {
  state.ended = true;
  state.ending = type;
  if (type === 'wormhole') {
    return `THE LISTENING DOOR\n\nYou step through the aperture. The pressure in your ears stops. The Eventide's missing shuttles are waiting above a blue world. Dr. Voss answers your call. Her first question is not about the ship or the wormhole. She asks how long you were alone. You cannot bring yourself to answer.\n\nEnding discovered: The Listening Door.\n\n${FINAL_TRANSMISSION}`;
  }
  if (type === 'escape') {
    return `A QUIET WAY HOME\n\nThe pod clears the Eventide before the ship folds into violet light. A rescue crew finds you hours later. The first person through the hatch wraps a blanket around your shoulders and stays until you can speak. You survived, but no one else came home.\n\nEnding discovered: A Quiet Way Home.\n\n${FINAL_TRANSMISSION}`;
  }
  return `THE VERY CLEAR WARNING\n\nYou overload the reactor. The last thing you hear is a voice from communications saying your name. A century later, a survey crew records a small violet star where the Eventide disappeared. They never learn who was aboard.\n\nEnding discovered: The Very Clear Warning.\n\n${FINAL_TRANSMISSION}`;
}

function attemptFinalAction(state, command) {
  if (/^(enter|cross|step into|go through) (the )?(wormhole|aperture|doorway)$/.test(command)) {
    if (state.location !== 'chamber') return 'There is no wormhole entrance here.';
    if (!(state.flags.beacon && state.flags.navigationAligned && state.flags.prismInstalled && state.flags.resonanceTuned)) {
      return 'The aperture rejects your approach. The Eventide must be aligned, broadcasting, illuminated, and tuned first.';
    }
    return ending(state, 'wormhole');
  }
  if (/^(launch|enter|use) (the )?(pod|escape pod)$/.test(command)) {
    if (state.location !== 'airlock') return 'The escape pod is in the forward airlock.';
    if (!state.flags.beacon) return 'The pod has no safe destination lock. Broadcast a rescue beacon first.';
    if (!hasItem(state, 'EVA suit')) return 'The pod warns that an EVA suit is required for launch.';
    return ending(state, 'escape');
  }
  if (/^overload (the )?(reactor|engine)$/.test(command)) {
    if (state.location !== 'engineering' || !state.flags.power) return 'There is no active reactor here to overload.';
    return ending(state, 'overload');
  }
  return null;
}

export const HELP_TEXT = `Commands:\nLOOK or EXAMINE [thing]\nGO NORTH, SOUTH, EAST, WEST, UP, or DOWN\nTAKE [item], DROP [item], INVENTORY\nUSE [item] ON [thing], OPERATE [thing]\nREAD [thing], LISTEN, STATUS, HINT\nSAVE, LOAD, RESTART, HELP\n\nMost commands can be shortened. Try N, X CONSOLE, or I.`;

export function executeCommand(currentState, rawInput) {
  const state = structuredClone(currentState);
  const command = normalize(rawInput);
  if (!command) return { state, output: 'The cursor waits for a command.', changed: false };
  if (state.ended && !['restart', 'load', 'help'].includes(command)) {
    return { state, output: 'This transmission has ended. Type RESTART to begin again or LOAD to restore a saved game.', changed: false };
  }

  let output;
  const finalOutput = attemptFinalAction(state, command);
  if (finalOutput) output = finalOutput;
  else if (command === 'look' || command === 'l') output = describeRoom(state);
  else if (command === 'inventory' || command === 'inv' || command === 'i') output = inventory(state);
  else if (command === 'status' || command === 'objectives') output = status(state);
  else if (command === 'hint') output = hint(state);
  else if (command === 'help' || command === '?') output = HELP_TEXT;
  else if (command === 'listen') output = examine(state, state.location === 'comms' ? 'static' : state.location === 'chamber' ? 'aperture' : 'room');
  else if (command === 'wait' || command === 'z') output = 'A second passes. Somewhere in the ship, another second passes in the opposite direction.';
  else if (DIRECTIONS[command]) output = move(state, DIRECTIONS[command]);
  else {
    const goMatch = command.match(/^(?:go|walk|move|climb) (north|south|east|west|up|down|n|s|e|w|u|d)$/);
    const examineMatch = command.match(/^(?:examine|inspect|look at|x|read) (.+)$/);
    const takeMatch = command.match(/^(?:take|get|pick up|grab) (.+)$/);
    const dropMatch = command.match(/^drop (.+)$/);
    const useMatch = command.match(/^use (.+?)(?: on| with| in| into) (.+)$/) || command.match(/^(?:insert|install|place|put) (.+?)(?: in| into| on) (.+)$/);
    const simpleUseMatch = command.match(/^use (.+)$/);
    const operateMatch = command.match(/^(?:operate|activate|start|turn on|press) (.+)$/);
    if (goMatch) output = move(state, DIRECTIONS[goMatch[1]]);
    else if (examineMatch) output = examine(state, examineMatch[1]);
    else if (takeMatch) output = take(state, takeMatch[1]);
    else if (dropMatch) output = drop(state, dropMatch[1]);
    else if (useMatch) output = useItem(state, useMatch[1], useMatch[2]);
    else if (simpleUseMatch) output = useItem(state, simpleUseMatch[1]);
    else if (operateMatch) output = operate(state, operateMatch[1]);
    else if (/^(talk|speak|answer)( to)?/.test(command)) output = "Your words return through the speakers in Dr. Voss's voice three seconds before you say them.";
    else output = `The ship does not understand "${rawInput.trim()}." Type HELP for available commands.`;
  }

  const changed = JSON.stringify(state) !== JSON.stringify(currentState);
  if (changed && !['look', 'l', 'inventory', 'inv', 'i', 'status', 'objectives', 'hint', 'help', '?'].includes(command)) state.moves += 1;
  return { state, output, changed };
}

export function serializeGame(state) {
  return JSON.stringify({ ...state, version: GAME_VERSION });
}

export function deserializeGame(value) {
  const parsed = JSON.parse(value);
  if (!parsed || parsed.version !== GAME_VERSION || !ROOMS[parsed.location] || !Array.isArray(parsed.inventory)) {
    throw new TypeError('This save is not compatible with the current game.');
  }
  parsed.droppedItems ||= {};
  return parsed;
}
