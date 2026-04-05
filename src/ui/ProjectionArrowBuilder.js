// Projection Arrow Builder UI
// Handles arrow placement for Army HQ force projection

import { GameState } from '../systems/GameState.js'
import { pixelToAxial, hexDistance } from '../utils/hexUtils.js'
import {
  calculateFront,
  calculateDistribution,
  getProjectionRadius,
  getDepotSoldiers,
  setProjectionTarget,
  initializeHQState
} from '../systems/ArmyHQ.js'
import { GAME_CONFIG } from '../data/gameConfig.js'

export class ProjectionArrowBuilder {
  constructor() {
    this.active = false
    this.hqProvince = null
    this.targetHex = null
    this.width = 0.5
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
   * Start projection arrow placement from an HQ province
   * @param {Object} hqProvince - Province with Army HQ
   */
  startBuild(hqProvince) {
    if (!this.mapData) {
      console.warn('ProjectionArrowBuilder: No map data set')
      return false
    }

    if (!hqProvince.building || hqProvince.building.type !== 'armyHQ') {
      console.warn('ProjectionArrowBuilder: Province has no Army HQ')
      return false
    }

    initializeHQState(hqProvince.building)

    this.active = true
    this.hqProvince = hqProvince
    this.targetHex = null
    this.width = hqProvince.building.projection?.width || 0.5
    this.previewData = null

    return true
  }

  /**
   * Update preview during mouse move
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   */
  updatePreview(worldX, worldY) {
    if (!this.active || !this.hqProvince) return null

    const hex = pixelToAxial(worldX, worldY)
    const province = this.mapData.getProvince(hex.q, hex.r)

    // Only update if hex changed
    if (this.targetHex && this.targetHex.q === hex.q && this.targetHex.r === hex.r) {
      // Width might have changed, recalculate distribution
      return this.recalculatePreview()
    }

    this.targetHex = { q: hex.q, r: hex.r }
    return this.recalculatePreview()
  }

  /**
   * Recalculate preview with current target and width
   */
  recalculatePreview() {
    if (!this.active || !this.hqProvince || !this.targetHex) {
      return null
    }

    const building = this.hqProvince.building
    const radius = getProjectionRadius(building)
    const soldiers = getDepotSoldiers(building)
    const maxDeploy = Math.min(soldiers, GAME_CONFIG.armyHQ.maxDeploymentPerTurn)

    // Calculate front tiles
    const front = calculateFront(this.hqProvince, this.mapData)

    // Check if target is within range
    const distToTarget = hexDistance(
      this.hqProvince.q, this.hqProvince.r,
      this.targetHex.q, this.targetHex.r
    )

    const inRange = distToTarget <= radius && distToTarget > 0

    // Calculate distribution
    let distribution = []
    if (front.length > 0 && maxDeploy > 0) {
      distribution = calculateDistribution(
        front,
        this.targetHex.q,
        this.targetHex.r,
        this.width,
        maxDeploy
      )
    }

    this.previewData = {
      valid: front.length > 0,
      reason: front.length === 0 ? 'No enemies in range' : null,
      hqProvince: this.hqProvince,
      targetHex: this.targetHex,
      width: this.width,
      radius,
      soldiers,
      maxDeploy,
      front,
      distribution,
      inRange
    }

    return this.previewData
  }

  /**
   * Adjust width using mouse wheel
   * @param {number} delta - Wheel delta (positive = wider, negative = narrower)
   */
  adjustWidth(delta) {
    if (!this.active) return

    const step = 0.1
    if (delta > 0) {
      this.width = Math.min(1, this.width + step)
    } else {
      this.width = Math.max(0, this.width - step)
    }

    // Recalculate preview with new width
    if (this.targetHex) {
      this.recalculatePreview()
    }
  }

  /**
   * Set width directly
   * @param {number} width - Width value 0-1
   */
  setWidth(width) {
    this.width = Math.max(0, Math.min(1, width))
    if (this.active && this.targetHex) {
      this.recalculatePreview()
    }
  }

  /**
   * Finish building (mouse click to confirm)
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
   * Confirm and apply projection settings
   * @param {Object} buildData - Data from finishBuild
   * @returns {boolean} - Success
   */
  confirmBuild(buildData) {
    if (!buildData || !buildData.valid) return false

    const building = buildData.hqProvince.building
    setProjectionTarget(
      building,
      buildData.targetHex.q,
      buildData.targetHex.r,
      buildData.width
    )

    this.reset()
    return true
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
    this.hqProvince = null
    this.targetHex = null
    this.width = 0.5
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
export const projectionArrowBuilder = new ProjectionArrowBuilder()
