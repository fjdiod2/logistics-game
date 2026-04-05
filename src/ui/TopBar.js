// Top Bar UI controller
// Displays global game stats and controls

import { GameState } from '../systems/GameState.js'

export class TopBar {
  constructor() {
    this.elements = {
      treasury: document.getElementById('stat-treasury'),
      population: document.getElementById('stat-population'),
      soldiers: document.getElementById('stat-soldiers'),
      turn: document.getElementById('stat-turn'),
      nextTurnBtn: document.getElementById('btn-next-turn')
    }

    this.onNextTurn = null
    this.setupEventListeners()
  }

  setupEventListeners() {
    this.elements.nextTurnBtn?.addEventListener('click', () => {
      console.log('Play/Pause clicked, paused:', GameState.paused)
      GameState.togglePause()
      this.updatePauseButton()
    })

    // Listen for game state changes
    GameState.on('turnProcessed', () => this.update())
    GameState.on('treasuryChanged', () => this.updateTreasury())
    GameState.on('soldiersChanged', () => this.updateSoldiers())

    // Listen for pause/resume events
    GameState.on('paused', () => this.updatePauseButton())
    GameState.on('resumed', () => this.updatePauseButton())
  }

  // Set callback for next turn button (kept for compatibility)
  setNextTurnCallback(callback) {
    this.onNextTurn = callback
  }

  // Update pause/play button text
  updatePauseButton() {
    if (this.elements.nextTurnBtn) {
      if (GameState.paused) {
        this.elements.nextTurnBtn.textContent = '▶ Play'
        this.elements.nextTurnBtn.classList.remove('playing')
      } else {
        this.elements.nextTurnBtn.textContent = '⏸ Pause'
        this.elements.nextTurnBtn.classList.add('playing')
      }
    }
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
