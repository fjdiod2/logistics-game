// Railroad Builder UI
// Handles drag-to-build interaction for railroads

import { validateRailroad, createRailroad } from '../systems/Railroad.js'
import { GameState } from '../systems/GameState.js'
import { axialToPixel, pixelToAxial, hexDistance } from '../utils/hexUtils.js'
import { isOwnedByPlayer } from '../systems/Ownership.js'

export class RailroadBuilder {
  constructor() {
    this.active = false
    this.sourceHex = null
    this.currentHex = null
    this.previewData = null
    this.mapScene = null
    this.mapData = null

    this._onConfirmCallback = null
    this._onCancelCallback = null
  }

  /**
   * Set the map scene reference for rendering
   */
  setMapScene(mapScene) {
    this.mapScene = mapScene
    this.mapData = mapScene.mapData
  }

  /**
   * Start building mode from a source hex
   * @param {number} sourceQ
   * @param {number} sourceR
   */
  startBuild(sourceQ, sourceR) {
    if (!this.mapData) {
      console.warn('RailroadBuilder: No map data set')
      return false
    }

    const sourceProvince = this.mapData.getProvince(sourceQ, sourceR)
    if (!sourceProvince) {
      return false
    }

    if (sourceProvince.terrain === 'water') {
      return false
    }

    // Check ownership - can only build from player's own territory
    if (!isOwnedByPlayer(sourceProvince, GameState.currentPlayerId)) {
      console.warn('RailroadBuilder: Cannot build from enemy territory')
      return false
    }

    this.active = true
    this.sourceHex = { q: sourceQ, r: sourceR }
    this.currentHex = null
    this.previewData = null

    return true
  }

  /**
   * Update preview during drag
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   */
  updatePreview(worldX, worldY) {
    if (!this.active) return null

    const hex = pixelToAxial(worldX, worldY)
    const province = this.mapData.getProvince(hex.q, hex.r)

    // Only update if hex changed
    if (this.currentHex && this.currentHex.q === hex.q && this.currentHex.r === hex.r) {
      return this.previewData
    }

    this.currentHex = { q: hex.q, r: hex.r }

    // Validate and calculate preview
    if (!province || (hex.q === this.sourceHex.q && hex.r === this.sourceHex.r)) {
      this.previewData = {
        valid: false,
        reason: 'Select a destination',
        sourceHex: this.sourceHex,
        destHex: hex
      }
      return this.previewData
    }

    const validation = validateRailroad(
      this.sourceHex.q,
      this.sourceHex.r,
      hex.q,
      hex.r,
      this.mapData,
      GameState.railroads || []
    )

    const canAfford = validation.valid ? GameState.canAfford(validation.cost) : false

    this.previewData = {
      valid: validation.valid && canAfford,
      reason: validation.valid ? (canAfford ? null : 'Cannot afford') : validation.reason,
      sourceHex: this.sourceHex,
      destHex: hex,
      path: validation.path,
      cost: validation.cost,
      lossRate: validation.lossRate,
      lossPercent: validation.lossRate ? Math.round(validation.lossRate * 100) : 0,
      buildTime: validation.buildTime,
      distance: validation.distance || hexDistance(this.sourceHex.q, this.sourceHex.r, hex.q, hex.r),
      destProvince: province
    }

    return this.previewData
  }

  /**
   * Finish building (mouse release)
   * @returns {Object|null} - Build data or null if cancelled
   */
  finishBuild() {
    if (!this.active || !this.previewData) {
      this.cancel()
      return null
    }

    if (!this.previewData.valid) {
      this.cancel()
      return null
    }

    const buildData = { ...this.previewData }
    return buildData
  }

  /**
   * Confirm build after user approval
   * @param {Object} buildData - Data from finishBuild
   * @returns {Object|null} - Created railroad or null
   */
  confirmBuild(buildData) {
    if (!buildData || !buildData.valid) return null

    // Spend gold
    if (!GameState.spendGold(buildData.cost)) {
      console.warn('RailroadBuilder: Cannot afford railroad')
      return null
    }

    // Create railroad
    const railroad = createRailroad(
      buildData.sourceHex.q,
      buildData.sourceHex.r,
      buildData.destHex.q,
      buildData.destHex.r,
      this.mapData,
      GameState.railroads || []
    )

    if (!railroad) {
      // Refund
      GameState.addGold(buildData.cost)
      return null
    }

    // Add to game state
    if (!GameState.railroads) {
      GameState.railroads = []
    }
    GameState.railroads.push(railroad)

    this.reset()
    return railroad
  }

  /**
   * Cancel build mode
   */
  cancel() {
    this.reset()
    this._onCancelCallback?.()
  }

  /**
   * Reset builder state
   */
  reset() {
    this.active = false
    this.sourceHex = null
    this.currentHex = null
    this.previewData = null
  }

  /**
   * Check if builder is active
   */
  isActive() {
    return this.active
  }

  /**
   * Get current preview data
   */
  getPreviewData() {
    return this.previewData
  }

  /**
   * Set confirm callback
   */
  onConfirm(callback) {
    this._onConfirmCallback = callback
  }

  /**
   * Set cancel callback
   */
  onCancel(callback) {
    this._onCancelCallback = callback
  }
}

// Singleton instance
export const railroadBuilder = new RailroadBuilder()
