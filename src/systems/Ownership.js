// Ownership system
// Handles player ownership of provinces and visibility rules

import { GAME_CONFIG } from '../data/gameConfig.js'

/**
 * Create an ownership mask function based on mode
 * @param {string} mode - 'horizontal', 'vertical', or 'custom'
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {Function} customMask - Custom mask function (for 'custom' mode)
 * @returns {Function} - Mask function (q, r) => playerId
 */
export function createOwnershipMask(mode, width, height, customMask = null) {
  if (mode === 'custom' && customMask) {
    return customMask
  }

  if (mode === 'vertical') {
    // Left half = human (0), right half = AI (1)
    // For hex grids, we use q + Math.floor(r / 2) as the "column"
    const midCol = Math.floor(width / 2)
    return (q, r) => {
      const col = q + Math.floor(r / 2)
      return col < midCol ? 0 : 1
    }
  }

  // Default: horizontal split
  // Top half = AI (1), bottom half = human (0)
  // Row 0 is at TOP, so r < height/2 means top rows = AI
  const midRow = Math.floor(height / 2)
  return (q, r) => r < midRow ? 1 : 0
}

/**
 * Check if a province is owned by a specific player
 * @param {Object} province - Province object
 * @param {number} playerId - Player ID to check
 * @returns {boolean}
 */
export function isOwnedByPlayer(province, playerId) {
  return province && province.playerId === playerId
}

/**
 * Check if the current player can interact with a province
 * @param {Object} province - Province object
 * @param {number} currentPlayerId - Current player's ID
 * @returns {boolean}
 */
export function canPlayerInteract(province, currentPlayerId) {
  return isOwnedByPlayer(province, currentPlayerId)
}

/**
 * Get a rough population estimate for fog of war display
 * Returns ranges like "~100-500", "~1K-5K", etc.
 * @param {number} population - Actual population
 * @returns {string} - Approximate population string
 */
export function getPopulationEstimate(population) {
  if (population < 50) return '~10-50'
  if (population < 100) return '~50-100'
  if (population < 500) return '~100-500'
  if (population < 1000) return '~500-1K'
  if (population < 5000) return '~1K-5K'
  if (population < 10000) return '~5K-10K'
  if (population < 50000) return '~10K-50K'
  return '~50K+'
}

/**
 * Apply ownership mask to all provinces in a map
 * @param {MapData} mapData - Map data object
 * @param {Function} maskFn - Ownership mask function (q, r) => playerId
 */
export function applyOwnershipToMap(mapData, maskFn) {
  for (const province of mapData.getAllProvinces()) {
    province.playerId = maskFn(province.q, province.r)
  }
}

/**
 * Get ownership config with defaults
 * @returns {Object} - Ownership configuration
 */
export function getOwnershipConfig() {
  return GAME_CONFIG.ownership || {
    defaultSplit: 'horizontal',
    humanPlayerId: 0,
    aiPlayerId: 1
  }
}
