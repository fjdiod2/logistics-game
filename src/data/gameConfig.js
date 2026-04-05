// Game configuration
// All balance-related values in one place for easy tweaking

export const GAME_CONFIG = {
  // ===================
  // ECONOMY
  // ===================

  // Tax settings
  baseTaxRate: 0.1,              // 10% of population value goes to taxes
  taxPerPopulation: 0.5,         // Each person generates 0.5 gold base

  // Starting resources
  startingTreasury: 1000,
  startingGoods: {},             // Empty - no starting goods

  // ===================
  // POPULATION
  // ===================

  // Growth modifiers
  minPopulationGrowth: -0.05,    // Population can shrink max 5% per turn
  maxPopulationGrowth: 0.10,     // Population can grow max 10% per turn
  minPopulation: 10,             // Province can't go below this

  // ===================
  // WORKERS
  // ===================

  // Worker allocation caps
  maxTotalWorkerPercent: 0.7,    // Max 70% of pop can be workers total
  minIdlePercent: 0.3,           // At least 30% must be "idle" (paying taxes)

  // Worker efficiency
  workerEfficiencyBase: 1.0,     // Base efficiency multiplier

  // ===================
  // EXTRACTORS
  // ===================

  // Auto-created for resource tiles
  extractorMaxWorkerPercent: 0.4,  // Max 40% can work extraction
  extractorBaseOutput: 5,          // Base units per turn at 100% workers
  extractorOutputCapacity: 50,     // Storage before extraction stops

  // ===================
  // BUILDINGS
  // ===================

  // Default slots (can be overridden by terrain)
  defaultBuildingSlots: 1,

  // Construction
  constructionCostMultiplier: 1.0,  // Multiply all build costs
  constructionTimeMultiplier: 1.0,  // Multiply all build times

  // Upgrades
  upgradeCostMultiplier: 1.0,
  upgradeTimeMultiplier: 1.0,

  // ===================
  // RECRUITMENT
  // ===================

  // Soldiers
  populationPerSoldier: 1,       // 1 population consumed per soldier
  soldierMaintenanceCost: 1,     // Gold per soldier per turn

  // Growth penalty from recruitment
  recruitmentGrowthPenalty: 0,   // No growth penalty from recruitment

  // ===================
  // PRODUCTION
  // ===================

  // Factory settings
  productionTicksPerTurn: 1,     // How many production cycles per turn
  capacityOverflowLoss: true,    // If true, excess production is lost

  // ===================
  // TURN TIMING
  // ===================

  turnDurationMs: 2000,          // Base turn duration (ms) - modified by speed multiplier

  // Speed control options
  speedOptions: [
    { label: '⏹', multiplier: 0 },      // Paused
    { label: '1x', multiplier: 1 },     // Normal speed (2000ms)
    { label: '1.5x', multiplier: 1.5 }, // Faster (1333ms)
    { label: '2x', multiplier: 2 }      // Fastest (1000ms)
  ],

  // ===================
  // MAP GENERATION
  // ===================

  defaultMapWidth: 12,
  defaultMapHeight: 10,
  resourceSpawnChance: 0.3,      // 30% of tiles have resources

  // ===================
  // RAILROADS
  // ===================

  railroad: {
    baseCostPerTile: 100,           // Gold cost per tile
    terrainCostMultipliers: {
      plains: 1.0,
      forest: 1.5,
      mountains: 3.0,
      desert: 1.2,
      tundra: 1.3,
      water: Infinity               // Cannot build through water
    },
    baseBuildTime: 2,               // Base turns to build
    buildTimePerTile: 1,            // Additional turns per tile
    baseLossPerTile: 0.02,          // 2% loss per tile base
    terrainLossMultipliers: {
      plains: 1.0,
      forest: 1.2,
      mountains: 2.0,
      desert: 1.5,
      tundra: 1.3,
      water: Infinity
    },
    baseCapacity: 50,               // Max units transported per turn
    maxRailroadsPerProvince: 5,     // Max outgoing railroads per province
    maxDistance: 8,                 // Max hex distance for railroad
    baseTransportStorageCapacity: 100  // Base capacity for province transport storage
  },

  // ===================
  // UI
  // ===================

  showDebugInfo: true,
  animationSpeed: 1.0,

  // ===================
  // OWNERSHIP
  // ===================

  ownership: {
    defaultSplit: 'horizontal',  // 'horizontal', 'vertical', 'custom'
    humanPlayerId: 0,
    aiPlayerId: 1
  },

  // ===================
  // ARMY HQ
  // ===================

  armyHQ: {
    maxDeploymentPerTurn: 50,     // Cap on soldiers deployed each turn from HQ
    baseProjectionRadius: 3       // Default projection radius at level 1
  },

  // ===================
  // COMBAT
  // ===================

  combat: {
    // Control mechanics
    controlCap: 100,              // Control needed to capture province
    baseControlRate: 5,           // Base control/turn per 100 soldiers
    controlDecayRate: 0.1,        // 10% decay per turn when not under pressure
    controlResetOnDefend: false,  // Don't reset - control decays naturally instead

    // Combat/attrition mechanics
    baseAttritionRate: 0.05,      // 5% base soldier loss in combat
    minAttritionPerTurn: 1,       // Minimum soldiers lost per combat

    // Terrain modifiers (defender advantage)
    terrainDefenseModifiers: {
      plains: 1.0,
      forest: 0.8,      // 20% less attrition for defender
      mountains: 0.5,   // 50% less attrition for defender
      desert: 1.1,      // 10% more attrition
      tundra: 1.2,      // 20% more attrition (cold)
      water: Infinity   // No combat in water
    },

    // Attacker penalties
    terrainAttackModifiers: {
      plains: 1.0,
      forest: 1.2,      // 20% more attrition attacking into forest
      mountains: 1.8,   // 80% more attrition attacking mountains
      desert: 1.3,
      tundra: 1.3,
      water: Infinity
    },

    // Future extensibility hooks
    supplyEffectEnabled: false,    // Future: supply lines
    moraleEffectEnabled: false     // Future: morale system
  }
}

// Helper to get nested config values safely
export function getConfig(path, defaultValue = null) {
  const keys = path.split('.')
  let value = GAME_CONFIG

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return defaultValue
    }
  }

  return value
}

// Helper to modify config at runtime (for testing/cheats)
export function setConfig(path, value) {
  const keys = path.split('.')
  const lastKey = keys.pop()
  let target = GAME_CONFIG

  for (const key of keys) {
    if (!(key in target)) {
      target[key] = {}
    }
    target = target[key]
  }

  target[lastKey] = value
}
