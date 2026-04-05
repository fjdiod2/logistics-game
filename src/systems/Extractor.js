// Extractor system
// Handles resource extraction from provinces

import { getResource } from '../data/resources.js'
import { GAME_CONFIG } from '../data/gameConfig.js'

/**
 * Calculate extraction output for a province's extractor
 * @param {Object} province - The province data
 * @param {string} resourceId - The resource being extracted
 * @returns {Object} - { produced, stored, atCapacity, realRate }
 */
export function calculateExtraction(province, resourceId) {
  const extractor = province.extractors[resourceId]
  if (!extractor) {
    return { produced: 0, stored: 0, atCapacity: false, realRate: 0 }
  }

  const resource = getResource(resourceId)
  if (!resource) {
    return { produced: 0, stored: 0, atCapacity: false, realRate: 0 }
  }

  // Get worker allocation for extraction
  const workerPercent = province.workerAllocation.extractor || 0

  // Calculate effective workers (capped)
  const maxWorkers = GAME_CONFIG.extractorMaxWorkerPercent
  const effectiveWorkers = Math.min(workerPercent, maxWorkers)

  // Base output from config, modified by resource yield
  const baseOutput = GAME_CONFIG.extractorBaseOutput
  const resourceYield = resource.baseYield || 1

  // Calculate real rate (fractional, before flooring)
  const realRate = baseOutput * resourceYield * effectiveWorkers

  // Check capacity
  const currentStorage = extractor.storage || 0
  const capacity = extractor.capacity || GAME_CONFIG.extractorOutputCapacity
  const spaceAvailable = capacity - currentStorage

  // For display purposes, show what would be produced this turn (integer)
  const produced = Math.min(Math.floor(realRate), spaceAvailable)

  return {
    produced,
    realRate,  // Actual fractional rate for UI display
    potentialProduction: realRate,
    stored: currentStorage,
    capacity,
    atCapacity: currentStorage >= capacity,
    workerPercent: effectiveWorkers
  }
}

/**
 * Process extraction for a province (called each turn)
 * Uses fractional accumulation to handle small production rates
 * @param {Object} province - The province data (will be mutated)
 * @returns {Object} - Summary of extraction results
 */
export function processExtraction(province) {
  const results = {}

  for (const resourceId of province.resources) {
    const extractor = province.extractors[resourceId]
    if (!extractor) continue

    const calc = calculateExtraction(province, resourceId)

    // Accumulate fractional production
    extractor.productionProgress = (extractor.productionProgress || 0) + calc.realRate

    // Produce whole units when threshold crossed
    const wholeUnits = Math.floor(extractor.productionProgress)
    let actualProduced = 0

    if (wholeUnits > 0) {
      extractor.productionProgress -= wholeUnits

      // Check capacity
      const currentStorage = extractor.storage || 0
      const capacity = extractor.capacity || GAME_CONFIG.extractorOutputCapacity
      const spaceAvailable = capacity - currentStorage

      actualProduced = Math.min(wholeUnits, spaceAvailable)
      extractor.storage = currentStorage + actualProduced
    }

    results[resourceId] = {
      produced: actualProduced,
      realRate: calc.realRate,
      stored: extractor.storage,
      atCapacity: extractor.storage >= (extractor.capacity || GAME_CONFIG.extractorOutputCapacity)
    }
  }

  return results
}

/**
 * Withdraw resources from extractor storage
 * @param {Object} province - The province data
 * @param {string} resourceId - The resource to withdraw
 * @param {number} amount - Amount to withdraw
 * @returns {number} - Actual amount withdrawn
 */
export function withdrawFromExtractor(province, resourceId, amount) {
  const extractor = province.extractors[resourceId]
  if (!extractor) return 0

  const available = extractor.storage || 0
  const withdrawn = Math.min(amount, available)
  extractor.storage = available - withdrawn

  return withdrawn
}

/**
 * Get total extraction capacity info for a province
 * @param {Object} province - The province data
 * @returns {Object} - Summary of all extractors
 */
export function getExtractionSummary(province) {
  const summary = {
    extractors: [],
    totalStored: 0,
    totalCapacity: 0,
    hasResources: province.resources.length > 0
  }

  for (const resourceId of province.resources) {
    const extractor = province.extractors[resourceId]
    if (!extractor) continue

    const resource = getResource(resourceId)
    const calc = calculateExtraction(province, resourceId)

    summary.extractors.push({
      resourceId,
      resourceName: resource?.name || resourceId,
      resourceIcon: resource?.icon || '?',
      ...calc
    })

    summary.totalStored += extractor.storage || 0
    summary.totalCapacity += extractor.capacity || GAME_CONFIG.extractorOutputCapacity
  }

  return summary
}
