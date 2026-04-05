// Economy simulation module
// Handles per-turn economic calculations

import { getTerrain } from '../data/terrains.js'
import { getBuildingType, getRecipe } from '../data/buildings.js'
import { GAME_CONFIG } from '../data/gameConfig.js'
import { processExtraction, getExtractionSummary } from './Extractor.js'
import {
  processConstruction,
  processFactoryProduction,
  processRecruitment,
  isOperational
} from './Building.js'
import {
  processRailroadConstruction,
  processRailroadTransport,
  snapshotAllStorage,
  isRailroadOperational
} from './Railroad.js'
import { processCombat } from './Combat.js'

/**
 * Calculate population growth rate for a province
 * @param {Object} province - Province data
 * @returns {number} - Growth rate (can be negative)
 */
export function calculateGrowthRate(province) {
  const terrain = getTerrain(province.terrain)
  let growthRate = terrain.basePopulationGrowth

  // Recruitment penalty
  if (province.building?.type === 'recruitmentCenter' && isOperational(province.building)) {
    const workerPercent = province.workerAllocation.building || 0
    const type = getBuildingType('recruitmentCenter')
    const effectiveWorkers = Math.min(workerPercent, type.maxWorkerPercent)

    // Each % of workers recruiting reduces growth
    growthRate -= effectiveWorkers * GAME_CONFIG.recruitmentGrowthPenalty
  }

  // Clamp to min/max
  growthRate = Math.max(GAME_CONFIG.minPopulationGrowth, growthRate)
  growthRate = Math.min(GAME_CONFIG.maxPopulationGrowth, growthRate)

  return growthRate
}

/**
 * Process population growth for a province
 * @param {Object} province - Province data (will be mutated)
 * @returns {Object} - { oldPop, newPop, growth, growthRate }
 */
export function processPopulationGrowth(province) {
  const oldPop = province.population

  if (oldPop === 0) {
    return { oldPop: 0, newPop: 0, growth: 0, growthRate: 0 }
  }

  const growthRate = calculateGrowthRate(province)
  const growth = Math.floor(oldPop * growthRate)

  province.population = Math.max(GAME_CONFIG.minPopulation, oldPop + growth)
  province._cachedGrowthRate = growthRate

  return {
    oldPop,
    newPop: province.population,
    growth,
    growthRate
  }
}

/**
 * Calculate tax output for a province
 * @param {Object} province - Province data
 * @returns {number} - Tax income
 */
export function calculateTaxes(province) {
  if (province.population === 0) return 0

  const totalWorkerPercent =
    (province.workerAllocation.extractor || 0) +
    (province.workerAllocation.building || 0)

  // Idle population pays full taxes
  const idlePercent = Math.max(0, 1 - totalWorkerPercent)
  const idlePop = province.population * idlePercent

  // Workers pay reduced taxes
  let workerTaxes = 0

  // Extractor workers pay full taxes (they're just working the land)
  const extractorPop = province.population * (province.workerAllocation.extractor || 0)
  workerTaxes += extractorPop * GAME_CONFIG.taxPerPopulation * GAME_CONFIG.baseTaxRate

  // Building workers pay reduced taxes based on building type
  if (province.building && isOperational(province.building)) {
    const buildingType = getBuildingType(province.building.type)
    const taxReduction = buildingType?.taxReduction || 1
    const buildingPop = province.population * (province.workerAllocation.building || 0)
    workerTaxes += buildingPop * GAME_CONFIG.taxPerPopulation * GAME_CONFIG.baseTaxRate * taxReduction
  }

  // Calculate total taxes
  const idleTaxes = idlePop * GAME_CONFIG.taxPerPopulation * GAME_CONFIG.baseTaxRate
  const totalTaxes = Math.floor(idleTaxes + workerTaxes)

  province._cachedTaxOutput = totalTaxes
  return totalTaxes
}

/**
 * Process all production for a province
 * @param {Object} province - Province data (will be mutated)
 * @returns {Object} - Production results
 */
export function processProvinceProduction(province) {
  const results = {
    extraction: {},
    building: null
  }

  // Process extractors
  results.extraction = processExtraction(province)

  // Process building
  if (province.building) {
    // First, handle construction/upgrade progress
    const constructionResult = processConstruction(province.building)
    results.buildingConstruction = constructionResult

    // If operational, run production
    if (isOperational(province.building)) {
      if (province.building.type === 'factory') {
        // Transfer needed resources from extractors to factory input storage
        const recipe = getRecipe(province.building.recipe)
        if (recipe) {
          for (const input of recipe.inputs) {
            if (input.resource) {
              const extractor = province.extractors[input.resource]
              if (extractor && extractor.storage > 0) {
                const needed = input.amount * 10 // Buffer for production cycles
                const currentInput = province.building.inputStorage[input.resource] || 0
                const toTransfer = Math.max(0, needed - currentInput)
                const available = extractor.storage
                const transfer = Math.min(toTransfer, available)
                if (transfer > 0) {
                  extractor.storage -= transfer
                  province.building.inputStorage[input.resource] =
                    currentInput + transfer
                }
              }
            }
          }
        }
        results.building = processFactoryProduction(province, province.building)
      } else if (province.building.type === 'recruitmentCenter') {
        results.building = processRecruitment(province, province.building)
      }
    }
  }

  return results
}

/**
 * Process a full turn for all provinces
 * @param {MapData} mapData - The map data
 * @param {GameState} gameState - The game state (will be mutated)
 * @returns {Object} - Turn summary
 */
export function processTurn(mapData, gameState) {
  const summary = {
    turn: gameState.turn,
    provinces: [],
    totalTaxes: 0,
    totalPopulationChange: 0,
    totalSoldiersRecruited: 0,
    totalGoodsProduced: {},
    transport: []
  }

  for (const province of mapData.getAllProvinces()) {
    const provinceResult = {
      name: province.name,
      q: province.q,
      r: province.r
    }

    // 1. Population growth
    const growthResult = processPopulationGrowth(province)
    provinceResult.population = growthResult
    summary.totalPopulationChange += growthResult.growth

    // 2. Production (extraction + buildings)
    const productionResult = processProvinceProduction(province)
    provinceResult.production = productionResult

    // Track goods produced
    if (productionResult.building?.produced) {
      if (province.building.type === 'factory' && productionResult.building.outputs) {
        for (const output of productionResult.building.outputs) {
          summary.totalGoodsProduced[output.good] =
            (summary.totalGoodsProduced[output.good] || 0) + output.amount
        }
      } else if (province.building.type === 'recruitmentCenter') {
        summary.totalSoldiersRecruited += productionResult.building.soldiers || 0
      }
    }

    // 3. Tax collection
    const taxes = calculateTaxes(province)
    provinceResult.taxes = taxes
    summary.totalTaxes += taxes

    summary.provinces.push(provinceResult)
  }

  // 4. Railroad processing (after production, before state update)
  if (gameState.railroads && gameState.railroads.length > 0) {
    // Snapshot storage before transport (prevents multi-hop in single turn)
    const storageSnapshot = snapshotAllStorage(mapData)

    // Process construction progress for all railroads
    for (const railroad of gameState.railroads) {
      processRailroadConstruction(railroad)
    }

    // Process transport for operational railroads
    for (const railroad of gameState.railroads) {
      if (isRailroadOperational(railroad)) {
        const result = processRailroadTransport(railroad, mapData, storageSnapshot)
        summary.transport.push(result)
      }
    }
  }

  // 5. Soldier deployment (move soldiers from recruitment centers to field)
  for (const province of mapData.getAllProvinces()) {
    if (province.building?.type === 'recruitmentCenter' && isOperational(province.building)) {
      const available = province.building.storage?.soldiers || 0
      if (available > 0) {
        // Initialize transportStorage if needed
        if (!province.transportStorage) province.transportStorage = {}
        province.transportStorage.soldiers =
          (province.transportStorage.soldiers || 0) + available
        province.building.storage.soldiers = 0
      }
    }
  }

  // 6. Combat processing
  const combatSummary = processCombat(mapData, gameState)
  summary.combat = combatSummary

  // Update game state
  gameState.treasury += summary.totalTaxes
  gameState.turn++

  // Soldier maintenance cost
  const maintenanceCost = gameState.totalSoldiers * GAME_CONFIG.soldierMaintenanceCost
  gameState.treasury -= maintenanceCost
  summary.soldierMaintenance = maintenanceCost

  return summary
}

/**
 * Get economic summary for a province (for UI)
 * @param {Object} province - Province data
 * @returns {Object} - Economic info
 */
export function getEconomicSummary(province) {
  return {
    population: province.population,
    growthRate: calculateGrowthRate(province),
    growthPercent: (calculateGrowthRate(province) * 100).toFixed(1) + '%',
    taxes: calculateTaxes(province),
    workerAllocation: { ...province.workerAllocation },
    totalWorkerPercent:
      (province.workerAllocation.extractor || 0) +
      (province.workerAllocation.building || 0),
    idlePercent: Math.max(0, 1 -
      (province.workerAllocation.extractor || 0) -
      (province.workerAllocation.building || 0)
    ),
    extraction: getExtractionSummary(province)
  }
}

/**
 * Set worker allocation for a province
 * @param {Object} province - Province data
 * @param {string} target - 'extractor' or 'building'
 * @param {number} percent - 0 to 1
 * @returns {boolean} - Success
 */
export function setWorkerAllocation(province, target, percent) {
  // Clamp percent
  percent = Math.max(0, Math.min(1, percent))

  // Get max for this target
  let maxPercent = GAME_CONFIG.maxTotalWorkerPercent

  if (target === 'extractor') {
    maxPercent = Math.min(maxPercent, GAME_CONFIG.extractorMaxWorkerPercent)
  } else if (target === 'building' && province.building) {
    const type = getBuildingType(province.building.type)
    maxPercent = Math.min(maxPercent, type?.maxWorkerPercent || 0.5)
  }

  // Check total doesn't exceed max
  const otherTarget = target === 'extractor' ? 'building' : 'extractor'
  const otherAllocation = province.workerAllocation[otherTarget] || 0
  const maxForThis = Math.min(maxPercent, GAME_CONFIG.maxTotalWorkerPercent - otherAllocation)

  province.workerAllocation[target] = Math.min(percent, maxForThis)
  return true
}
