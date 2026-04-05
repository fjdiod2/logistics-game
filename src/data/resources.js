// Resource type registry
// Add new resource types here to extend the game

export const RESOURCES = {
  iron: {
    id: 'iron',
    name: 'Iron',
    color: 0x8b4513,
    icon: '⛏️',
    baseYield: 2,
    validTerrains: ['mountains', 'plains']
  },
  wood: {
    id: 'wood',
    name: 'Wood',
    color: 0x654321,
    icon: '🪵',
    baseYield: 3,
    validTerrains: ['forest']
  },
  food: {
    id: 'food',
    name: 'Food',
    color: 0xffd700,
    icon: '🌾',
    baseYield: 4,
    validTerrains: ['plains', 'forest']
  },
  stone: {
    id: 'stone',
    name: 'Stone',
    color: 0x696969,
    icon: '🪨',
    baseYield: 2,
    validTerrains: ['mountains', 'desert']
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    color: 0xffd700,
    icon: '💰',
    baseYield: 1,
    validTerrains: ['mountains', 'desert']
  },
  fish: {
    id: 'fish',
    name: 'Fish',
    color: 0x00bfff,
    icon: '🐟',
    baseYield: 3,
    validTerrains: ['water']
  },
  coal: {
    id: 'coal',
    name: 'Coal',
    color: 0x2d2d2d,
    icon: 'ite',
    baseYield: 2,
    validTerrains: ['mountains']
  }
}

export function getResource(id) {
  return RESOURCES[id] || null
}

export function getResourceIds() {
  return Object.keys(RESOURCES)
}

export function getResourcesForTerrain(terrainId) {
  return Object.values(RESOURCES).filter(r => r.validTerrains.includes(terrainId))
}
