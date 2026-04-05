import Phaser from 'phaser'
import { MapScene } from './scenes/MapScene.js'
import { InfoPanel } from './ui/InfoPanel.js'
import { TopBar } from './ui/TopBar.js'
import { BuildMenu } from './ui/BuildMenu.js'
import { GameState } from './systems/GameState.js'
import { createBuilding, getBuildCost } from './systems/Building.js'
import { railroadBuilder } from './ui/RailroadBuilder.js'

function getMapContainerSize() {
  const container = document.getElementById('map-container')
  return {
    width: container.clientWidth,
    height: container.clientHeight
  }
}

/**
 * Show railroad build confirmation modal
 */
function showRailroadConfirmModal(buildData, callback) {
  const modal = document.getElementById('build-modal')
  const optionsContainer = document.getElementById('build-options')
  const modalTitle = modal.querySelector('h3')
  const cancelBtn = modal.querySelector('.btn-cancel')

  modalTitle.textContent = 'Build Railroad'

  const sourceText = `(${buildData.sourceHex.q}, ${buildData.sourceHex.r})`
  const destText = `(${buildData.destHex.q}, ${buildData.destHex.r}) ${buildData.destProvince?.name || ''}`

  optionsContainer.innerHTML = `
    <div class="railroad-confirm">
      <div class="railroad-confirm-info">
        <div class="railroad-confirm-row">
          <span class="railroad-confirm-label">From:</span>
          <span class="railroad-confirm-value">${sourceText}</span>
        </div>
        <div class="railroad-confirm-row">
          <span class="railroad-confirm-label">To:</span>
          <span class="railroad-confirm-value">${destText}</span>
        </div>
        <div class="railroad-confirm-row">
          <span class="railroad-confirm-label">Distance:</span>
          <span class="railroad-confirm-value">${buildData.distance} tiles</span>
        </div>
        <div class="railroad-confirm-row">
          <span class="railroad-confirm-label">Cost:</span>
          <span class="railroad-confirm-value cost">${buildData.cost} gold</span>
        </div>
        <div class="railroad-confirm-row">
          <span class="railroad-confirm-label">Build Time:</span>
          <span class="railroad-confirm-value">${buildData.buildTime} turns</span>
        </div>
        <div class="railroad-confirm-row">
          <span class="railroad-confirm-label">Loss Rate:</span>
          <span class="railroad-confirm-value loss">-${buildData.lossPercent}%</span>
        </div>
      </div>
      <button class="btn btn-confirm-railroad" id="btn-confirm-railroad">
        Build Railroad (${buildData.cost} gold)
      </button>
    </div>
  `

  modal.classList.remove('hidden')

  const confirmBtn = document.getElementById('btn-confirm-railroad')

  const cleanup = () => {
    modal.classList.add('hidden')
    confirmBtn.removeEventListener('click', onConfirm)
    cancelBtn.removeEventListener('click', onCancel)
  }

  const onConfirm = () => {
    cleanup()
    callback(true)
  }

  const onCancel = () => {
    cleanup()
    callback(false)
  }

  confirmBtn.addEventListener('click', onConfirm)
  cancelBtn.addEventListener('click', onCancel)
}

function startGame() {
  const size = getMapContainerSize()

  const config = {
    type: Phaser.AUTO,
    parent: 'map-container',
    width: size.width,
    height: size.height,
    backgroundColor: '#0f0f1a',
    scene: MapScene,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  }

  const game = new Phaser.Game(config)

  // Create UI controllers
  const infoPanel = new InfoPanel('province-info')
  const topBar = new TopBar()
  const buildMenu = new BuildMenu()

  // Track selected province for refresh
  let selectedProvince = null

  // Listen for province selection events from Phaser
  game.events.on('provinceSelected', (province) => {
    selectedProvince = province
    infoPanel.update(province)
  })

  // Listen for map ready event to initialize GameState
  game.events.on('mapReady', (mapData) => {
    GameState.init(mapData)

    // Initialize railroads array if not present
    if (!GameState.railroads) {
      GameState.railroads = []
    }

    topBar.update()

    // Start game loop (begins paused)
    GameState.start()
    topBar.updatePauseButton()
  })

  // Handle worker allocation changes
  infoPanel.setWorkerChangeCallback((data) => {
    if (data.action === 'build') {
      buildMenu.show(data.province)
    } else if (data.action === 'upgrade') {
      // TODO: Handle upgrade
      console.log('Upgrade requested for province:', data.province.name)
    } else if (data.action === 'selectRecipe') {
      buildMenu.showRecipeSelection(data.province)
    } else if (data.action === 'buildRailroad') {
      // Start railroad build mode
      game.events.emit('startRailroadBuild', { q: data.province.q, r: data.province.r })
    } else {
      // Worker allocation changed - refresh display
      infoPanel.update(data)
    }
  })

  // Handle railroad build completion
  game.events.on('railroadBuildFinish', (buildData) => {
    // Show confirmation modal
    showRailroadConfirmModal(buildData, (confirmed) => {
      if (confirmed) {
        const railroad = railroadBuilder.confirmBuild(buildData)
        if (railroad) {
          console.log('Railroad built:', railroad.id)
          // Refresh info panel
          if (selectedProvince) {
            infoPanel.update(selectedProvince)
          }
          topBar.update()

          // Get map scene and redraw railroads
          const mapScene = game.scene.getScene('MapScene')
          if (mapScene) {
            mapScene.drawRailroads()
          }
        }
      } else {
        railroadBuilder.cancel()
      }
    })
  })

  // Handle build menu selection
  buildMenu.onBuild(({ province, buildingType, recipe }) => {
    const cost = getBuildCost(buildingType)
    if (GameState.spendGold(cost)) {
      province.building = createBuilding(buildingType, recipe)
      infoPanel.update(province)
      topBar.update()
    }
    buildMenu.hide()
  })

  // Handle recipe selection for existing factory
  buildMenu.onRecipeSelect(({ province, recipe }) => {
    if (province.building && province.building.type === 'factory') {
      province.building.recipe = recipe
      infoPanel.update(province)
    }
    buildMenu.hide()
  })

  // Handle turn processing (auto-tick or manual)
  GameState.on('turnProcessed', (summary) => {
    if (summary) {
      console.log(`Turn ${summary.turn - 1} complete:`, {
        taxes: summary.totalTaxes,
        popChange: summary.totalPopulationChange,
        soldiers: summary.totalSoldiersRecruited
      })

      // Refresh info panel if province selected
      if (selectedProvince) {
        // Re-fetch province data (it may have changed)
        const updated = GameState.mapData.getProvince(
          selectedProvince.q,
          selectedProvince.r
        )
        if (updated) {
          selectedProvince = updated
          infoPanel.update(updated)
        }
      }

      // Notify Phaser to redraw (in case visual state changed)
      game.events.emit('turnProcessed', summary)
    }
  })

  // Handle window resize
  window.addEventListener('resize', () => {
    const newSize = getMapContainerSize()
    game.scale.resize(newSize.width, newSize.height)
  })
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startGame)
} else {
  startGame()
}
