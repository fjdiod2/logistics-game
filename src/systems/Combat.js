// Combat system
// Handles soldier combat, control projection, and territory capture

import { GAME_CONFIG } from '../data/gameConfig.js'
import { getNeighbors } from '../utils/hexUtils.js'

/**
 * Get the number of soldiers in a province (from transportStorage)
 * @param {Object} province - Province data
 * @returns {number} - Soldier count
 */
export function getSoldiers(province) {
  return province.transportStorage?.soldiers || 0
}

/**
 * Set soldiers in a province
 * @param {Object} province - Province data
 * @param {number} count - New soldier count
 */
export function setSoldiers(province, count) {
  if (!province.transportStorage) {
    province.transportStorage = {}
  }
  province.transportStorage.soldiers = Math.max(0, Math.floor(count))
}

/**
 * Get terrain modifier for combat
 * @param {string} terrain - Terrain type
 * @param {string} type - 'attack' | 'defense' | 'control'
 * @returns {number} - Modifier multiplier
 */
export function getTerrainModifier(terrain, type) {
  const config = GAME_CONFIG.combat

  if (type === 'attack') {
    return config.terrainAttackModifiers[terrain] ?? 1.0
  } else if (type === 'defense') {
    return config.terrainDefenseModifiers[terrain] ?? 1.0
  } else if (type === 'control') {
    // Control uses attack modifiers (attacker is projecting control)
    return config.terrainAttackModifiers[terrain] ?? 1.0
  }

  return 1.0
}

/**
 * Get soldier ratio modifier (outnumbering advantage)
 * @param {number} ratio - enemySoldiers / yourSoldiers
 * @returns {number} - Modifier multiplier (higher = more attrition for you)
 */
export function getSoldierRatioModifier(ratio) {
  // Ratio < 0.5 → 1.5x attrition (badly outnumbered)
  // Ratio 0.5-1.0 → linear interpolation (1.5 to 1.0)
  // Ratio 1.0-2.0 → linear interpolation (1.0 to 0.5)
  // Ratio > 2.0 → 0.5x attrition (overwhelming force)

  if (ratio < 0.5) {
    return 1.5
  } else if (ratio < 1.0) {
    // Linear from 1.5 to 1.0 as ratio goes 0.5 to 1.0
    return 1.5 - (ratio - 0.5) * 1.0
  } else if (ratio < 2.0) {
    // Linear from 1.0 to 0.5 as ratio goes 1.0 to 2.0
    return 1.0 - (ratio - 1.0) * 0.5
  } else {
    return 0.5
  }
}

/**
 * Get supply modifier (future extensibility)
 * @param {Object} province - Province data
 * @param {Object} gameState - Game state
 * @returns {number} - Modifier multiplier
 */
export function getSupplyModifier(province, gameState) {
  if (!GAME_CONFIG.combat.supplyEffectEnabled) {
    return 1.0
  }
  // Future: implement supply line calculations
  return 1.0
}

/**
 * Calculate attrition for a province in combat
 * @param {number} soldiers - Number of soldiers
 * @param {Object} context - { terrain, enemySoldiers, isAttacker, province, gameState }
 * @returns {number} - Soldiers lost
 */
export function calculateAttrition(soldiers, context) {
  if (soldiers <= 0) return 0

  const config = GAME_CONFIG.combat
  const { terrain, enemySoldiers, isAttacker, province, gameState } = context

  // Base attrition
  let attrition = soldiers * config.baseAttritionRate

  // Terrain modifier
  const terrainType = isAttacker ? 'attack' : 'defense'
  attrition *= getTerrainModifier(terrain, terrainType)

  // Soldier ratio modifier (enemy / you)
  const ratio = enemySoldiers / Math.max(1, soldiers)
  attrition *= getSoldierRatioModifier(ratio)

  // Supply modifier (future)
  attrition *= getSupplyModifier(province, gameState)

  // Enforce minimum
  attrition = Math.max(config.minAttritionPerTurn, Math.floor(attrition))

  // Can't lose more than you have
  return Math.min(attrition, soldiers)
}

/**
 * Find all borders between provinces of different players
 * @param {MapData} mapData - The map data
 * @returns {Array} - Array of { attacker, defender } province pairs
 */
export function findBorders(mapData) {
  const borders = []
  const processed = new Set()

  for (const province of mapData.getAllProvinces()) {
    const neighbors = getNeighbors(province.q, province.r)

    for (const coord of neighbors) {
      const neighbor = mapData.getProvince(coord.q, coord.r)
      if (!neighbor) continue

      // Skip same-owner neighbors
      if (province.playerId === neighbor.playerId) continue

      // Create unique key for this border pair
      const key1 = `${province.q},${province.r}-${neighbor.q},${neighbor.r}`
      const key2 = `${neighbor.q},${neighbor.r}-${province.q},${province.r}`

      if (processed.has(key1) || processed.has(key2)) continue
      processed.add(key1)

      // Determine attacker/defender (both can be attackers in mutual combat)
      borders.push({
        provinceA: province,
        provinceB: neighbor
      })
    }
  }

  return borders
}

/**
 * Resolve combat between two provinces (both have soldiers)
 * @param {Object} provinceA - First province
 * @param {Object} provinceB - Second province
 * @param {Object} gameState - Game state
 * @returns {Object} - Combat result
 */
export function resolveCombatBorder(provinceA, provinceB, gameState) {
  const soldiersA = getSoldiers(provinceA)
  const soldiersB = getSoldiers(provinceB)

  if (soldiersA <= 0 || soldiersB <= 0) {
    return null // Not mutual combat
  }

  // A attacks B's terrain, B attacks A's terrain
  const attritionA = calculateAttrition(soldiersA, {
    terrain: provinceB.terrain,
    enemySoldiers: soldiersB,
    isAttacker: true,
    province: provinceA,
    gameState
  })

  const attritionB = calculateAttrition(soldiersB, {
    terrain: provinceA.terrain,
    enemySoldiers: soldiersA,
    isAttacker: true,
    province: provinceB,
    gameState
  })

  // Apply attrition
  setSoldiers(provinceA, soldiersA - attritionA)
  setSoldiers(provinceB, soldiersB - attritionB)

  return {
    type: 'combat',
    provinceA: { q: provinceA.q, r: provinceA.r, name: provinceA.name },
    provinceB: { q: provinceB.q, r: provinceB.r, name: provinceB.name },
    attritionA,
    attritionB,
    remainingA: getSoldiers(provinceA),
    remainingB: getSoldiers(provinceB)
  }
}

/**
 * Resolve control projection (attacker has soldiers, defender has none)
 * @param {Object} attacker - Attacking province
 * @param {Object} defender - Defending province
 * @param {Object} gameState - Game state
 * @returns {Object} - Control result
 */
export function resolveControlBorder(attacker, defender, gameState) {
  const attackerSoldiers = getSoldiers(attacker)
  const defenderSoldiers = getSoldiers(defender)

  if (attackerSoldiers <= 0 || defenderSoldiers > 0) {
    return null // Not control projection
  }

  const config = GAME_CONFIG.combat

  // Calculate control gain
  const terrainMod = getTerrainModifier(defender.terrain, 'control')
  if (terrainMod === Infinity) {
    return null // Can't control water
  }

  let controlGain = config.baseControlRate * (attackerSoldiers / 100) / terrainMod

  // Accumulate control
  const oldControl = defender.control || 0
  const attackerPlayerId = attacker.playerId

  // If a different attacker was exerting control, reset
  if (defender.controllingPlayerId !== null && defender.controllingPlayerId !== attackerPlayerId) {
    defender.control = 0
  }

  defender.controllingPlayerId = attackerPlayerId
  defender.control = Math.min(config.controlCap, (defender.control || 0) + controlGain)

  // Occupation attrition (half rate)
  const occupationAttrition = calculateAttrition(attackerSoldiers, {
    terrain: defender.terrain,
    enemySoldiers: 0,
    isAttacker: true,
    province: attacker,
    gameState
  }) * 0.5

  setSoldiers(attacker, attackerSoldiers - Math.floor(occupationAttrition))

  return {
    type: 'control',
    attacker: { q: attacker.q, r: attacker.r, name: attacker.name, playerId: attackerPlayerId },
    defender: { q: defender.q, r: defender.r, name: defender.name },
    controlGain,
    totalControl: defender.control,
    occupationAttrition: Math.floor(occupationAttrition)
  }
}

/**
 * Process control decay for a province
 * @param {Object} province - Province data
 * @param {boolean} hasEnemyPressure - Whether enemy soldiers are adjacent
 * @returns {Object|null} - Decay result or null
 */
export function processControlDecay(province, hasEnemyPressure) {
  if (province.control <= 0 || hasEnemyPressure) {
    return null
  }

  const config = GAME_CONFIG.combat
  const oldControl = province.control

  province.control = province.control * (1 - config.controlDecayRate)
  if (province.control < 1) {
    province.control = 0
    province.controllingPlayerId = null
  }

  return {
    type: 'decay',
    province: { q: province.q, r: province.r, name: province.name },
    oldControl,
    newControl: province.control
  }
}

/**
 * Process control capture (ownership change)
 * @param {Object} province - Province data
 * @returns {Object|null} - Capture result or null
 */
export function processControlCapture(province) {
  const config = GAME_CONFIG.combat

  if (province.control < config.controlCap || province.controllingPlayerId === null) {
    return null
  }

  const oldPlayerId = province.playerId
  const newPlayerId = province.controllingPlayerId

  // Change ownership
  province.playerId = newPlayerId
  province.control = 0
  province.controllingPlayerId = null

  return {
    type: 'capture',
    province: { q: province.q, r: province.r, name: province.name },
    oldPlayerId,
    newPlayerId
  }
}

/**
 * Check if control should reset (defenders appeared)
 * @param {Object} province - Province data
 * @returns {Object|null} - Reset result or null
 */
export function checkControlReset(province) {
  const config = GAME_CONFIG.combat

  if (!config.controlResetOnDefend) return null
  if (province.control <= 0) return null

  const soldiers = getSoldiers(province)
  if (soldiers <= 0) return null

  // Defenders present - reset control
  const oldControl = province.control
  province.control = 0
  province.controllingPlayerId = null

  return {
    type: 'controlReset',
    province: { q: province.q, r: province.r, name: province.name },
    oldControl
  }
}

/**
 * Main combat processor - call each turn
 * @param {MapData} mapData - The map data
 * @param {Object} gameState - Game state
 * @returns {Object} - Combat summary
 */
export function processCombat(mapData, gameState) {
  const summary = {
    combats: [],
    controls: [],
    decays: [],
    captures: [],
    controlResets: []
  }

  // Step 1: Check for control resets (defenders appeared)
  for (const province of mapData.getAllProvinces()) {
    const result = checkControlReset(province)
    if (result) {
      summary.controlResets.push(result)
    }
  }

  // Step 2: Find all inter-player borders
  const borders = findBorders(mapData)

  // Track which provinces have enemy pressure (for decay calculation)
  const hasEnemyPressure = new Set()

  // Step 3: Process each border
  for (const { provinceA, provinceB } of borders) {
    const soldiersA = getSoldiers(provinceA)
    const soldiersB = getSoldiers(provinceB)

    // Case 1: Both have soldiers - mutual combat
    if (soldiersA > 0 && soldiersB > 0) {
      const result = resolveCombatBorder(provinceA, provinceB, gameState)
      if (result) {
        summary.combats.push(result)
      }
      // Both sides have pressure
      hasEnemyPressure.add(`${provinceA.q},${provinceA.r}`)
      hasEnemyPressure.add(`${provinceB.q},${provinceB.r}`)
    }
    // Case 2: A has soldiers, B doesn't - A projects control onto B
    else if (soldiersA > 0 && soldiersB === 0) {
      const result = resolveControlBorder(provinceA, provinceB, gameState)
      if (result) {
        summary.controls.push(result)
      }
      hasEnemyPressure.add(`${provinceB.q},${provinceB.r}`)
    }
    // Case 3: B has soldiers, A doesn't - B projects control onto A
    else if (soldiersB > 0 && soldiersA === 0) {
      const result = resolveControlBorder(provinceB, provinceA, gameState)
      if (result) {
        summary.controls.push(result)
      }
      hasEnemyPressure.add(`${provinceA.q},${provinceA.r}`)
    }
  }

  // Step 4: Process control decay for provinces without enemy pressure
  for (const province of mapData.getAllProvinces()) {
    const key = `${province.q},${province.r}`
    if (!hasEnemyPressure.has(key)) {
      const result = processControlDecay(province, false)
      if (result) {
        summary.decays.push(result)
      }
    }
  }

  // Step 5: Process captures (ownership changes)
  for (const province of mapData.getAllProvinces()) {
    const result = processControlCapture(province)
    if (result) {
      summary.captures.push(result)
    }
  }

  return summary
}

/**
 * Get combat status for a province (for UI)
 * @param {Object} province - Province data
 * @param {MapData} mapData - Map data
 * @returns {Object} - Combat status info
 */
export function getCombatStatus(province, mapData) {
  const soldiers = getSoldiers(province)
  const neighbors = getNeighbors(province.q, province.r)

  let inCombat = false
  let underAttack = false
  let projecting = false
  const enemyNeighbors = []

  for (const coord of neighbors) {
    const neighbor = mapData.getProvince(coord.q, coord.r)
    if (!neighbor) continue
    if (neighbor.playerId === province.playerId) continue

    const enemySoldiers = getSoldiers(neighbor)
    enemyNeighbors.push({
      q: neighbor.q,
      r: neighbor.r,
      soldiers: enemySoldiers,
      playerId: neighbor.playerId
    })

    if (enemySoldiers > 0) {
      if (soldiers > 0) {
        inCombat = true
      } else {
        underAttack = true
      }
    } else if (soldiers > 0) {
      projecting = true
    }
  }

  return {
    soldiers,
    inCombat,
    underAttack,
    projecting,
    control: province.control || 0,
    controllingPlayerId: province.controllingPlayerId,
    controlPercent: ((province.control || 0) / GAME_CONFIG.combat.controlCap) * 100,
    enemyNeighbors
  }
}
