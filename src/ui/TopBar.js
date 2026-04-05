// Top Bar UI controller
// Displays global game stats and controls

import { GameState } from '../systems/GameState.js'
import { GAME_CONFIG } from '../data/gameConfig.js'

export class TopBar {
  constructor() {
    this.elements = {
      treasury: document.getElementById('stat-treasury'),
      population: document.getElementById('stat-population'),
      soldiers: document.getElementById('stat-soldiers'),
      turn: document.getElementById('stat-turn'),
      speedControls: document.getElementById('speed-controls')
    }

    this.speedButtons = []
    this.onNextTurn = null
    this.setupSpeedButtons()
    this.setupEventListeners()
  }

  setupSpeedButtons() {
    const container = this.elements.speedControls
    if (!container) return

    const speedOptions = GAME_CONFIG.speedOptions || []

    speedOptions.forEach((option, index) => {
      const btn = document.createElement('button')
      btn.className = 'btn-speed'
      btn.textContent = option.label
      btn.dataset.speedIndex = index
      btn.addEventListener('click', () => {
        GameState.setSpeed(index)
      })
      container.appendChild(btn)
      this.speedButtons.push(btn)
    })

    // Set initial state
    this.updateSpeedButtons()
  }

  setupEventListeners() {
    // Listen for game state changes
    GameState.on('turnProcessed', () => this.update())
    GameState.on('treasuryChanged', () => this.updateTreasury())
    GameState.on('soldiersChanged', () => this.updateSoldiers())

    // Listen for speed change events
    GameState.on('speedChanged', () => this.updateSpeedButtons())
  }

  // Set callback for next turn button (kept for compatibility)
  setNextTurnCallback(callback) {
    this.onNextTurn = callback
  }

  // Update speed button states
  updateSpeedButtons() {
    const currentSpeed = GameState.getSpeed()
    this.speedButtons.forEach((btn, index) => {
      if (index === currentSpeed) {
        btn.classList.add('active')
      } else {
        btn.classList.remove('active')
      }
    })
  }

  // Update all stats
  update() {
    this.updateTreasury()
    this.updatePopulation()
    this.updateSoldiers()
    this.updateTurn()
  }

  updateTreasury() {
    if (this.elements.treasury) {
      const treasury = GameState.treasury
      this.elements.treasury.textContent = `${treasury.toLocaleString()} 💰`
    }
  }

  updatePopulation() {
    if (this.elements.population) {
      const pop = GameState.mapData?.getTotalPopulation() || 0
      this.elements.population.textContent = pop.toLocaleString()
    }
  }

  updateSoldiers() {
    if (this.elements.soldiers) {
      this.elements.soldiers.textContent = GameState.totalSoldiers.toLocaleString()
    }
  }

  updateTurn() {
    if (this.elements.turn) {
      this.elements.turn.textContent = GameState.turn
    }
  }

  // Show turn summary notification (optional)
  showTurnSummary(summary) {
    // Could add a toast notification here
    console.log('Turn Summary:', summary)
  }
}
