// Build Menu UI component
// Modal for selecting buildings to construct

import { BUILDING_TYPES, getBuildingType, getRecipesForBuilding, GOODS } from '../data/buildings.js'
import { getBuildCost } from '../systems/Building.js'
import { GameState } from '../systems/GameState.js'
import { getResource } from '../data/resources.js'

export class BuildMenu {
  constructor() {
    this.modal = document.getElementById('build-modal')
    this.optionsContainer = document.getElementById('build-options')
    this.currentProvince = null
    this.buildCallback = null
    this.recipeSelectCallback = null
    this.mode = 'build'  // 'build' or 'recipe'

    this.setupEventListeners()
  }

  setupEventListeners() {
    // Cancel button
    const cancelBtn = this.modal.querySelector('.btn-cancel')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hide())
    }

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide()
      }
    })

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.hide()
      }
    })
  }

  /**
   * Show the build menu for a province
   * @param {Object} province - Province data
   */
  show(province) {
    this.currentProvince = province
    this.mode = 'build'
    this.render()
    this.modal.classList.remove('hidden')
  }

  /**
   * Show recipe selection for an existing factory
   * @param {Object} province - Province data with a factory building
   */
  showRecipeSelection(province) {
    this.currentProvince = province
    this.mode = 'recipe'
    this.renderRecipeSelection('factory')
    this.modal.classList.remove('hidden')
  }

  /**
   * Hide the build menu
   */
  hide() {
    this.modal.classList.add('hidden')
    this.currentProvince = null
    this.mode = 'build'
  }

  /**
   * Set callback for when a building is selected
   * @param {Function} callback - ({ province, buildingType }) => void
   */
  onBuild(callback) {
    this.buildCallback = callback
  }

  /**
   * Set callback for when a recipe is selected (for existing factory)
   * @param {Function} callback - ({ province, recipe }) => void
   */
  onRecipeSelect(callback) {
    this.recipeSelectCallback = callback
  }

  /**
   * Render building options
   */
  render() {
    const options = Object.values(BUILDING_TYPES).map(type => {
      const cost = getBuildCost(type.id)
      const canAfford = GameState.canAfford(cost)

      return `
        <div class="build-option ${canAfford ? '' : 'disabled'}" data-building="${type.id}">
          <div class="build-option-icon">${type.icon}</div>
          <div class="build-option-info">
            <div class="build-option-name">${type.name}</div>
            <div class="build-option-desc">${type.description}</div>
            <div class="build-option-cost ${canAfford ? '' : 'cannot-afford'}">
              ${cost} 💰 ${canAfford ? '' : '(Not enough gold)'}
            </div>
          </div>
        </div>
      `
    }).join('')

    this.optionsContainer.innerHTML = options

    // Attach click listeners to options - build immediately without recipe selection
    this.optionsContainer.querySelectorAll('.build-option:not(.disabled)').forEach(el => {
      el.addEventListener('click', () => {
        const buildingType = el.dataset.building

        if (this.buildCallback && this.currentProvince) {
          this.buildCallback({
            province: this.currentProvince,
            buildingType
          })
        }
      })
    })
  }

  /**
   * Format an input/output item for display
   */
  formatItem(item) {
    if (item.resource) {
      const res = getResource(item.resource)
      return `${res?.icon || '?'} ${item.amount} ${res?.name || item.resource}`
    } else if (item.good) {
      const good = GOODS[item.good]
      return `${good?.icon || '?'} ${item.amount} ${good?.name || item.good}`
    }
    return `${item.amount} ???`
  }

  /**
   * Render recipe selection for a building type
   */
  renderRecipeSelection(buildingType) {
    const recipes = getRecipesForBuilding(buildingType)
    const buildingInfo = getBuildingType(buildingType)

    const headerText = this.mode === 'recipe'
      ? `Select Recipe for ${buildingInfo.icon} ${buildingInfo.name}`
      : `Select Recipe for ${buildingInfo.icon} ${buildingInfo.name}`

    const header = `
      <div class="recipe-selection-header">
        <span>🏭 ${headerText}</span>
      </div>
    `

    const options = recipes.map(recipe => {
      const inputs = recipe.inputs.map(i => this.formatItem(i)).join(' + ')
      const outputs = recipe.outputs.map(o => this.formatItem(o)).join(' + ')

      return `
        <div class="build-option recipe-option" data-recipe="${recipe.id}">
          <div class="build-option-icon">${recipe.outputs[0]?.good ? (GOODS[recipe.outputs[0].good]?.icon || '?') : '?'}</div>
          <div class="build-option-info">
            <div class="build-option-name">${recipe.name}</div>
            <div class="build-option-desc recipe-formula">
              ${inputs} → ${outputs}
            </div>
            <div class="build-option-time">
              Production time: ${recipe.productionTime} turn(s)
            </div>
          </div>
        </div>
      `
    }).join('')

    this.optionsContainer.innerHTML = header + options

    // Recipe option handlers
    this.optionsContainer.querySelectorAll('.recipe-option').forEach(el => {
      el.addEventListener('click', () => {
        const recipe = el.dataset.recipe
        if (this.mode === 'recipe') {
          // Selecting recipe for existing factory
          if (this.recipeSelectCallback && this.currentProvince) {
            this.recipeSelectCallback({
              province: this.currentProvince,
              recipe
            })
          }
        } else {
          // Building new factory with recipe (legacy, shouldn't happen now)
          if (this.buildCallback && this.currentProvince) {
            this.buildCallback({
              province: this.currentProvince,
              buildingType,
              recipe
            })
          }
        }
      })
    })
  }
}
