// Terrain type registry
// Add new terrain types here to extend the game

export const TERRAINS = {
  plains: {
    id: 'plains',
    name: 'Plains',
    color: 0x90c040,
    movementCost: 1,
    buildable: true,
    maxBuildingSlots: 1,
    basePopulationGrowth: 0.03,  // 3% per turn
    basePopulation: 1000
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    color: 0x228b22,
    movementCost: 2,
    buildable: true,
    maxBuildingSlots: 1,
    basePopulationGrowth: 0.02,  // 2% per turn
    basePopulation: 1000
  },
  mountains: {
    id: 'mountains',
    name: 'Mountains',
    color: 0x808080,
    movementCost: 3,
    buildable: false,
    maxBuildingSlots: 0,
    basePopulationGrowth: 0.01,  // 1% per turn
    basePopulation: 1000
  },
  water: {
    id: 'water',
    name: 'Water',
    color: 0x4a90d9,
    movementCost: Infinity,
    buildable: false,
    maxBuildingSlots: 0,
    basePopulationGrowth: 0,     // No population on water
    basePopulation: 0
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    color: 0xe8d174,
    movementCost: 2,
    buildable: true,
    maxBuildingSlots: 1,
    basePopulationGrowth: 0.01,  // 1% per turn
    basePopulation: 1000
  },
  tundra: {
    id: 'tundra',
    name: 'Tundra',
    color: 0xc8e0e8,
    movementCost: 2,
    buildable: true,
    maxBuildingSlots: 1,
    basePopulationGrowth: 0.015, // 1.5% per turn
    basePopulation: 1000
  }
}

export function getTerrain(id) {
  return TERRAINS[id] || TERRAINS.plains
}

export function getTerrainIds() {
  return Object.keys(TERRAINS)
}
