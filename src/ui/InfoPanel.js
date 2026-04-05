// Info Panel UI controller
import { getTerrain } from '../data/terrains.js'
import { getResource } from '../data/resources.js'
import { getEconomicSummary, setWorkerAllocation } from '../systems/Economy.js'
import { getBuildingSummary } from '../systems/Building.js'
import { getRecipe, getGood } from '../data/buildings.js'
import { GAME_CONFIG } from '../data/gameConfig.js'
import { GameState } from '../systems/GameState.js'
import {
  getRailroadsForProvince,
  getRailroadSummary,
  getAvailableGoods,
  setRailroadDistribution,
  isRailroadOperational,
  getTransportStorageUsed,
  getTransportStorageCapacity
} from '../systems/Railroad.js'
import { isOwnedByPlayer, getPopulationEstimate } from '../systems/Ownership.js'
import { getCombatStatus, getSoldiers, calculateAttrition, getTerrainModifier } from '../systems/Combat.js'
import { getNeighbors } from '../utils/hexUtils.js'

export class InfoPanel {
  constructor(containerId = 'province-info') {
    this.container = document.getElementById(containerId)
    this.currentProvince = null
    this.onWorkerChange = null  // Callback for worker allocation changes
  }

  // Set callback for when workers are reallocated
  setWorkerChangeCallback(callback) {
    this.onWorkerChange = callback
  }

  // Update panel with province data
  update(province) {
    if (!province) {
      this.clear()
      return
    }

    this.currentProvince = province
    const terrain = getTerrain(province.terrain)
    const isOwned = isOwnedByPlayer(province, GameState.currentPlayerId)

    // If enemy province, show limited view
    if (!isOwned) {
      this.container.innerHTML = this.renderEnemyProvince(province, terrain)
      return
    }

    const economic = getEconomicSummary(province)
    const building = getBuildingSummary(province)

    // Get railroad info
    const railroads = getRailroadsForProvince(GameState.railroads || [], province.q, province.r)
    const availableGoods = getAvailableGoods(province)

    // Get combat status
    const combatStatus = getCombatStatus(province, GameState.mapData)

    this.container.innerHTML = `
      ${this.renderHeader(province, terrain)}
      ${this.renderCombatStatus(province, combatStatus)}
      ${this.renderPopulation(province, economic)}
      ${this.renderWorkers(province, economic, building)}
      ${this.renderExtractors(economic)}
      ${this.renderBuilding(province, building)}
      ${this.renderTransportStorage(province)}
      ${this.renderRailroads(province, railroads, availableGoods)}
      ${this.renderResources(province)}
    `

    this.attachEventListeners(province)
    this.attachRailroadListeners(province, railroads)
  }

  // Render limited view for enemy provinces
  renderEnemyProvince(province, terrain) {
    const populationEstimate = getPopulationEstimate(province.population)
    const soldiers = getSoldiers(province)
    const control = province.control || 0
    const controlPercent = (control / GAME_CONFIG.combat.controlCap) * 100

    // Show control bar if player is exerting control on this enemy province
    let controlHtml = ''
    if (control > 0 && province.controllingPlayerId === GAME_CONFIG.ownership.humanPlayerId) {
      controlHtml = `
        <div class="section">
          <div class="label">Your Control</div>
          <div class="control-bar your-control">
            <div class="control-fill" style="width: ${controlPercent}%"></div>
          </div>
          <div class="control-percent">${Math.round(controlPercent)}%</div>
        </div>
      `
    }

    return `
      <div class="section province-enemy">
        <div class="province-name">${province.name}</div>
        <div class="province-coords">
          <span class="terrain-color" style="
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 2px;
            background: #${terrain.color.toString(16).padStart(6, '0')};
            margin-right: 6px;
          "></span>
          ${terrain.name} (${province.q}, ${province.r})
        </div>
        <div class="enemy-indicator">Enemy Territory</div>
      </div>
      <div class="section info-restricted">
        <div class="label">Population</div>
        <div class="stat-row">
          <span class="stat-value restricted">~${populationEstimate}</span>
        </div>
      </div>
      ${soldiers > 0 ? `
        <div class="section">
          <div class="label">Military</div>
          <div class="stat-row">
            <span class="stat-label">⚔️ Enemy Soldiers</span>
            <span class="stat-value soldiers enemy">~${Math.round(soldiers / 10) * 10}</span>
          </div>
        </div>
      ` : ''}
      ${controlHtml}
      <div class="section info-restricted">
        <div class="restricted-message">
          <span class="lock-icon">🔒</span>
          <span>Detailed information unavailable</span>
        </div>
      </div>
    `
  }

  renderHeader(province, terrain) {
    return `
      <div class="section">
        <div class="province-name">${province.name}</div>
        <div class="province-coords">
          <span class="terrain-color" style="
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 2px;
            background: #${terrain.color.toString(16).padStart(6, '0')};
            margin-right: 6px;
          "></span>
          ${terrain.name} (${province.q}, ${province.r})
        </div>
      </div>
    `
  }

  renderCombatStatus(province, combatStatus) {
    const { soldiers, inCombat, underAttack, projecting, control, controlPercent, controllingPlayerId, enemyNeighbors } = combatStatus

    // Only show if there are soldiers or control
    if (soldiers === 0 && control === 0) {
      return ''
    }

    let statusHtml = ''

    // Combat status indicator
    if (inCombat) {
      statusHtml = `<div class="combat-indicator in-combat">⚔️ In Combat</div>`
    } else if (underAttack) {
      statusHtml = `<div class="combat-indicator under-attack">🛡️ Under Attack</div>`
    } else if (projecting) {
      statusHtml = `<div class="combat-indicator projecting">⚔️ Projecting Control</div>`
    }

    // Control bar (only show if under enemy control)
    let controlHtml = ''
    if (control > 0 && controllingPlayerId !== null) {
      controlHtml = `
        <div class="control-section">
          <div class="control-label">Enemy Control: ${Math.round(controlPercent)}%</div>
          <div class="control-bar">
            <div class="control-fill" style="width: ${controlPercent}%"></div>
          </div>
        </div>
      `
    }

    // Projection details (when projecting control to enemy tiles)
    let projectionHtml = ''
    if (projecting && soldiers > 0) {
      const projectionTargets = []
      let totalAttrition = 0

      for (const enemy of enemyNeighbors) {
        if (enemy.soldiers === 0) {
          // This is a projection target
          const targetProvince = GameState.mapData.getProvince(enemy.q, enemy.r)
          if (targetProvince) {
            const terrainMod = getTerrainModifier(targetProvince.terrain, 'control')
            if (terrainMod !== Infinity) {
              const controlGain = GAME_CONFIG.combat.baseControlRate * (soldiers / 100) / terrainMod
              const attrition = calculateAttrition(soldiers, {
                terrain: targetProvince.terrain,
                enemySoldiers: 0,
                isAttacker: true,
                province: province,
                gameState: GameState
              }) * 0.5

              totalAttrition += Math.floor(attrition)
              projectionTargets.push({
                coords: `(${enemy.q},${enemy.r})`,
                terrain: targetProvince.terrain,
                controlGain: controlGain.toFixed(1),
                currentControl: targetProvince.control || 0
              })
            }
          }
        }
      }

      if (projectionTargets.length > 0) {
        const targetsHtml = projectionTargets.map(t => `
          <div class="projection-target">
            <span class="target-coords">${t.coords}</span>
            <span class="target-control">+${t.controlGain}/turn</span>
            <span class="target-progress">(${Math.round(t.currentControl)}%)</span>
          </div>
        `).join('')

        projectionHtml = `
          <div class="projection-details">
            <div class="projection-label">Projecting to:</div>
            ${targetsHtml}
            <div class="attrition-info">
              <span class="attrition-label">Occupation losses:</span>
              <span class="attrition-value">-${Math.max(1, totalAttrition)}/turn</span>
            </div>
          </div>
        `
      }
    }

    return `
      <div class="section combat-section">
        <div class="label">Military</div>
        <div class="stat-row">
          <span class="stat-label">⚔️ Soldiers</span>
          <span class="stat-value soldiers">${soldiers}</span>
        </div>
        ${statusHtml}
        ${projectionHtml}
        ${controlHtml}
      </div>
    `
  }

  renderPopulation(province, economic) {
    const growthClass = economic.growthRate >= 0 ? 'positive' : 'negative'
    const growthSign = economic.growthRate >= 0 ? '+' : ''

    return `
      <div class="section">
        <div class="label">Population</div>
        <div class="stat-row">
          <span class="stat-value">${province.population.toLocaleString()}</span>
          <span class="stat-change ${growthClass}">${growthSign}${economic.growthPercent}/turn</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Tax Income</span>
          <span class="stat-value gold">+${economic.taxes} 💰</span>
        </div>
      </div>
    `
  }

  renderWorkers(province, economic, building) {
    const extractorMax = province.resources.length > 0 ? 40 : 0
    const buildingMax = building.hasBuilding && building.isOperational ? 30 : 0
    const extractorVal = Math.round((province.workerAllocation.extractor || 0) * 100)
    const buildingVal = Math.round((province.workerAllocation.building || 0) * 100)
    const idleVal = Math.round(economic.idlePercent * 100)

    return `
      <div class="section">
        <div class="label">Worker Allocation</div>

        ${province.resources.length > 0 ? `
          <div class="worker-row">
            <span class="worker-label">⛏️ Extraction</span>
            <input type="range"
              class="worker-slider"
              id="slider-extractor"
              min="0" max="${extractorMax}"
              value="${extractorVal}"
              ${extractorMax === 0 ? 'disabled' : ''}
            >
            <span class="worker-value" id="value-extractor">${extractorVal}%</span>
          </div>
        ` : ''}

        ${building.hasBuilding ? `
          <div class="worker-row">
            <span class="worker-label">${building.typeIcon} ${building.typeName}</span>
            <input type="range"
              class="worker-slider"
              id="slider-building"
              min="0" max="${buildingMax}"
              value="${buildingVal}"
              ${!building.isOperational ? 'disabled' : ''}
            >
            <span class="worker-value" id="value-building">${buildingVal}%</span>
          </div>
        ` : ''}

        <div class="worker-row idle">
          <span class="worker-label">🏠 Idle (Full Tax)</span>
          <span class="worker-value">${idleVal}%</span>
        </div>
      </div>
    `
  }

  renderExtractors(economic) {
    if (!economic.extraction.hasResources) {
      return ''
    }

    const extractors = economic.extraction.extractors.map(ext => {
      const capacityPercent = Math.round((ext.stored / ext.capacity) * 100)
      const capacityClass = ext.atCapacity ? 'full' : ''

      // Format real rate - show decimal for fractional values
      const realRate = ext.realRate || 0
      const rateDisplay = realRate === 0 ? '0' :
        (realRate >= 1 ? realRate.toFixed(1) : realRate.toFixed(2))

      // Show (full) indicator if at capacity
      const rateNote = ext.atCapacity ? ' <span class="rate-note">(full)</span>' : ''

      return `
        <div class="extractor-row">
          <span class="extractor-name">${ext.resourceIcon} ${ext.resourceName}</span>
          <div class="capacity-bar ${capacityClass}">
            <div class="capacity-fill" style="width: ${capacityPercent}%"></div>
            <span class="capacity-text">${ext.stored}/${ext.capacity}</span>
          </div>
          <span class="production-rate">+${rateDisplay}/t${rateNote}</span>
        </div>
      `
    }).join('')

    return `
      <div class="section">
        <div class="label">Extraction</div>
        ${extractors}
      </div>
    `
  }

  renderBuilding(province, building) {
    if (!building.hasBuilding) {
      if (building.canBuild) {
        return `
          <div class="section">
            <div class="label">Building Slot</div>
            <div class="empty-slot">
              <span>Empty</span>
              <button class="btn-small" id="btn-build">Build...</button>
            </div>
          </div>
        `
      }
      return ''
    }

    let statusHtml = ''
    let productionHtml = ''

    if (building.isConstructing) {
      statusHtml = `<div class="building-status constructing">🔨 Building... (${building.constructionTurns} turns)</div>`
    } else if (building.isUpgrading) {
      statusHtml = `<div class="building-status upgrading">⬆️ Upgrading... (${building.upgradeTurns} turns)</div>`
    } else {
      // Show production info
      if (building.type === 'factory') {
        if (building.recipe) {
          const recipe = getRecipe(building.recipe)
          const prod = building.production

          // Format real production rate
          const realRate = prod.realProductionRate || 0
          const rateDisplay = realRate === 0 ? '0' :
            (realRate >= 1 ? realRate.toFixed(1) : realRate.toFixed(2))

          // Build input rates display with supply/demand indicators
          let inputRatesHtml = ''
          if (prod.inputRates && prod.inputRates.length > 0) {
            inputRatesHtml = prod.inputRates.map(input => {
              const consumeDisplay = input.consumptionRate === 0 ? '0' :
                (input.consumptionRate >= 1 ? input.consumptionRate.toFixed(1) : input.consumptionRate.toFixed(2))

              // Determine supply/demand status
              let statusClass = 'balanced'
              let statusIndicator = ''

              if (input.isResource && input.supplyRate > 0) {
                const supplyDisplay = input.supplyRate >= 1 ?
                  input.supplyRate.toFixed(1) : input.supplyRate.toFixed(2)

                if (input.supplyRate >= input.consumptionRate) {
                  statusClass = 'balanced'
                  statusIndicator = `<span class="supply-info balanced">← +${supplyDisplay}/t ✓</span>`
                } else if (input.currentStock > input.amountPerCycle * 5) {
                  statusClass = 'warning'
                  statusIndicator = `<span class="supply-info warning">← +${supplyDisplay}/t ⚠️</span>`
                } else {
                  statusClass = 'critical'
                  statusIndicator = `<span class="supply-info critical">← +${supplyDisplay}/t ⚠️</span>`
                }
              } else if (input.isResource) {
                // No supply at all
                if (input.currentStock > 0) {
                  statusClass = 'warning'
                  statusIndicator = `<span class="supply-info warning">← no supply ⚠️</span>`
                } else {
                  statusClass = 'critical'
                  statusIndicator = `<span class="supply-info critical">← no supply ⚠️</span>`
                }
              }

              // Get icon for the input
              const inputIcon = input.isResource ?
                (getResource(input.key)?.icon || '?') :
                (getGood(input.key)?.icon || '?')

              return `
                <div class="rate-row">
                  <span class="rate-label">Input:</span>
                  <span class="rate-input ${statusClass}">${inputIcon} -${consumeDisplay}/t</span>
                  ${statusIndicator}
                </div>
              `
            }).join('')
          }

          // Get output icon
          const outputGood = getGood(recipe.outputs[0].good)
          const outputIcon = outputGood?.icon || '?'

          // Status message
          let statusHtml = ''
          if (prod.atCapacity) {
            statusHtml = `<div class="production-blocked">Output full</div>`
          } else if (prod.reason === 'Missing inputs') {
            statusHtml = `<div class="production-blocked">Waiting for inputs</div>`
          } else if (prod.reason === 'No workers assigned') {
            statusHtml = `<div class="production-blocked">No workers assigned</div>`
          } else if (realRate > 0) {
            statusHtml = `<div class="production-active">Producing</div>`
          }

          productionHtml = `
            <div class="recipe-info">
              <div class="recipe-name">${recipe.name}</div>
              ${statusHtml}

              ${inputRatesHtml}

              <div class="rate-row">
                <span class="rate-label">Output:</span>
                <span class="rate-output">${outputIcon} +${rateDisplay}/t</span>
              </div>

              <button class="btn-small btn-recipe" id="btn-change-recipe">Change Recipe</button>
            </div>
          `

          // Show storage
          const storageItems = Object.entries(building.storage)
            .filter(([_, amt]) => amt > 0)
            .map(([id, amt]) => {
              const good = getGood(id)
              return `<span class="storage-item">${good?.icon || '?'} ${amt}</span>`
            }).join('')

          if (storageItems) {
            productionHtml += `<div class="building-storage">Output: ${storageItems}</div>`
          }

          // Show input storage
          const inputStorageItems = Object.entries(building.inputStorage)
            .filter(([_, amt]) => amt > 0)
            .map(([id, amt]) => {
              const resource = getResource(id)
              const good = getGood(id)
              const icon = resource?.icon || good?.icon || '?'
              return `<span class="storage-item">${icon} ${amt}</span>`
            }).join('')

          if (inputStorageItems) {
            productionHtml += `<div class="building-storage input-storage">Input: ${inputStorageItems}</div>`
          }
        } else {
          // Factory without recipe - show select recipe button
          productionHtml = `
            <div class="recipe-info">
              <div class="production-blocked">No recipe selected</div>
              <button class="btn-small btn-recipe" id="btn-select-recipe">Select Recipe</button>
            </div>
          `
        }

      } else if (building.type === 'recruitmentCenter') {
        const rec = building.recruitment

        productionHtml = `
          <div class="recruitment-info">
            ${rec.canRecruit ? `
              <div class="production-active">Recruiting: +${rec.soldiers}/turn</div>
              <div class="pop-consumed">-${rec.populationConsumed} pop</div>
            ` : `
              <div class="production-blocked">${rec.reason || 'Not recruiting'}</div>
            `}
            <div class="soldier-storage">⚔️ Soldiers ready: ${building.storage.soldiers || 0}/${rec.capacity}</div>
          </div>
        `
      }
    }

    const upgradeBtn = building.canUpgrade ?
      `<button class="btn-small" id="btn-upgrade">Upgrade (${building.upgradeCost} 💰)</button>` : ''

    return `
      <div class="section">
        <div class="label">Building</div>
        <div class="building-header">
          <span class="building-name">${building.typeIcon} ${building.typeName}</span>
          <span class="building-level">Lv.${building.level} ${building.levelName}</span>
        </div>
        ${statusHtml}
        ${productionHtml}
        ${upgradeBtn}
      </div>
    `
  }

  renderResources(province) {
    const resources = province.resources.map(id => getResource(id)).filter(Boolean)

    if (resources.length === 0) {
      return ''
    }

    return `
      <div class="section">
        <div class="label">Natural Resources</div>
        <div class="resources">
          ${resources.map(r => `
            <span class="resource-tag">${r.icon} ${r.name}</span>
          `).join('')}
        </div>
      </div>
    `
  }

  attachEventListeners(province) {
    // Extractor slider
    const extractorSlider = document.getElementById('slider-extractor')
    if (extractorSlider) {
      extractorSlider.addEventListener('input', (e) => {
        const percent = parseInt(e.target.value) / 100
        setWorkerAllocation(province, 'extractor', percent)
        document.getElementById('value-extractor').textContent = `${e.target.value}%`
        this.updateIdleDisplay(province)
        this.onWorkerChange?.(province)
      })
    }

    // Building slider
    const buildingSlider = document.getElementById('slider-building')
    if (buildingSlider) {
      buildingSlider.addEventListener('input', (e) => {
        const percent = parseInt(e.target.value) / 100
        setWorkerAllocation(province, 'building', percent)
        document.getElementById('value-building').textContent = `${e.target.value}%`
        this.updateIdleDisplay(province)
        this.onWorkerChange?.(province)
      })
    }

    // Build button
    const buildBtn = document.getElementById('btn-build')
    if (buildBtn) {
      buildBtn.addEventListener('click', () => {
        this.onWorkerChange?.({ action: 'build', province })
      })
    }

    // Upgrade button
    const upgradeBtn = document.getElementById('btn-upgrade')
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => {
        this.onWorkerChange?.({ action: 'upgrade', province })
      })
    }

    // Recipe select/change buttons
    const selectRecipeBtn = document.getElementById('btn-select-recipe')
    if (selectRecipeBtn) {
      selectRecipeBtn.addEventListener('click', () => {
        this.onWorkerChange?.({ action: 'selectRecipe', province })
      })
    }

    const changeRecipeBtn = document.getElementById('btn-change-recipe')
    if (changeRecipeBtn) {
      changeRecipeBtn.addEventListener('click', () => {
        this.onWorkerChange?.({ action: 'selectRecipe', province })
      })
    }
  }

  updateIdleDisplay(province) {
    const total = (province.workerAllocation.extractor || 0) +
                  (province.workerAllocation.building || 0)
    const idle = Math.max(0, 1 - total)
    const idleEl = this.container.querySelector('.worker-row.idle .worker-value')
    if (idleEl) {
      idleEl.textContent = `${Math.round(idle * 100)}%`
    }
  }

  renderTransportStorage(province) {
    const used = getTransportStorageUsed(province)
    const capacity = getTransportStorageCapacity(province)

    // Don't show section if nothing in transport storage
    if (used === 0) {
      return ''
    }

    const storageItems = Object.entries(province.transportStorage || {})
      .filter(([_, amt]) => amt > 0)
      .map(([id, amt]) => {
        const resource = getResource(id)
        const good = getGood(id)
        const icon = resource?.icon || good?.icon || '?'
        const name = resource?.name || good?.name || id
        return `<span class="transport-item">${icon} ${name}: ${amt}</span>`
      }).join('')

    const capacityPercent = Math.round((used / capacity) * 100)
    const capacityClass = used >= capacity ? 'full' : ''

    return `
      <div class="section">
        <div class="label">Transport Storage</div>
        <div class="transport-capacity">
          <div class="capacity-bar ${capacityClass}">
            <div class="capacity-fill" style="width: ${capacityPercent}%"></div>
            <span class="capacity-text">${used}/${capacity}</span>
          </div>
        </div>
        <div class="transport-items">
          ${storageItems}
        </div>
      </div>
    `
  }

  renderRailroads(province, railroads, availableGoods) {
    const { outgoing, incoming } = railroads
    const hasRailroads = outgoing.length > 0 || incoming.length > 0
    const canBuildRailroad = province.terrain !== 'water'

    // Check if at max railroads
    const atMaxRailroads = outgoing.length >= GAME_CONFIG.railroad.maxRailroadsPerProvince

    let content = ''

    // Outgoing railroads
    if (outgoing.length > 0) {
      content += '<div class="railroad-group"><div class="railroad-group-label">Outgoing:</div>'

      for (const railroad of outgoing) {
        const summary = getRailroadSummary(railroad, GameState.mapData)
        const isOperational = isRailroadOperational(railroad)
        const hasBlocked = summary.lastTransport && Object.keys(summary.lastTransport.blocked || {}).length > 0

        content += `
          <div class="railroad-item ${!isOperational ? 'constructing' : ''}" data-railroad-id="${railroad.id}">
            <div class="railroad-header">
              <span class="railroad-dest">
                <span class="railroad-arrow">→</span>
                (${railroad.destQ},${railroad.destR}) ${summary.destTerrain}
                ${hasBlocked ? '<span class="railroad-blocked">BLOCKED</span>' : ''}
              </span>
              <span class="railroad-stats">${summary.capacity}/turn -${summary.lossPercent}% loss</span>
            </div>
            ${!isOperational ? `
              <div class="railroad-construction">Building... (${railroad.constructionProgress} turns)</div>
            ` : this.renderDistributionSliders(railroad, availableGoods)}
          </div>
        `
      }
      content += '</div>'
    }

    // Incoming railroads
    if (incoming.length > 0) {
      content += '<div class="railroad-group incoming"><div class="railroad-group-label">Incoming:</div>'

      for (const railroad of incoming) {
        const summary = getRailroadSummary(railroad, GameState.mapData)
        const isOperational = isRailroadOperational(railroad)

        // Calculate approximate incoming amount
        let incomingInfo = ''
        if (summary.lastTransport && isOperational) {
          const received = Object.entries(summary.lastTransport.transported || {})
            .map(([id, data]) => {
              const resource = getResource(id)
              const good = getGood(id)
              const icon = resource?.icon || good?.icon || '?'
              return `${icon} ${data.received}`
            })
            .join(' ')
          if (received) {
            incomingInfo = `<span class="incoming-amount">~${received}/turn</span>`
          }
        }

        content += `
          <div class="railroad-item incoming ${!isOperational ? 'constructing' : ''}">
            <div class="railroad-header">
              <span class="railroad-dest">
                <span class="railroad-arrow">←</span>
                (${railroad.sourceQ},${railroad.sourceR}) ${summary.sourceTerrain}
              </span>
              ${incomingInfo}
            </div>
            ${!isOperational ? `
              <div class="railroad-construction">Building... (${railroad.constructionProgress} turns)</div>
            ` : ''}
          </div>
        `
      }
      content += '</div>'
    }

    // Build button
    const buildButtonHtml = canBuildRailroad && !atMaxRailroads ?
      `<button class="btn-small btn-railroad" id="btn-build-railroad">Build Railroad</button>` :
      (atMaxRailroads ?
        `<div class="railroad-max">Max railroads reached</div>` : '')

    return `
      <div class="section">
        <div class="label">Railroads</div>
        ${hasRailroads ? content : '<div class="no-railroads">No railroads</div>'}
        ${buildButtonHtml}
      </div>
    `
  }

  renderDistributionSliders(railroad, availableGoods) {
    const goodIds = Object.keys(availableGoods)
    if (goodIds.length === 0) {
      return '<div class="no-goods">No goods available to transport</div>'
    }

    return goodIds.map(goodId => {
      const good = availableGoods[goodId]
      const currentPercent = Math.round((railroad.distribution[goodId] || 0) * 100)

      return `
        <div class="distribution-row">
          <span class="distribution-good">${good.icon} ${good.name}</span>
          <input type="range"
            class="distribution-slider"
            data-railroad-id="${railroad.id}"
            data-good-id="${goodId}"
            min="0" max="100"
            value="${currentPercent}"
          >
          <span class="distribution-value" data-value-for="${railroad.id}-${goodId}">${currentPercent}%</span>
        </div>
      `
    }).join('')
  }

  attachRailroadListeners(province, railroads) {
    // Build railroad button
    const buildBtn = document.getElementById('btn-build-railroad')
    if (buildBtn) {
      buildBtn.addEventListener('click', () => {
        this.onWorkerChange?.({ action: 'buildRailroad', province })
      })
    }

    // Distribution sliders
    const sliders = this.container.querySelectorAll('.distribution-slider')
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const railroadId = e.target.dataset.railroadId
        const goodId = e.target.dataset.goodId
        const percent = parseInt(e.target.value) / 100

        // Find and update railroad
        const railroad = (GameState.railroads || []).find(r => r.id === railroadId)
        if (railroad) {
          setRailroadDistribution(railroad, goodId, percent)
        }

        // Update display
        const valueEl = this.container.querySelector(`[data-value-for="${railroadId}-${goodId}"]`)
        if (valueEl) {
          valueEl.textContent = `${e.target.value}%`
        }
      })
    })
  }

  // Clear the panel
  clear() {
    this.currentProvince = null
    this.container.innerHTML = '<p class="no-selection">Click a hex to select</p>'
  }
}
