// Global Game State Manager
// Singleton that tracks global resources, treasury, and turn count

import { GAME_CONFIG } from '../data/gameConfig.js'
import { processTurn } from './Economy.js'
import { railroadToJSON, railroadFromJSON } from './Railroad.js'

class GameStateManager {
  constructor() {
    this.reset()
    this._listeners = new Map()
  }

  /**
   * Reset game state to initial values
   */
  reset() {
    this.turn = 1
    this.treasury = GAME_CONFIG.startingTreasury
    this.totalSoldiers = 0
    this.soldiersByProvince = {}  // { 'q,r': count }

    // Current player ID (0 = human player)
    this.currentPlayerId = 0

    // Global goods inventory (moved from provinces)
    this.goods = { ...GAME_CONFIG.startingGoods }

    // Global resources inventory (moved from extractors)
    this.resources = {}

    // Railroads array
    this.railroads = []

    // Statistics tracking
    this.stats = {
      totalTaxesCollected: 0,
      totalSoldiersRecruited: 0,
      totalGoodsProduced: {},
      turnsPlayed: 0
    }

    // Reference to map (set externally)
    this.mapData = null

    // Last turn summary
    this.lastTurnSummary = null

    // Timer control for real-time mode
    this.paused = true
    this.timerHandle = null
  }

  /**
   * Initialize with map data
   * @param {MapData} mapData
   */
  init(mapData) {
    this.mapData = mapData
    this.emit('init', { mapData })
  }

  /**
   * Start the game loop (begins paused)
   */
  start() {
    // Game starts paused, user must click Play
    this.paused = true
    this.emit('paused', { paused: true })
  }

  /**
   * Pause the game loop
   */
  pause() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle)
      this.timerHandle = null
    }
    this.paused = true
    this.emit('paused', { paused: true })
  }

  /**
   * Resume the game loop
   */
  resume() {
    if (this.paused && GAME_CONFIG.turnDurationMs > 0) {
      this.paused = false
      this.timerHandle = setInterval(() => {
        this.nextTurn()
      }, GAME_CONFIG.turnDurationMs)
      this.emit('resumed', { paused: false })
    }
  }

  /**
   * Toggle pause/resume
   * @returns {boolean} - New paused state
   */
  togglePause() {
    console.log('togglePause called, current paused:', this.paused)
    if (this.paused) {
      this.resume()
    } else {
      this.pause()
    }
    console.log('togglePause done, new paused:', this.paused)
    return this.paused
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, [])
    }
    this._listeners.get(event).push(callback)
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (!this._listeners.has(event)) return
    const listeners = this._listeners.get(event)
    const index = listeners.indexOf(callback)
    if (index > -1) {
      listeners.splice(index, 1)
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this._listeners.has(event)) return
    for (const callback of this._listeners.get(event)) {
      callback(data)
    }
  }

  /**
   * Process next turn
   * @returns {Object} - Turn summary
   */
  nextTurn() {
    if (!this.mapData) {
      console.error('GameState not initialized with map data')
      return null
    }

    const summary = processTurn(this.mapData, this)

    // Update statistics
    this.stats.totalTaxesCollected += summary.totalTaxes
    this.stats.totalSoldiersRecruited += summary.totalSoldiersRecruited
    this.stats.turnsPlayed++

    for (const [good, amount] of Object.entries(summary.totalGoodsProduced)) {
      this.stats.totalGoodsProduced[good] =
        (this.stats.totalGoodsProduced[good] || 0) + amount
    }

    this.lastTurnSummary = summary
    this.emit('turnProcessed', summary)

    return summary
  }

  /**
   * Add gold to treasury
   * @param {number} amount
   */
  addGold(amount) {
    this.treasury += amount
    this.emit('treasuryChanged', { treasury: this.treasury, change: amount })
  }

  /**
   * Spend gold from treasury
   * @param {number} amount
   * @returns {boolean} - Success (false if not enough gold)
   */
  spendGold(amount) {
    if (this.treasury < amount) return false
    this.treasury -= amount
    this.emit('treasuryChanged', { treasury: this.treasury, change: -amount })
    return true
  }

  /**
   * Check if can afford amount
   * @param {number} amount
   * @returns {boolean}
   */
  canAfford(amount) {
    return this.treasury >= amount
  }

  /**
   * Add resources to global storage
   * @param {string} resourceId
   * @param {number} amount
   */
  addResource(resourceId, amount) {
    this.resources[resourceId] = (this.resources[resourceId] || 0) + amount
    this.emit('resourcesChanged', { resources: this.resources })
  }

  /**
   * Add goods to global storage
   * @param {string} goodId
   * @param {number} amount
   */
  addGoods(goodId, amount) {
    this.goods[goodId] = (this.goods[goodId] || 0) + amount
    this.emit('goodsChanged', { goods: this.goods })
  }

  /**
   * Get resource amount
   * @param {string} resourceId
   * @returns {number}
   */
  getResource(resourceId) {
    return this.resources[resourceId] || 0
  }

  /**
   * Get goods amount
   * @param {string} goodId
   * @returns {number}
   */
  getGoods(goodId) {
    return this.goods[goodId] || 0
  }

  /**
   * Add soldiers
   * @param {string} provinceKey - Province 'q,r' key
   * @param {number} count
   */
  addSoldiers(provinceKey, count) {
    this.soldiersByProvince[provinceKey] =
      (this.soldiersByProvince[provinceKey] || 0) + count
    this.totalSoldiers += count
    this.emit('soldiersChanged', {
      total: this.totalSoldiers,
      byProvince: this.soldiersByProvince
    })
  }

  /**
   * Check if a province belongs to the current player
   * @param {Object} province - Province object
   * @returns {boolean}
   */
  isPlayerProvince(province) {
    return province && province.playerId === this.currentPlayerId
  }

  /**
   * Get global summary for UI
   * @returns {Object}
   */
  getSummary() {
    const totalPopulation = this.mapData?.getTotalPopulation() || 0

    return {
      turn: this.turn,
      treasury: this.treasury,
      totalPopulation,
      totalSoldiers: this.totalSoldiers,
      resources: { ...this.resources },
      goods: { ...this.goods },
      stats: { ...this.stats },
      lastTurnSummary: this.lastTurnSummary
    }
  }

  /**
   * Export game state to JSON (for saving)
   * @returns {Object}
   */
  toJSON() {
    return {
      turn: this.turn,
      treasury: this.treasury,
      totalSoldiers: this.totalSoldiers,
      soldiersByProvince: { ...this.soldiersByProvince },
      goods: { ...this.goods },
      resources: { ...this.resources },
      stats: { ...this.stats },
      railroads: this.railroads.map(r => railroadToJSON(r)),
      mapData: this.mapData?.toJSON() || null
    }
  }

  /**
   * Load game state from JSON
   * @param {Object} data
   * @param {MapData} MapDataClass - MapData constructor for recreation
   */
  fromJSON(data, MapDataClass) {
    this.turn = data.turn || 1
    this.treasury = data.treasury || GAME_CONFIG.startingTreasury
    this.totalSoldiers = data.totalSoldiers || 0
    this.soldiersByProvince = data.soldiersByProvince || {}
    this.goods = data.goods || {}
    this.resources = data.resources || {}
    this.stats = data.stats || {
      totalTaxesCollected: 0,
      totalSoldiersRecruited: 0,
      totalGoodsProduced: {},
      turnsPlayed: 0
    }
    this.railroads = (data.railroads || []).map(r => railroadFromJSON(r))

    if (data.mapData && MapDataClass) {
      this.mapData = MapDataClass.fromJSON(data.mapData)
    }

    this.emit('loaded', this.getSummary())
  }
}

// Singleton instance
export const GameState = new GameStateManager()

// Also export class for testing
export { GameStateManager }
