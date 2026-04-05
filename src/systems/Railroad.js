// Railroad system
// Handles inter-province goods transport via railroads

import { GAME_CONFIG } from '../data/gameConfig.js'
import { getTerrain } from '../data/terrains.js'
import { hexDistance } from '../utils/hexUtils.js'
import { getResource } from '../data/resources.js'
import { getGood } from '../data/buildings.js'
import { isOwnedByPlayer } from './Ownership.js'
import { GameState } from './GameState.js'

/**
 * Generate unique railroad ID
 * @returns {string}
 */
function generateRailroadId() {
  return `railroad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Interpolate a line between two hex coordinates (cube coordinates method)
 * Returns all hexes along the path including start and end
 * @param {number} q1 - Source q
 * @param {number} r1 - Source r
 * @param {number} q2 - Destination q
 * @param {number} r2 - Destination r
 * @returns {Array} - Array of {q, r} coordinates
 */
export function getHexLinePath(q1, r1, q2, r2) {
  const distance = hexDistance(q1, r1, q2, r2)
  if (distance === 0) return [{ q: q1, r: r1 }]

  const path = []

  // Convert to cube coordinates
  const s1 = -q1 - r1
  const s2 = -q2 - r2

  for (let i = 0; i <= distance; i++) {
    const t = distance === 0 ? 0 : i / distance

    // Linear interpolation in cube space
    const q = q1 + (q2 - q1) * t
    const r = r1 + (r2 - r1) * t
    const s = s1 + (s2 - s1) * t

    // Round to nearest hex
    const rounded = cubeRound(q, r, s)
    path.push({ q: rounded.q, r: rounded.r })
  }

  return path
}

/**
 * Round fractional cube coordinates to nearest hex
 */
function cubeRound(q, r, s) {
  let rq = Math.round(q)
  let rr = Math.round(r)
  let rs = Math.round(s)

  const qDiff = Math.abs(rq - q)
  const rDiff = Math.abs(rr - r)
  const sDiff = Math.abs(rs - s)

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs
  } else if (rDiff > sDiff) {
    rr = -rq - rs
  }

  return { q: rq, r: rr }
}

/**
 * Calculate railroad cost based on path terrain
 * @param {Array} path - Array of {q, r} hex coordinates
 * @param {MapData} mapData - Map data for terrain lookup
 * @returns {number} - Total gold cost
 */
export function calculateRailroadCost(path, mapData) {
  const config = GAME_CONFIG.railroad
  let totalCost = 0

  // Skip source hex, only count tiles after it
  for (let i = 1; i < path.length; i++) {
    const hex = path[i]
    const province = mapData.getProvince(hex.q, hex.r)
    const terrain = province ? province.terrain : 'plains'
    const multiplier = config.terrainCostMultipliers[terrain] || 1.0

    if (multiplier === Infinity) {
      return Infinity // Cannot build through this terrain
    }

    totalCost += config.baseCostPerTile * multiplier
  }

  return Math.ceil(totalCost)
}

/**
 * Calculate total loss rate for a railroad path
 * @param {Array} path - Array of {q, r} hex coordinates
 * @param {MapData} mapData - Map data for terrain lookup
 * @returns {number} - Total loss rate (0-1)
 */
export function calculateRailroadLoss(path, mapData) {
  const config = GAME_CONFIG.railroad
  let totalLoss = 0

  // Skip source hex, only count tiles after it
  for (let i = 1; i < path.length; i++) {
    const hex = path[i]
    const province = mapData.getProvince(hex.q, hex.r)
    const terrain = province ? province.terrain : 'plains'
    const multiplier = config.terrainLossMultipliers[terrain] || 1.0

    if (multiplier === Infinity) {
      return 1 // 100% loss through impassable terrain
    }

    totalLoss += config.baseLossPerTile * multiplier
  }

  // Cap at 95% loss
  return Math.min(0.95, totalLoss)
}

/**
 * Calculate build time for a railroad
 * @param {number} distance - Hex distance
 * @returns {number} - Build time in turns
 */
export function calculateRailroadBuildTime(distance) {
  const config = GAME_CONFIG.railroad
  return config.baseBuildTime + Math.max(0, distance - 1) * config.buildTimePerTile
}

/**
 * Validate railroad can be built
 * @param {number} sourceQ - Source hex q
 * @param {number} sourceR - Source hex r
 * @param {number} destQ - Destination hex q
 * @param {number} destR - Destination hex r
 * @param {MapData} mapData - Map data
 * @param {Array} existingRailroads - Existing railroads array
 * @returns {Object} - { valid, reason, path, cost, lossRate, buildTime }
 */
export function validateRailroad(sourceQ, sourceR, destQ, destR, mapData, existingRailroads = []) {
  const config = GAME_CONFIG.railroad

  // Check same hex
  if (sourceQ === destQ && sourceR === destR) {
    return { valid: false, reason: 'Source and destination must be different' }
  }

  // Check source and destination exist
  const sourceProvince = mapData.getProvince(sourceQ, sourceR)
  const destProvince = mapData.getProvince(destQ, destR)

  if (!sourceProvince) {
    return { valid: false, reason: 'Invalid source location' }
  }
  if (!destProvince) {
    return { valid: false, reason: 'Invalid destination location' }
  }

  // Check ownership - can only build railroads from player's own territory
  if (!isOwnedByPlayer(sourceProvince, GameState.currentPlayerId)) {
    return { valid: false, reason: 'Cannot build from enemy territory' }
  }

  // Check source/dest aren't water
  if (sourceProvince.terrain === 'water') {
    return { valid: false, reason: 'Cannot build from water' }
  }
  if (destProvince.terrain === 'water') {
    return { valid: false, reason: 'Cannot build to water' }
  }

  // Check distance
  const distance = hexDistance(sourceQ, sourceR, destQ, destR)
  if (distance > config.maxDistance) {
    return { valid: false, reason: `Too far (max ${config.maxDistance} tiles)` }
  }

  // Check max railroads from source
  const sourceKey = `${sourceQ},${sourceR}`
  const outgoingCount = existingRailroads.filter(
    r => `${r.sourceQ},${r.sourceR}` === sourceKey
  ).length
  if (outgoingCount >= config.maxRailroadsPerProvince) {
    return { valid: false, reason: `Max ${config.maxRailroadsPerProvince} railroads per province` }
  }

  // Check for duplicate railroad
  const duplicate = existingRailroads.find(
    r => r.sourceQ === sourceQ && r.sourceR === sourceR &&
         r.destQ === destQ && r.destR === destR
  )
  if (duplicate) {
    return { valid: false, reason: 'Railroad already exists' }
  }

  // Calculate path
  const path = getHexLinePath(sourceQ, sourceR, destQ, destR)

  // Check path for water tiles
  for (const hex of path) {
    const province = mapData.getProvince(hex.q, hex.r)
    if (province && province.terrain === 'water') {
      return { valid: false, reason: 'Path crosses water' }
    }
  }

  // Calculate cost
  const cost = calculateRailroadCost(path, mapData)
  if (cost === Infinity) {
    return { valid: false, reason: 'Path crosses impassable terrain' }
  }

  // Calculate loss rate
  const lossRate = calculateRailroadLoss(path, mapData)

  // Calculate build time
  const buildTime = calculateRailroadBuildTime(distance)

  return {
    valid: true,
    path,
    cost,
    lossRate,
    buildTime,
    distance
  }
}

/**
 * Create a new railroad
 * @param {number} sourceQ - Source hex q
 * @param {number} sourceR - Source hex r
 * @param {number} destQ - Destination hex q
 * @param {number} destR - Destination hex r
 * @param {MapData} mapData - Map data
 * @param {Array} existingRailroads - Existing railroads array
 * @returns {Object|null} - Railroad object or null if invalid
 */
export function createRailroad(sourceQ, sourceR, destQ, destR, mapData, existingRailroads = []) {
  const validation = validateRailroad(sourceQ, sourceR, destQ, destR, mapData, existingRailroads)

  if (!validation.valid) {
    console.warn('Cannot create railroad:', validation.reason)
    return null
  }

  return {
    id: generateRailroadId(),
    sourceQ,
    sourceR,
    destQ,
    destR,
    capacity: GAME_CONFIG.railroad.baseCapacity,
    distribution: {},  // { goodId: 0-1 } - percentage of source goods to send
    constructionProgress: validation.buildTime,
    _distance: validation.distance,
    _totalLossRate: validation.lossRate,
    _lossAccumulator: {},  // For fractional loss tracking
    _lastTransportSummary: null  // For UI display
  }
}

/**
 * Check if railroad is operational
 * @param {Object} railroad - Railroad object
 * @returns {boolean}
 */
export function isRailroadOperational(railroad) {
  return railroad && railroad.constructionProgress === 0
}

/**
 * Get available goods at source for transport
 * Returns goods from extractors, building output storage, and transport storage
 * @param {Object} province - Source province
 * @returns {Object} - { goodId: { amount, icon, name, source } }
 */
export function getAvailableGoods(province) {
  const available = {}

  // Get from extractors
  for (const resourceId of province.resources) {
    const extractor = province.extractors[resourceId]
    if (extractor && extractor.storage > 0) {
      const resource = getResource(resourceId)
      available[resourceId] = {
        amount: extractor.storage,
        icon: resource?.icon || '?',
        name: resource?.name || resourceId,
        source: 'extractor'
      }
    }
  }

  // Get from building output storage
  if (province.building && province.building.storage) {
    for (const [goodId, amount] of Object.entries(province.building.storage)) {
      if (amount > 0) {
        const good = getGood(goodId)
        available[goodId] = {
          amount,
          icon: good?.icon || '?',
          name: good?.name || goodId,
          source: 'building'
        }
      }
    }
  }

  // Get from transport storage
  if (province.transportStorage) {
    for (const [itemId, amount] of Object.entries(province.transportStorage)) {
      if (amount > 0) {
        // Could be resource or good
        const resource = getResource(itemId)
        const good = getGood(itemId)
        const icon = resource?.icon || good?.icon || '?'
        const name = resource?.name || good?.name || itemId

        if (available[itemId]) {
          // Add to existing amount
          available[itemId].amount += amount
        } else {
          available[itemId] = {
            amount,
            icon,
            name,
            source: 'transportStorage'
          }
        }
      }
    }
  }

  return available
}

/**
 * Get total transport storage usage for a province
 * @param {Object} province - Province
 * @returns {number} - Total units stored in transport storage
 */
export function getTransportStorageUsed(province) {
  if (!province.transportStorage) return 0
  return Object.values(province.transportStorage).reduce((sum, amt) => sum + amt, 0)
}

/**
 * Get transport storage capacity for a province
 * @param {Object} province - Province
 * @returns {number} - Capacity
 */
export function getTransportStorageCapacity(province) {
  return GAME_CONFIG.railroad?.baseTransportStorageCapacity || 100
}

/**
 * Get storage capacity at destination (uses transport storage)
 * @param {Object} province - Destination province
 * @param {string} goodId - Good/resource ID
 * @returns {Object} - { current, capacity, available }
 */
export function getDestinationCapacity(province, goodId) {
  // All transported goods go to transport storage
  const capacity = getTransportStorageCapacity(province)
  const used = getTransportStorageUsed(province)
  const available = Math.max(0, capacity - used)

  return {
    current: used,
    capacity,
    available
  }
}

/**
 * Withdraw goods from source province
 * @param {Object} province - Source province
 * @param {string} goodId - Good/resource ID
 * @param {number} amount - Amount to withdraw
 * @returns {number} - Actual amount withdrawn
 */
function withdrawFromSource(province, goodId, amount) {
  let remaining = amount
  let totalWithdrawn = 0

  // Check extractors first
  const extractor = province.extractors[goodId]
  if (extractor && extractor.storage > 0 && remaining > 0) {
    const withdrawn = Math.min(remaining, extractor.storage)
    extractor.storage -= withdrawn
    totalWithdrawn += withdrawn
    remaining -= withdrawn
  }

  // Check building storage
  if (remaining > 0 && province.building && province.building.storage[goodId]) {
    const withdrawn = Math.min(remaining, province.building.storage[goodId])
    province.building.storage[goodId] -= withdrawn
    totalWithdrawn += withdrawn
    remaining -= withdrawn
  }

  // Check transport storage
  if (remaining > 0 && province.transportStorage && province.transportStorage[goodId]) {
    const withdrawn = Math.min(remaining, province.transportStorage[goodId])
    province.transportStorage[goodId] -= withdrawn
    if (province.transportStorage[goodId] <= 0) {
      delete province.transportStorage[goodId]
    }
    totalWithdrawn += withdrawn
  }

  return totalWithdrawn
}

/**
 * Check if province has an operational Army HQ
 * @param {Object} province - Province to check
 * @returns {boolean}
 */
function hasOperationalArmyHQ(province) {
  return province.building &&
         province.building.type === 'armyHQ' &&
         province.building.constructionProgress === 0 &&
         province.building.upgradeProgress === 0
}

/**
 * Get Army HQ depot capacity
 * @param {Object} building - HQ building
 * @returns {number}
 */
function getHQDepotCapacity(building) {
  if (!building || building.type !== 'armyHQ') return 0

  const level = building.level || 1
  // Match the upgrade values from buildings.js
  const capacities = { 1: 100, 2: 200, 3: 400, 4: 800 }
  return capacities[level] || 100
}

/**
 * Deposit goods to destination province's transport storage
 * @param {Object} province - Destination province
 * @param {string} goodId - Good/resource ID
 * @param {number} amount - Amount to deposit
 * @returns {number} - Actual amount deposited
 */
function depositToDestination(province, goodId, amount) {
  // Special handling for soldiers going to Army HQ
  if (goodId === 'soldiers' && hasOperationalArmyHQ(province)) {
    return depositToHQDepot(province, amount)
  }

  // All transported goods go to transport storage
  if (!province.transportStorage) {
    province.transportStorage = {}
  }

  const capacity = getTransportStorageCapacity(province)
  const used = getTransportStorageUsed(province)
  const spaceAvailable = Math.max(0, capacity - used)
  const deposited = Math.min(amount, spaceAvailable)

  if (deposited > 0) {
    province.transportStorage[goodId] = (province.transportStorage[goodId] || 0) + deposited
  }

  return deposited
}

/**
 * Deposit soldiers to Army HQ depot
 * @param {Object} province - Province with Army HQ
 * @param {number} amount - Soldiers to deposit
 * @returns {number} - Actual amount deposited
 */
function depositToHQDepot(province, amount) {
  const building = province.building
  if (!building || building.type !== 'armyHQ') return 0

  // Initialize storage if needed
  if (!building.storage) {
    building.storage = { soldiers: 0 }
  }

  const capacity = getHQDepotCapacity(building)
  const current = building.storage.soldiers || 0
  const spaceAvailable = Math.max(0, capacity - current)
  const deposited = Math.min(amount, spaceAvailable)

  if (deposited > 0) {
    building.storage.soldiers = current + deposited
  }

  return deposited
}

/**
 * Process transport for a single railroad
 * @param {Object} railroad - Railroad object
 * @param {MapData} mapData - Map data
 * @param {Object} storageSnapshot - Snapshot of storage at turn start
 * @returns {Object} - Transport summary
 */
export function processRailroadTransport(railroad, mapData, storageSnapshot) {
  const summary = {
    railroadId: railroad.id,
    transported: {},
    blocked: {},
    losses: {}
  }

  if (!isRailroadOperational(railroad)) {
    return summary
  }

  const sourceProvince = mapData.getProvince(railroad.sourceQ, railroad.sourceR)
  const destProvince = mapData.getProvince(railroad.destQ, railroad.destR)

  if (!sourceProvince || !destProvince) {
    return summary
  }

  const sourceKey = `${railroad.sourceQ},${railroad.sourceR}`
  let totalTransported = 0

  // Process each good with distribution > 0
  for (const [goodId, distribution] of Object.entries(railroad.distribution)) {
    if (distribution <= 0) continue

    // Get available from snapshot (prevents multi-hop in one turn)
    const snapshotAvailable = storageSnapshot[sourceKey]?.[goodId] || 0
    if (snapshotAvailable <= 0) continue

    // Calculate amount to send
    const toSend = Math.floor(snapshotAvailable * distribution)
    if (toSend <= 0) continue

    // Cap by remaining capacity
    const capacityRemaining = railroad.capacity - totalTransported
    const cappedAmount = Math.min(toSend, capacityRemaining)
    if (cappedAmount <= 0) {
      summary.blocked[goodId] = { amount: toSend, reason: 'Capacity full' }
      continue
    }

    // Check destination capacity
    const destCapacity = getDestinationCapacity(destProvince, goodId)
    if (destCapacity.available <= 0) {
      summary.blocked[goodId] = { amount: cappedAmount, reason: 'Destination full' }
      continue
    }

    // Only send what fits
    const actualSend = Math.min(cappedAmount, destCapacity.available)

    // Withdraw from source
    const withdrawn = withdrawFromSource(sourceProvince, goodId, actualSend)
    if (withdrawn <= 0) continue

    // Apply losses with fractional accumulation
    const lossRate = railroad._totalLossRate
    const grossLoss = withdrawn * lossRate

    // Initialize accumulator if needed
    if (!railroad._lossAccumulator[goodId]) {
      railroad._lossAccumulator[goodId] = 0
    }

    railroad._lossAccumulator[goodId] += grossLoss
    const wholeLoss = Math.floor(railroad._lossAccumulator[goodId])
    railroad._lossAccumulator[goodId] -= wholeLoss

    const netAmount = withdrawn - wholeLoss

    // Deposit to destination
    const deposited = depositToDestination(destProvince, goodId, netAmount)

    totalTransported += withdrawn

    summary.transported[goodId] = {
      sent: withdrawn,
      received: deposited,
      lost: wholeLoss
    }

    if (wholeLoss > 0) {
      summary.losses[goodId] = wholeLoss
    }
  }

  railroad._lastTransportSummary = summary
  return summary
}

/**
 * Take a snapshot of all province storage for transport processing
 * @param {MapData} mapData - Map data
 * @returns {Object} - { 'q,r': { goodId: amount } }
 */
export function snapshotAllStorage(mapData) {
  const snapshot = {}

  for (const province of mapData.getAllProvinces()) {
    const key = `${province.q},${province.r}`
    snapshot[key] = {}

    // Snapshot extractors
    for (const resourceId of province.resources) {
      const extractor = province.extractors[resourceId]
      if (extractor) {
        snapshot[key][resourceId] = extractor.storage || 0
      }
    }

    // Snapshot building storage
    if (province.building && province.building.storage) {
      for (const [goodId, amount] of Object.entries(province.building.storage)) {
        snapshot[key][goodId] = amount
      }
    }

    // Snapshot transport storage
    if (province.transportStorage) {
      for (const [itemId, amount] of Object.entries(province.transportStorage)) {
        // Add to existing or set new
        snapshot[key][itemId] = (snapshot[key][itemId] || 0) + amount
      }
    }
  }

  return snapshot
}

/**
 * Process construction progress for a railroad
 * @param {Object} railroad - Railroad object
 * @returns {boolean} - True if just completed
 */
export function processRailroadConstruction(railroad) {
  if (railroad.constructionProgress > 0) {
    railroad.constructionProgress--
    return railroad.constructionProgress === 0
  }
  return false
}

/**
 * Delete a railroad
 * @param {Array} railroads - Railroads array
 * @param {string} railroadId - Railroad ID to delete
 * @returns {boolean} - Success
 */
export function deleteRailroad(railroads, railroadId) {
  const index = railroads.findIndex(r => r.id === railroadId)
  if (index === -1) return false
  railroads.splice(index, 1)
  return true
}

/**
 * Get railroads for a province (outgoing and incoming)
 * @param {Array} railroads - All railroads
 * @param {number} q - Province q
 * @param {number} r - Province r
 * @returns {Object} - { outgoing: [], incoming: [] }
 */
export function getRailroadsForProvince(railroads, q, r) {
  const key = `${q},${r}`

  return {
    outgoing: railroads.filter(r => `${r.sourceQ},${r.sourceR}` === key),
    incoming: railroads.filter(r => `${r.destQ},${r.destR}` === key)
  }
}

/**
 * Set distribution for a railroad
 * @param {Object} railroad - Railroad object
 * @param {string} goodId - Good/resource ID
 * @param {number} percent - 0 to 1
 */
export function setRailroadDistribution(railroad, goodId, percent) {
  railroad.distribution[goodId] = Math.max(0, Math.min(1, percent))
}

/**
 * Get railroad summary for UI
 * @param {Object} railroad - Railroad object
 * @param {MapData} mapData - Map data
 * @returns {Object} - Summary info
 */
export function getRailroadSummary(railroad, mapData) {
  const sourceProvince = mapData.getProvince(railroad.sourceQ, railroad.sourceR)
  const destProvince = mapData.getProvince(railroad.destQ, railroad.destR)

  return {
    id: railroad.id,
    sourceQ: railroad.sourceQ,
    sourceR: railroad.sourceR,
    destQ: railroad.destQ,
    destR: railroad.destR,
    sourceName: sourceProvince?.name || 'Unknown',
    destName: destProvince?.name || 'Unknown',
    sourceTerrain: sourceProvince?.terrain || 'unknown',
    destTerrain: destProvince?.terrain || 'unknown',
    capacity: railroad.capacity,
    distance: railroad._distance,
    lossRate: railroad._totalLossRate,
    lossPercent: Math.round(railroad._totalLossRate * 100),
    isOperational: isRailroadOperational(railroad),
    constructionProgress: railroad.constructionProgress,
    distribution: { ...railroad.distribution },
    lastTransport: railroad._lastTransportSummary
  }
}

/**
 * Serialize railroad for save
 * @param {Object} railroad - Railroad object
 * @returns {Object} - Serializable object
 */
export function railroadToJSON(railroad) {
  return {
    id: railroad.id,
    sourceQ: railroad.sourceQ,
    sourceR: railroad.sourceR,
    destQ: railroad.destQ,
    destR: railroad.destR,
    capacity: railroad.capacity,
    distribution: { ...railroad.distribution },
    constructionProgress: railroad.constructionProgress,
    _distance: railroad._distance,
    _totalLossRate: railroad._totalLossRate,
    _lossAccumulator: { ...railroad._lossAccumulator }
  }
}

/**
 * Deserialize railroad from save
 * @param {Object} data - Saved data
 * @returns {Object} - Railroad object
 */
export function railroadFromJSON(data) {
  return {
    id: data.id,
    sourceQ: data.sourceQ,
    sourceR: data.sourceR,
    destQ: data.destQ,
    destR: data.destR,
    capacity: data.capacity || GAME_CONFIG.railroad.baseCapacity,
    distribution: data.distribution || {},
    constructionProgress: data.constructionProgress || 0,
    _distance: data._distance || 0,
    _totalLossRate: data._totalLossRate || 0,
    _lossAccumulator: data._lossAccumulator || {},
    _lastTransportSummary: null
  }
}
