// Army HQ system
// Handles soldier depot, front detection, and force projection

import { GAME_CONFIG } from '../data/gameConfig.js'
import { getBuildingType } from '../data/buildings.js'
import { hexDistance, getNeighbors } from '../utils/hexUtils.js'
import { isOwnedByPlayer } from './Ownership.js'
import { isOperational } from './Building.js'

/**
 * Get projection radius for an Army HQ based on upgrade level
 * @param {Object} building - HQ building object
 * @returns {number} - Projection radius in hexes
 */
export function getProjectionRadius(building) {
  if (!building || building.type !== 'armyHQ') return 0

  const type = getBuildingType('armyHQ')
  const level = building.level || 1
  const upgrade = type.upgrades.find(u => u.level === level)

  return upgrade?.projectionRadius || GAME_CONFIG.armyHQ.baseProjectionRadius
}

/**
 * Get depot capacity for an Army HQ based on upgrade level
 * @param {Object} building - HQ building object
 * @returns {number} - Max soldiers the depot can hold
 */
export function getDepotCapacity(building) {
  if (!building || building.type !== 'armyHQ') return 0

  const type = getBuildingType('armyHQ')
  const level = building.level || 1
  const upgrade = type.upgrades.find(u => u.level === level)

  return upgrade?.depotCapacity || 100
}

/**
 * Get soldiers in HQ depot
 * @param {Object} building - HQ building object
 * @returns {number} - Soldier count
 */
export function getDepotSoldiers(building) {
  if (!building || building.type !== 'armyHQ') return 0
  return building.storage?.soldiers || 0
}

/**
 * Initialize HQ building state if needed
 * @param {Object} building - HQ building object
 */
export function initializeHQState(building) {
  if (!building || building.type !== 'armyHQ') return

  if (!building.storage) {
    building.storage = { soldiers: 0 }
  }

  if (!building.projection) {
    building.projection = {
      targetQ: null,
      targetR: null,
      width: 0.5,
      enabled: false
    }
  }
}

/**
 * Get all hexes within projection radius of HQ
 * @param {Object} hqProvince - Province containing the HQ
 * @param {MapData} mapData - Map data
 * @param {number} radius - Projection radius
 * @returns {Array} - Array of {q, r, province} for hexes in range
 */
export function getHexesInRange(hqProvince, mapData, radius) {
  const result = []

  for (const province of mapData.getAllProvinces()) {
    const dist = hexDistance(hqProvince.q, hqProvince.r, province.q, province.r)
    if (dist <= radius && dist > 0) {
      result.push({
        q: province.q,
        r: province.r,
        province,
        distance: dist
      })
    }
  }

  return result
}

/**
 * Calculate the front - enemy tiles within range that border friendly tiles
 * @param {Object} hqProvince - Province containing the HQ
 * @param {MapData} mapData - Map data
 * @returns {Array} - Array of { q, r, province, adjacentFriendlyCount, adjacentFriendly }
 */
export function calculateFront(hqProvince, mapData) {
  if (!hqProvince.building || hqProvince.building.type !== 'armyHQ') {
    return []
  }

  if (!isOperational(hqProvince.building)) {
    return []
  }

  const playerId = hqProvince.playerId
  const radius = getProjectionRadius(hqProvince.building)
  const hexesInRange = getHexesInRange(hqProvince, mapData, radius)

  const front = []

  for (const hex of hexesInRange) {
    // Skip friendly tiles
    if (hex.province.playerId === playerId) continue

    // Skip water
    if (hex.province.terrain === 'water') continue

    // Check if borders at least one friendly tile
    const neighbors = getNeighbors(hex.q, hex.r)
    const adjacentFriendly = []

    for (const coord of neighbors) {
      const neighbor = mapData.getProvince(coord.q, coord.r)
      if (neighbor && neighbor.playerId === playerId) {
        adjacentFriendly.push({ q: coord.q, r: coord.r, province: neighbor })
      }
    }

    if (adjacentFriendly.length > 0) {
      front.push({
        q: hex.q,
        r: hex.r,
        province: hex.province,
        distance: hex.distance,
        adjacentFriendlyCount: adjacentFriendly.length,
        adjacentFriendly
      })
    }
  }

  return front
}

/**
 * Calculate soldier distribution across front tiles based on arrow target and width
 * @param {Array} front - Front tiles from calculateFront
 * @param {number} targetQ - Arrow target hex Q
 * @param {number} targetR - Arrow target hex R
 * @param {number} width - Spread width (0 = focused, 1 = even)
 * @param {number} totalSoldiers - Total soldiers to distribute
 * @returns {Array} - Array of { q, r, soldiers, weight, deployFrom }
 */
export function calculateDistribution(front, targetQ, targetR, width, totalSoldiers) {
  if (front.length === 0 || totalSoldiers <= 0) {
    return []
  }

  // Clamp width to valid range
  width = Math.max(0, Math.min(1, width))

  // Calculate weights based on distance from target
  const weights = []
  let totalWeight = 0

  // Focus factor controls how sharply distribution falls off
  const focusFactor = 2.0

  for (const tile of front) {
    const distFromTarget = hexDistance(tile.q, tile.r, targetQ, targetR)

    // Weight formula: width + (1 - width) * exp(-focusFactor * distance)
    // When width = 0: Sharp falloff, most soldiers near target
    // When width = 1: Equal weight everywhere
    const weight = width + (1 - width) * Math.exp(-focusFactor * distFromTarget / 3)

    weights.push({
      tile,
      weight,
      distFromTarget
    })
    totalWeight += weight
  }

  // Normalize weights and calculate soldier counts
  const distribution = []
  let allocatedSoldiers = 0

  // Sort by weight descending for allocation priority
  weights.sort((a, b) => b.weight - a.weight)

  for (let i = 0; i < weights.length; i++) {
    const { tile, weight, distFromTarget } = weights[i]
    const normalizedWeight = weight / totalWeight

    // Calculate soldiers for this tile
    let soldiers
    if (i === weights.length - 1) {
      // Last tile gets remaining soldiers to avoid rounding errors
      soldiers = totalSoldiers - allocatedSoldiers
    } else {
      soldiers = Math.floor(totalSoldiers * normalizedWeight)
    }

    if (soldiers > 0) {
      // Find best adjacent friendly province for deployment
      const deployFrom = tile.adjacentFriendly[0] // Just use first available

      distribution.push({
        q: tile.q,
        r: tile.r,
        province: tile.province,
        soldiers,
        weight: normalizedWeight,
        distFromTarget,
        deployFrom
      })

      allocatedSoldiers += soldiers
    }
  }

  return distribution
}

/**
 * Check if HQ projection is valid and has targets
 * @param {Object} hqProvince - Province with HQ
 * @param {MapData} mapData - Map data
 * @returns {Object} - { valid, reason, front }
 */
export function validateProjection(hqProvince, mapData) {
  if (!hqProvince.building || hqProvince.building.type !== 'armyHQ') {
    return { valid: false, reason: 'No Army HQ building' }
  }

  if (!isOperational(hqProvince.building)) {
    return { valid: false, reason: 'HQ under construction' }
  }

  const projection = hqProvince.building.projection
  if (!projection || !projection.enabled) {
    return { valid: false, reason: 'Projection not enabled' }
  }

  if (projection.targetQ === null || projection.targetR === null) {
    return { valid: false, reason: 'No target set' }
  }

  const front = calculateFront(hqProvince, mapData)
  if (front.length === 0) {
    return { valid: false, reason: 'No enemies in range', front: [] }
  }

  const soldiers = getDepotSoldiers(hqProvince.building)
  if (soldiers <= 0) {
    return { valid: false, reason: 'No soldiers in depot', front }
  }

  return { valid: true, front, soldiers }
}

/**
 * Process HQ deployment at start of combat
 * @param {Object} hqProvince - Province with HQ
 * @param {MapData} mapData - Map data
 * @returns {Object} - Deployment summary
 */
export function processHQDeployment(hqProvince, mapData) {
  const summary = {
    hqLocation: { q: hqProvince.q, r: hqProvince.r },
    deployed: [],
    totalDeployed: 0
  }

  const validation = validateProjection(hqProvince, mapData)
  if (!validation.valid) {
    summary.skipped = true
    summary.reason = validation.reason
    return summary
  }

  const building = hqProvince.building
  const projection = building.projection
  const maxDeploy = GAME_CONFIG.armyHQ.maxDeploymentPerTurn
  const availableSoldiers = Math.min(getDepotSoldiers(building), maxDeploy)

  if (availableSoldiers <= 0) {
    summary.skipped = true
    summary.reason = 'No soldiers to deploy'
    return summary
  }

  // Calculate distribution
  const distribution = calculateDistribution(
    validation.front,
    projection.targetQ,
    projection.targetR,
    projection.width,
    availableSoldiers
  )

  // Deploy soldiers to adjacent friendly provinces
  for (const deploy of distribution) {
    if (deploy.soldiers <= 0) continue

    const sourceProvince = deploy.deployFrom.province
    if (!sourceProvince) continue

    // Add soldiers to the friendly province's transport storage
    if (!sourceProvince.transportStorage) {
      sourceProvince.transportStorage = {}
    }
    sourceProvince.transportStorage.soldiers =
      (sourceProvince.transportStorage.soldiers || 0) + deploy.soldiers

    summary.deployed.push({
      target: { q: deploy.q, r: deploy.r },
      source: { q: sourceProvince.q, r: sourceProvince.r },
      soldiers: deploy.soldiers
    })
    summary.totalDeployed += deploy.soldiers
  }

  // Deduct from depot
  building.storage.soldiers -= summary.totalDeployed

  return summary
}

/**
 * Get HQ summary for UI
 * @param {Object} province - Province with HQ
 * @param {MapData} mapData - Map data
 * @returns {Object} - HQ status info
 */
export function getHQSummary(province, mapData) {
  if (!province.building || province.building.type !== 'armyHQ') {
    return null
  }

  const building = province.building
  initializeHQState(building)

  const operational = isOperational(building)
  const soldiers = getDepotSoldiers(building)
  const capacity = getDepotCapacity(building)
  const radius = getProjectionRadius(building)
  const projection = building.projection

  let front = []
  let distribution = []

  // Always calculate front when operational (needed for UI to show if enemies are in range)
  if (operational) {
    front = calculateFront(province, mapData)

    // Only calculate distribution if projection is enabled and has a target
    if (projection.enabled && projection.targetQ !== null && front.length > 0 && soldiers > 0) {
      const deployAmount = Math.min(soldiers, GAME_CONFIG.armyHQ.maxDeploymentPerTurn)
      distribution = calculateDistribution(
        front,
        projection.targetQ,
        projection.targetR,
        projection.width,
        deployAmount
      )
    }
  }

  return {
    operational,
    soldiers,
    capacity,
    capacityPercent: Math.round((soldiers / capacity) * 100),
    radius,
    projection: {
      enabled: projection.enabled,
      targetQ: projection.targetQ,
      targetR: projection.targetR,
      width: projection.width
    },
    front,
    distribution,
    maxDeployPerTurn: GAME_CONFIG.armyHQ.maxDeploymentPerTurn
  }
}

/**
 * Set projection target for HQ
 * @param {Object} building - HQ building
 * @param {number} targetQ - Target hex Q
 * @param {number} targetR - Target hex R
 * @param {number} width - Spread width (0-1)
 */
export function setProjectionTarget(building, targetQ, targetR, width = 0.5) {
  if (!building || building.type !== 'armyHQ') return

  initializeHQState(building)

  building.projection.targetQ = targetQ
  building.projection.targetR = targetR
  building.projection.width = Math.max(0, Math.min(1, width))
  building.projection.enabled = true
}

/**
 * Disable projection for HQ
 * @param {Object} building - HQ building
 */
export function disableProjection(building) {
  if (!building || building.type !== 'armyHQ') return

  initializeHQState(building)
  building.projection.enabled = false
}

/**
 * Set projection width
 * @param {Object} building - HQ building
 * @param {number} width - Width 0-1
 */
export function setProjectionWidth(building, width) {
  if (!building || building.type !== 'armyHQ') return

  initializeHQState(building)
  building.projection.width = Math.max(0, Math.min(1, width))
}

/**
 * Handle HQ destruction - release soldiers to province
 * @param {Object} province - Province with destroyed HQ
 */
export function releaseHQSoldiers(province) {
  if (!province.building || province.building.type !== 'armyHQ') return

  const soldiers = getDepotSoldiers(province.building)
  if (soldiers > 0) {
    if (!province.transportStorage) {
      province.transportStorage = {}
    }
    province.transportStorage.soldiers =
      (province.transportStorage.soldiers || 0) + soldiers
    province.building.storage.soldiers = 0
  }
}

/**
 * Find all operational Army HQs for a player
 * @param {MapData} mapData - Map data
 * @param {number} playerId - Player ID
 * @returns {Array} - Array of provinces with operational HQs
 */
export function findPlayerHQs(mapData, playerId) {
  const hqs = []

  for (const province of mapData.getAllProvinces()) {
    if (province.playerId !== playerId) continue
    if (!province.building || province.building.type !== 'armyHQ') continue
    if (!isOperational(province.building)) continue

    hqs.push(province)
  }

  return hqs
}
