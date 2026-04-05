// Building types registry
// Add new building types here to extend the game

export const BUILDING_TYPES = {
  factory: {
    id: 'factory',
    name: 'Factory',
    icon: '🏭',
    description: 'Produces goods from raw resources or other goods',

    // Construction
    baseBuildCost: 500,
    baseBuildTime: 3,  // turns

    // Upgrade levels (multipliers for production)
    upgrades: [
      { level: 1, name: 'Basic', productionMultiplier: 1.0, cost: 0, time: 0 },
      { level: 2, name: 'Improved', productionMultiplier: 1.5, cost: 300, time: 2 },
      { level: 3, name: 'Advanced', productionMultiplier: 2.0, cost: 600, time: 3 },
      { level: 4, name: 'Industrial', productionMultiplier: 3.0, cost: 1200, time: 4 }
    ],

    // Production settings
    baseOutputCapacity: 100,   // max stored output before production stops
    baseProductionRate: 10,    // units per turn at 100% workers
    maxWorkerPercent: 0.5,     // max 50% of population can work here

    // Tax impact: workers in factory don't pay full taxes
    taxReduction: 0.5          // workers pay 50% taxes
  },

  recruitmentCenter: {
    id: 'recruitmentCenter',
    name: 'Recruitment Center',
    icon: '⚔️',
    description: 'Converts population into soldiers',

    // Construction
    baseBuildCost: 400,
    baseBuildTime: 2,  // turns

    // Upgrade levels
    upgrades: [
      { level: 1, name: 'Barracks', productionMultiplier: 1.0, cost: 0, time: 0 },
      { level: 2, name: 'Training Camp', productionMultiplier: 1.5, cost: 250, time: 2 },
      { level: 3, name: 'Military Academy', productionMultiplier: 2.0, cost: 500, time: 3 },
      { level: 4, name: 'War College', productionMultiplier: 2.5, cost: 1000, time: 4 }
    ],

    // Production settings
    baseOutputCapacity: 50,    // max soldiers waiting to be moved
    baseRecruitRate: 10,       // soldiers per turn at 100% workers
    maxWorkerPercent: 0.3,     // max 30% of population can be recruited

    // Population impact
    populationConsumed: true,  // recruiting reduces population
    growthPenaltyPerWorker: 0.0  // each 1% workers = -0.2% growth
  },

  armyHQ: {
    id: 'armyHQ',
    name: 'Army HQ',
    icon: '🏛️',
    description: 'Centralized command that collects soldiers and projects force across a front',

    // Construction
    baseBuildCost: 800,
    baseBuildTime: 4,  // turns

    // Upgrade levels
    upgrades: [
      { level: 1, name: 'Command Post', projectionRadius: 3, depotCapacity: 100, cost: 0, time: 0 },
      { level: 2, name: 'Field HQ', projectionRadius: 4, depotCapacity: 200, cost: 500, time: 3 },
      { level: 3, name: 'Regional Command', projectionRadius: 5, depotCapacity: 400, cost: 1000, time: 4 },
      { level: 4, name: 'Army Corps HQ', projectionRadius: 6, depotCapacity: 800, cost: 2000, time: 5 }
    ],

    // HQ operates automatically - no workers needed
    maxWorkerPercent: 0
  }
}

// Recipe definitions for factories
// Factories can be assigned a recipe to produce specific goods
export const RECIPES = {
  // Basic processing (resource -> good)
  ironSmelting: {
    id: 'ironSmelting',
    name: 'Iron Smelting',
    building: 'factory',
    inputs: [{ resource: 'iron', amount: 2 }],
    outputs: [{ good: 'metalParts', amount: 1 }],
    productionTime: 1
  },
  foodProcessing: {
    id: 'foodProcessing',
    name: 'Food Processing',
    building: 'factory',
    inputs: [{ resource: 'food', amount: 3 }],
    outputs: [{ good: 'rations', amount: 2 }],
    productionTime: 1
  },
  // Advanced processing (good -> good)
  weapons: {
    id: 'weapons',
    name: 'Weapons Manufacturing',
    building: 'factory',
    inputs: [{ good: 'metalParts', amount: 2 }, { good: 'lumber', amount: 1 }],
    outputs: [{ good: 'weapons', amount: 1 }],
    productionTime: 2
  },
  // tools: {
  //   id: 'tools',
  //   name: 'Tool Manufacturing',
  //   building: 'factory',
  //   inputs: [{ good: 'metalParts', amount: 1 }, { good: 'lumber', amount: 1 }],
  //   outputs: [{ good: 'tools', amount: 2 }],
  //   productionTime: 1
  // },
}

// Goods registry (produced by factories)
export const GOODS = {
  metalParts: { id: 'metalParts', name: 'Metal Parts', icon: '⚙️' },
  lumber: { id: 'lumber', name: 'Lumber', icon: '🪵' },
  blocks: { id: 'blocks', name: 'Stone Blocks', icon: '🧱' },
  rations: { id: 'rations', name: 'Rations', icon: '🍖' },
  weapons: { id: 'weapons', name: 'Weapons', icon: '⚔️' },
  tools: { id: 'tools', name: 'Tools', icon: '🔧' },
  steel: { id: 'steel', name: 'Steel', icon: '🔩' }
}

export function getBuildingType(id) {
  return BUILDING_TYPES[id] || null
}

export function getRecipe(id) {
  return RECIPES[id] || null
}

export function getGood(id) {
  return GOODS[id] || null
}

export function getBuildingTypeIds() {
  return Object.keys(BUILDING_TYPES)
}

export function getRecipeIds() {
  return Object.keys(RECIPES)
}

export function getRecipesForBuilding(buildingId) {
  return Object.values(RECIPES).filter(r => r.building === buildingId)
}
