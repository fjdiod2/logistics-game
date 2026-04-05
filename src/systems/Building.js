// Building system
// Handles construction, upgrades, and production

import { getBuildingType, getRecipe, BUILDING_TYPES } from '../data/buildings.js'
import { GAME_CONFIG } from '../data/gameConfig.js'
import { getTerrain } from '../data/terrains.js'
import { isOwnedByPlayer } from './Ownership.js'
import { GameState } from './GameState.js'

/**
 * Create a new building (starts construction)
 * @param {string} buildingType - Building type id
 * @param {string} recipe - Recipe id (for factories, optional)
 * @returns {Object} - Building state object
 */
export function createBuilding(buildingType, recipe = null) {
  const type = getBuildingType(buildingType)
  if (!type) return null

  const buildTime = Math.ceil(
    type.baseBuildTime * GAME_CONFIG.constructionTimeMultiplier
  )

  const building = {
    type: buildingType,
    level: 1,
    recipe: buildingType === 'factory' ? recipe : null,
    constructionProgress: buildTime,  // turns remaining
    upgradeProgress: 0,
    storage: {},        // output storage
    inputStorage: {}    // input storage (for factories)
  }

  // Initialize Army HQ specific state
  if (buildingType === 'armyHQ') {
    building.storage = { soldiers: 0 }
    building.projection = {
      targetQ: null,
      targetR: null,
      width: 0.5,
      enabled: false
    }
  }

  return building
}

/**
 * Get build cost for a building type
 * @param {string} buildingType - Building type id
 * @returns {number} - Gold cost
 */
export function getBuildCost(buildingType) {
  const type = getBuildingType(buildingType)
  if (!type) return Infinity

  return Math.ceil(type.baseBuildCost * GAME_CONFIG.constructionCostMultiplier)
}

/**
 * Get upgrade cost for a building at current level
 * @param {Object} building - Building state object
 * @returns {number} - Gold cost (0 if max level)
 */
export function getUpgradeCost(building) {
  const type = getBuildingType(building.type)
  if (!type) return Infinity

  const nextLevel = building.level + 1
  const upgrade = type.upgrades.find(u => u.level === nextLevel)
  if (!upgrade) return Infinity  // Max level

  return Math.ceil(upgrade.cost * GAME_CONFIG.upgradeCostMultiplier)
}

/**
 * Start upgrading a building
 * @param {Object} building - Building state object
 * @returns {boolean} - Success
 */
export function startUpgrade(building) {
  const type = getBuildingType(building.type)
  if (!type) return false

  const nextLevel = building.level + 1
  const upgrade = type.upgrades.find(u => u.level === nextLevel)
  if (!upgrade) return false  // Max level

  if (building.constructionProgress > 0) return false  // Still building
  if (building.upgradeProgress > 0) return false  // Already upgrading

  building.upgradeProgress = Math.ceil(
    upgrade.time * GAME_CONFIG.upgradeTimeMultiplier
  )
  return true
}

/**
 * Check if province can build
 * @param {Object} province - Province data
 * @returns {boolean}
 */
export function canBuild(province) {
  // Check ownership - only allow building in player's own provinces
  if (!isOwnedByPlayer(province, GameState.currentPlayerId)) {
    return false
  }

  const terrain = getTerrain(province.terrain)
  const slots = terrain.maxBuildingSlots || 0
  return slots > 0 && !province.building
}

/**
 * Process construction/upgrade progress (called each turn)
 * @param {Object} building - Building state object
 * @returns {Object} - { constructed, upgraded }
 */
export function processConstruction(building) {
  const result = { constructed: false, upgraded: false }

  if (building.constructionProgress > 0) {
    building.constructionProgress--
    if (building.constructionProgress === 0) {
      result.constructed = true
    }
  } else if (building.upgradeProgress > 0) {
    building.upgradeProgress--
    if (building.upgradeProgress === 0) {
      building.level++
      result.upgraded = true
    }
  }

  return result
}

/**
 * Check if building is operational (not under construction/upgrade)
 * @param {Object} building - Building state object
 * @returns {boolean}
 */
export function isOperational(building) {
  return building &&
    building.constructionProgress === 0 &&
    building.upgradeProgress === 0
}

/**
 * Calculate the real extraction rate for a resource in a province
 * @param {Object} province - Province data
 * @param {string} resourceId - Resource id
 * @returns {number} - Real extraction rate per turn
 */
function calculateExtractionRate(province, resourceId) {
  const extractor = province.extractors[resourceId]
  if (!extractor) return 0

  const workerPercent = province.workerAllocation.extractor || 0
  const maxWorkers = GAME_CONFIG.extractorMaxWorkerPercent
  const effectiveWorkers = Math.min(workerPercent, maxWorkers)

  const baseOutput = GAME_CONFIG.extractorBaseOutput
  // Note: We'd need resource yield here, but for simplicity use base
  return baseOutput * effectiveWorkers
}

/**
 * Calculate factory production
 * @param {Object} province - Province data
 * @param {Object} building - Building state object
 * @returns {Object} - Production calculation result with real rates
 */
export function calculateFactoryProduction(province, building) {
  if (building.type !== 'factory' || !isOperational(building)) {
    return { canProduce: false, produced: 0, realProductionRate: 0, inputRates: [] }
  }

  const recipe = getRecipe(building.recipe)
  if (!recipe) {
    return { canProduce: false, produced: 0, reason: 'No recipe set', realProductionRate: 0, inputRates: [] }
  }

  const type = getBuildingType('factory')
  const upgrade = type.upgrades.find(u => u.level === building.level)
  const multiplier = upgrade?.productionMultiplier || 1

  // Check worker allocation
  const workerPercent = province.workerAllocation.building || 0
  const maxWorkers = type.maxWorkerPercent
  const effectiveWorkers = Math.min(workerPercent, maxWorkers)

  // Calculate real rates (before any flooring)
  const baseProduction = type.baseProductionRate * effectiveWorkers * multiplier
  const outputAmount = recipe.outputs[0].amount
  const cyclesPerTurn = baseProduction / outputAmount
  const realProductionRate = cyclesPerTurn * outputAmount

  // Calculate input consumption rates and supply info
  const inputRates = recipe.inputs.map(input => {
    const key = input.resource || input.good
    const consumptionRate = input.amount * cyclesPerTurn

    // Get supply rate if it's a resource from extractor
    let supplyRate = 0
    if (input.resource && province.extractors[input.resource]) {
      supplyRate = calculateExtractionRate(province, input.resource)
    }

    const currentStock = building.inputStorage[key] || 0

    return {
      key,
      consumptionRate,
      supplyRate,
      isResource: !!input.resource,
      currentStock,
      amountPerCycle: input.amount
    }
  })

  if (effectiveWorkers === 0) {
    return {
      canProduce: false,
      produced: 0,
      reason: 'No workers assigned',
      realProductionRate: 0,
      inputRates
    }
  }

  // Check inputs available (for at least one cycle)
  const inputsAvailable = recipe.inputs.every(input => {
    const key = input.resource || input.good
    const stored = building.inputStorage[key] || 0
    return stored >= input.amount
  })

  // Check output capacity
  const outputKey = recipe.outputs[0].good
  const currentOutput = building.storage[outputKey] || 0
  const capacity = type.baseOutputCapacity * multiplier
  const spaceAvailable = capacity - currentOutput

  if (spaceAvailable <= 0) {
    return {
      canProduce: false,
      produced: 0,
      reason: 'Output full',
      atCapacity: true,
      realProductionRate,
      inputRates,
      capacity,
      stored: currentOutput,
      workerPercent: effectiveWorkers
    }
  }

  if (!inputsAvailable) {
    return {
      canProduce: false,
      produced: 0,
      reason: 'Missing inputs',
      realProductionRate,
      inputRates,
      capacity,
      stored: currentOutput,
      workerPercent: effectiveWorkers
    }
  }

  // For display, show integer cycles (actual production uses accumulation)
  const cycles = Math.floor(cyclesPerTurn)

  if (cycles === 0 && cyclesPerTurn > 0) {
    // Fractional production - will accumulate over turns
    return {
      canProduce: true,  // Will produce via accumulation
      cycles: 0,
      produced: 0,
      realProductionRate,
      inputRates,
      capacity,
      stored: currentOutput,
      workerPercent: effectiveWorkers,
      inputs: recipe.inputs.map(i => ({ ...i, amount: 0 })),
      outputs: recipe.outputs.map(o => ({ ...o, amount: 0 }))
    }
  }

  const actualCycles = Math.min(cycles, Math.floor(spaceAvailable / outputAmount))

  return {
    canProduce: actualCycles > 0 || cyclesPerTurn > 0,
    cycles: actualCycles,
    produced: actualCycles * outputAmount,
    realProductionRate,
    inputRates,
    inputs: recipe.inputs.map(i => ({ ...i, amount: i.amount * actualCycles })),
    outputs: recipe.outputs.map(o => ({ ...o, amount: o.amount * actualCycles })),
    capacity,
    stored: currentOutput,
    workerPercent: effectiveWorkers
  }
}

/**
 * Process factory production (called each turn)
 * Uses fractional accumulation for production cycles
 * @param {Object} province - Province data
 * @param {Object} building - Building state object
 * @returns {Object} - Production result
 */
export function processFactoryProduction(province, building) {
  const recipe = getRecipe(building.recipe)
  if (!recipe) {
    return { canProduce: false, produced: 0, reason: 'No recipe set' }
  }

  const type = getBuildingType('factory')
  const upgrade = type.upgrades.find(u => u.level === building.level)
  const multiplier = upgrade?.productionMultiplier || 1

  const workerPercent = province.workerAllocation.building || 0
  const maxWorkers = type.maxWorkerPercent
  const effectiveWorkers = Math.min(workerPercent, maxWorkers)

  if (effectiveWorkers === 0) {
    return calculateFactoryProduction(province, building)
  }

  // Calculate cycles per turn (fractional)
  const baseProduction = type.baseProductionRate * effectiveWorkers * multiplier
  const outputAmount = recipe.outputs[0].amount
  const cyclesPerTurn = baseProduction / outputAmount

  // Accumulate fractional cycles
  building.productionProgress = (building.productionProgress || 0) + cyclesPerTurn

  // Check how many whole cycles we can do
  const wholeCycles = Math.floor(building.productionProgress)

  if (wholeCycles === 0) {
    // Not enough accumulated yet, return calc info without producing
    return calculateFactoryProduction(province, building)
  }

  // Check inputs available for the cycles
  let maxCyclesFromInputs = wholeCycles
  for (const input of recipe.inputs) {
    const key = input.resource || input.good
    const stored = building.inputStorage[key] || 0
    const cyclesFromThisInput = Math.floor(stored / input.amount)
    maxCyclesFromInputs = Math.min(maxCyclesFromInputs, cyclesFromThisInput)
  }

  if (maxCyclesFromInputs === 0) {
    // No inputs available
    const calc = calculateFactoryProduction(province, building)
    calc.reason = 'Missing inputs'
    return calc
  }

  // Check output capacity
  const outputKey = recipe.outputs[0].good
  const currentOutput = building.storage[outputKey] || 0
  const capacity = type.baseOutputCapacity * multiplier
  const spaceAvailable = capacity - currentOutput
  const maxCyclesFromSpace = Math.floor(spaceAvailable / outputAmount)

  if (maxCyclesFromSpace === 0) {
    const calc = calculateFactoryProduction(province, building)
    calc.reason = 'Output full'
    calc.atCapacity = true
    return calc
  }

  // Determine actual cycles to execute
  const actualCycles = Math.min(wholeCycles, maxCyclesFromInputs, maxCyclesFromSpace)

  if (actualCycles > 0) {
    // Consume progress for completed cycles
    building.productionProgress -= actualCycles

    // Consume inputs
    for (const input of recipe.inputs) {
      const key = input.resource || input.good
      building.inputStorage[key] = (building.inputStorage[key] || 0) - (input.amount * actualCycles)
    }

    // Produce outputs
    for (const output of recipe.outputs) {
      building.storage[output.good] = (building.storage[output.good] || 0) + (output.amount * actualCycles)
    }
  }

  // Return full calculation with actual production
  const calc = calculateFactoryProduction(province, building)
  calc.produced = actualCycles * outputAmount
  calc.cycles = actualCycles
  calc.canProduce = true
  calc.inputs = recipe.inputs.map(i => ({ ...i, amount: i.amount * actualCycles }))
  calc.outputs = recipe.outputs.map(o => ({ ...o, amount: o.amount * actualCycles }))

  return calc
}

/**
 * Calculate recruitment center production
 * @param {Object} province - Province data
 * @param {Object} building - Building state object
 * @returns {Object} - Recruitment calculation result
 */
export function calculateRecruitment(province, building) {
  if (building.type !== 'recruitmentCenter' || !isOperational(building)) {
    return { canRecruit: false, soldiers: 0 }
  }

  const type = getBuildingType('recruitmentCenter')
  const upgrade = type.upgrades.find(u => u.level === building.level)
  const multiplier = upgrade?.productionMultiplier || 1

  // Check worker allocation
  const workerPercent = province.workerAllocation.building || 0
  const maxWorkers = type.maxWorkerPercent
  const effectiveWorkers = Math.min(workerPercent, maxWorkers)

  if (effectiveWorkers === 0) {
    return { canRecruit: false, soldiers: 0, reason: 'No workers assigned' }
  }

  // Check output capacity
  const currentSoldiers = building.storage.soldiers || 0
  const capacity = type.baseOutputCapacity * multiplier
  const spaceAvailable = capacity - currentSoldiers

  if (spaceAvailable <= 0) {
    return { canRecruit: false, soldiers: 0, reason: 'Barracks full', atCapacity: true, capacity, stored: currentSoldiers }
  }

  // Calculate soldiers produced (fractional rate)
  const baseRate = type.baseRecruitRate * effectiveWorkers * multiplier
  const soldiers = Math.floor(baseRate)

  // Even if soldiers is 0, we can still recruit via accumulation if baseRate > 0
  if (baseRate === 0) {
    return {
      canRecruit: false,
      soldiers: 0,
      reason: 'No workers assigned',
      capacity,
      stored: currentSoldiers,
      workerPercent: effectiveWorkers
    }
  }

  // For display, show integer soldiers (actual production uses accumulation)
  const displaySoldiers = soldiers > 0 ? soldiers : baseRate

  // Population that would be consumed
  const popConsumed = Math.max(1, soldiers) * GAME_CONFIG.populationPerSoldier

  // Check if enough population (use at least 1 soldier worth for check)
  const minPopNeeded = GAME_CONFIG.populationPerSoldier + GAME_CONFIG.minPopulation
  if (province.population < minPopNeeded) {
    return {
      canRecruit: false,
      soldiers: 0,
      reason: 'Not enough population',
      capacity,
      stored: currentSoldiers,
      workerPercent: effectiveWorkers,
      realRecruitRate: baseRate
    }
  }

  return {
    canRecruit: true,
    soldiers: displaySoldiers,
    populationConsumed: popConsumed,
    capacity,
    stored: currentSoldiers,
    workerPercent: effectiveWorkers,
    realRecruitRate: baseRate
  }
}

/**
 * Process recruitment (called each turn)
 * Uses fractional accumulation for soldier production
 * @param {Object} province - Province data
 * @param {Object} building - Building state object
 * @returns {Object} - Recruitment result
 */
export function processRecruitment(province, building) {
  if (building.type !== 'recruitmentCenter' || !isOperational(building)) {
    return { canRecruit: false, soldiers: 0 }
  }

  const type = getBuildingType('recruitmentCenter')
  const upgrade = type.upgrades.find(u => u.level === building.level)
  const multiplier = upgrade?.productionMultiplier || 1

  const workerPercent = province.workerAllocation.building || 0
  const maxWorkers = type.maxWorkerPercent
  const effectiveWorkers = Math.min(workerPercent, maxWorkers)

  if (effectiveWorkers === 0) {
    return calculateRecruitment(province, building)
  }

  // Calculate fractional recruitment rate
  const baseRate = type.baseRecruitRate * effectiveWorkers * multiplier

  // Accumulate fractional soldiers
  building.recruitmentProgress = (building.recruitmentProgress || 0) + baseRate

  // Check how many whole soldiers we can recruit
  const wholeSoldiers = Math.floor(building.recruitmentProgress)

  if (wholeSoldiers === 0) {
    // Not enough accumulated yet, return calc info without producing
    const calc = calculateRecruitment(province, building)
    calc.realRecruitRate = baseRate
    return calc
  }

  // Check output capacity
  const currentSoldiers = building.storage.soldiers || 0
  const capacity = type.baseOutputCapacity * multiplier
  const spaceAvailable = capacity - currentSoldiers

  if (spaceAvailable <= 0) {
    return {
      canRecruit: false,
      soldiers: 0,
      reason: 'Barracks full',
      atCapacity: true,
      capacity,
      stored: currentSoldiers,
      realRecruitRate: baseRate
    }
  }

  // Check population available
  const popPerSoldier = GAME_CONFIG.populationPerSoldier
  const availablePop = province.population - GAME_CONFIG.minPopulation
  const maxFromPop = Math.floor(availablePop / popPerSoldier)

  if (maxFromPop <= 0) {
    return {
      canRecruit: false,
      soldiers: 0,
      reason: 'Not enough population',
      capacity,
      stored: currentSoldiers,
      realRecruitRate: baseRate
    }
  }

  // Determine actual soldiers to recruit
  const actualSoldiers = Math.min(wholeSoldiers, spaceAvailable, maxFromPop)

  if (actualSoldiers > 0) {
    // Consume progress for recruited soldiers
    building.recruitmentProgress -= actualSoldiers

    // Consume population
    province.population -= actualSoldiers * popPerSoldier

    // Produce soldiers
    building.storage.soldiers = currentSoldiers + actualSoldiers
  }

  return {
    canRecruit: true,
    soldiers: actualSoldiers,
    populationConsumed: actualSoldiers * popPerSoldier,
    capacity,
    stored: building.storage.soldiers,
    workerPercent: effectiveWorkers,
    realRecruitRate: baseRate,
    produced: true
  }
}

/**
 * Withdraw from building storage
 * @param {Object} building - Building state object
 * @param {string} itemId - Good or 'soldiers'
 * @param {number} amount - Amount to withdraw
 * @returns {number} - Actual amount withdrawn
 */
export function withdrawFromBuilding(building, itemId, amount) {
  const available = building.storage[itemId] || 0
  const withdrawn = Math.min(amount, available)
  building.storage[itemId] = available - withdrawn
  return withdrawn
}

/**
 * Deposit into building input storage
 * @param {Object} building - Building state object
 * @param {string} itemId - Resource or good id
 * @param {number} amount - Amount to deposit
 */
export function depositToBuilding(building, itemId, amount) {
  building.inputStorage[itemId] = (building.inputStorage[itemId] || 0) + amount
}

/**
 * Get building summary for UI
 * @param {Object} province - Province data
 * @returns {Object} - Building info summary
 */
export function getBuildingSummary(province) {
  const building = province.building
  if (!building) {
    return { hasBuilding: false, canBuild: canBuild(province) }
  }

  const type = getBuildingType(building.type)
  const upgrade = type.upgrades.find(u => u.level === building.level)
  const nextUpgrade = type.upgrades.find(u => u.level === building.level + 1)

  const summary = {
    hasBuilding: true,
    type: building.type,
    typeName: type.name,
    typeIcon: type.icon,
    level: building.level,
    levelName: upgrade?.name || 'Unknown',
    isConstructing: building.constructionProgress > 0,
    constructionTurns: building.constructionProgress,
    isUpgrading: building.upgradeProgress > 0,
    upgradeTurns: building.upgradeProgress,
    isOperational: isOperational(building),
    canUpgrade: !nextUpgrade ? false : isOperational(building),
    upgradeCost: nextUpgrade ? getUpgradeCost(building) : null,
    storage: { ...building.storage },
    inputStorage: { ...building.inputStorage }
  }

  // Add production info based on type
  if (building.type === 'factory') {
    summary.recipe = building.recipe
    summary.production = calculateFactoryProduction(province, building)
  } else if (building.type === 'recruitmentCenter') {
    summary.recruitment = calculateRecruitment(province, building)
  }

  return summary
}
