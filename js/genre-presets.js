export const GENRE_PRESETS = [
  {
    id: 'rpg', label: 'RPG', igdbField: 'genre',
    games: [
      'Baldur\'s Gate 3', 'The Elder Scrolls V: Skyrim', 'Cyberpunk 2077',
      'Fallout 4', 'Elden Ring', 'Diablo IV', 'Path of Exile 2', 'Persona 5 Royal',
    ],
  },
  {
    id: 'mmo', label: 'MMO', igdbField: 'game mode',
    games: [
      'World of Warcraft', 'FINAL FANTASY XIV ONLINE', 'The Elder Scrolls Online',
      'Star Wars: The Old Republic', 'Guild Wars 2', 'Black Desert',
      'Old School RuneScape', 'New World: Aeternum',
    ],
  },
  {
    id: 'shooter', label: 'Shooter', igdbField: 'genre',
    games: [
      'Fortnite', 'VALORANT', 'Counter-Strike 2', 'Call of Duty: Warzone',
      'Apex Legends', 'Overwatch 2', 'Tom Clancy\'s Rainbow Six Siege', 'Destiny 2',
    ],
  },
  {
    id: 'strategy', label: 'Strategy', igdbField: 'genre',
    games: [
      'StarCraft II', 'Sid Meier\'s Civilization VI', 'Age of Empires IV',
      'Total War: WARHAMMER III', 'Hearts of Iron IV', 'Crusader Kings III',
      'Teamfight Tactics', 'XCOM 2',
    ],
  },
  {
    id: 'horror', label: 'Horror', igdbField: 'theme',
    games: [
      'Dead by Daylight', 'Phasmophobia', 'Resident Evil 4', 'Silent Hill 2',
      'The Outlast Trials', 'Lethal Company', 'Alien: Isolation', 'SOMA',
    ],
  },
  {
    id: 'survival', label: 'Survival', igdbField: 'theme',
    games: [
      'Minecraft', 'Rust', 'ARK: Survival Ascended', 'Valheim',
      'DayZ', '7 Days to Die', 'Sons of the Forest', 'Icarus',
    ],
  },
  {
    id: 'simulation', label: 'Simulation', igdbField: 'genre',
    games: [
      'The Sims 4', 'Microsoft Flight Simulator 2024', 'Euro Truck Simulator 2',
      'Farming Simulator 25', 'Cities: Skylines II', 'House Flipper 2',
      'PowerWash Simulator', 'Planet Zoo',
    ],
  },
  {
    id: 'adventure', label: 'Adventure', igdbField: 'genre',
    games: [
      'The Legend of Zelda: Tears of the Kingdom', 'God of War Ragnarök',
      'Stray', 'Uncharted 4: A Thief\'s End', 'Indiana Jones and the Great Circle',
      'A Plague Tale: Requiem', 'Red Dead Redemption 2', 'Star Wars Jedi: Survivor',
    ],
  },
  {
    id: 'creative', label: 'Creative', igdbField: 'Twitch category',
    games: ['Art', 'Makers & Crafting', 'Music', 'Food & Drink'],
  },
  {
    id: 'coding', label: 'Coding & Tech', igdbField: 'Twitch category',
    games: ['Software and Game Development', 'Science & Technology'],
  },
  {
    id: 'conversation', label: 'Conversation', igdbField: 'Twitch category',
    games: ['Just Chatting', 'Talk Shows & Podcasts', 'Travel & Outdoors', 'Sports'],
  },
];

export function getGenrePreset(id) {
  return GENRE_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function getGenreGameNames(ids) {
  const names = [];
  for (const id of ids) {
    for (const name of getGenrePreset(id)?.games ?? []) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

export function getGenreLabelsForGame(name, ids) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return ids
    .map(getGenrePreset)
    .filter((preset) => preset?.games.some((game) => {
      const presetName = game.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      return presetName === normalized ||
        presetName.includes(normalized) ||
        normalized.includes(presetName);
    }))
    .map((preset) => preset.label);
}
