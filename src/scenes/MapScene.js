import Phaser from 'phaser'
import { generateMap } from '../utils/mapGenerator.js'
import { getTerrain } from '../data/terrains.js'
import { getBuildingType, getRecipe, getGood } from '../data/buildings.js'
import {
  axialToPixel,
  pixelToAxial,
  getHexCorners,
  getNeighbors,
  HEX_SIZE
} from '../utils/hexUtils.js'
import { GameState } from '../systems/GameState.js'
import { railroadBuilder } from '../ui/RailroadBuilder.js'
import { projectionArrowBuilder } from '../ui/ProjectionArrowBuilder.js'
import { isOwnedByPlayer } from '../systems/Ownership.js'
import { getSoldiers, getCombatStatus } from '../systems/Combat.js'
import { GAME_CONFIG } from '../data/gameConfig.js'
import { getHQSummary, getProjectionRadius } from '../systems/ArmyHQ.js'

export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene')
    this.mapData = null
    this.hexGraphics = null
    this.railroadGraphics = null
    this.projectionGraphics = null  // Graphics for Army HQ projection arrows
    this.selectedHex = null
    this.mapOffset = { x: 100, y: 80 }
    this.buildingIcons = new Map()  // Track building icon text objects
    this.productIcons = new Map()   // Track product icon text objects
    this.soldierIcons = new Map()   // Track soldier count text objects
    this.combatIcons = new Map()    // Track combat indicator text objects
    this.controlGraphics = null     // Graphics for control projection arrows
    this.railroadBuildMode = false
    this.projectionBuildMode = false
    this.previewTooltip = null
  }

  create() {
    // Generate random map
    this.mapData = generateMap({
      width: 12,
      height: 10,
      seed: 12345,
      name: 'Test Map'
    })

    // Create graphics objects
    this.hexGraphics = this.add.graphics()
    this.railroadGraphics = this.add.graphics()
    this.controlGraphics = this.add.graphics()
    this.projectionGraphics = this.add.graphics()

    // Create preview tooltip
    this.previewTooltip = this.add.text(0, 0, '', {
      fontSize: '12px',
      backgroundColor: '#16213e',
      padding: { x: 8, y: 6 },
      color: '#fff'
    })
    this.previewTooltip.setDepth(100)
    this.previewTooltip.setVisible(false)

    // Draw the map
    this.drawMap()

    // Emit map ready event for GameState initialization
    this.game.events.emit('mapReady', this.mapData)

    // Set up railroad builder with map scene reference
    railroadBuilder.setMapScene(this)

    // Set up projection arrow builder
    projectionArrowBuilder.setMapScene(this)

    // Set up input
    this.input.on('pointerdown', this.handleClick, this)

    // Handle resize
    this.scale.on('resize', this.onResize, this)

    // Enable camera drag and railroad preview
    this.input.on('pointermove', this.handlePointerMove, this)
    this.isDragging = false
    this.dragStart = { x: 0, y: 0 }

    this.input.on('pointerdown', (pointer) => {
      if (pointer.rightButtonDown()) {
        this.isDragging = true
        this.dragStart = { x: pointer.x, y: pointer.y }
      }
    })

    this.input.on('pointerup', (pointer) => {
      this.isDragging = false

      // Handle railroad build finish
      if (railroadBuilder.isActive() && !pointer.rightButtonDown()) {
        const buildData = railroadBuilder.finishBuild()
        if (buildData && buildData.valid) {
          this.game.events.emit('railroadBuildFinish', buildData)
        }
        this.hideRailroadPreview()
      }

      // Handle projection arrow build finish
      if (projectionArrowBuilder.isActive() && !pointer.rightButtonDown()) {
        const buildData = projectionArrowBuilder.finishBuild()
        if (buildData && buildData.valid) {
          this.game.events.emit('projectionBuildFinish', buildData)
        }
        this.hideProjectionPreview()
      }
    })

    // Handle mouse wheel for projection width adjustment
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
      if (projectionArrowBuilder.isActive()) {
        projectionArrowBuilder.adjustWidth(-deltaY)
        // Redraw preview with new width
        const worldX = pointer.x - this.mapOffset.x
        const worldY = pointer.y - this.mapOffset.y
        const previewData = projectionArrowBuilder.updatePreview(worldX, worldY)
        if (previewData) {
          this.drawProjectionPreview(previewData, pointer.x, pointer.y)
        }
      }
    })

    // Listen for turn processed to redraw map
    this.game.events.on('turnProcessed', () => {
      this.drawMap()
      this.drawRailroads()
      this.drawProjectionArrows()
    })

    // Listen for railroad build start
    this.game.events.on('startRailroadBuild', (sourceHex) => {
      this.railroadBuildMode = true
      railroadBuilder.startBuild(sourceHex.q, sourceHex.r)
    })

    // Listen for projection arrow build start
    this.game.events.on('startProjectionBuild', (hqProvince) => {
      this.projectionBuildMode = true
      projectionArrowBuilder.startBuild(hqProvince)
    })
  }

  handlePointerMove(pointer) {
    // Handle map drag
    if (this.isDragging) {
      const dx = pointer.x - this.dragStart.x
      const dy = pointer.y - this.dragStart.y
      this.mapOffset.x += dx
      this.mapOffset.y += dy
      this.dragStart = { x: pointer.x, y: pointer.y }
      this.drawMap()
      this.drawRailroads()
    }

    // Handle railroad build preview
    if (railroadBuilder.isActive()) {
      const worldX = pointer.x - this.mapOffset.x
      const worldY = pointer.y - this.mapOffset.y
      const previewData = railroadBuilder.updatePreview(worldX, worldY)

      if (previewData) {
        this.drawRailroadPreview(previewData, pointer.x, pointer.y)
      }
    }

    // Handle projection arrow build preview
    if (projectionArrowBuilder.isActive()) {
      const worldX = pointer.x - this.mapOffset.x
      const worldY = pointer.y - this.mapOffset.y
      const previewData = projectionArrowBuilder.updatePreview(worldX, worldY)

      if (previewData) {
        this.drawProjectionPreview(previewData, pointer.x, pointer.y)
      }
    }
  }

  drawMap() {
    this.hexGraphics.clear()
    const corners = getHexCorners(HEX_SIZE)

    for (const province of this.mapData.getAllProvinces()) {
      const { q, r } = province
      const terrain = getTerrain(province.terrain)
      const pixel = axialToPixel(q, r)

      const x = pixel.x + this.mapOffset.x
      const y = pixel.y + this.mapOffset.y

      // Check if selected
      const isSelected = this.selectedHex &&
        this.selectedHex.q === q &&
        this.selectedHex.r === r

      // Check ownership
      const isPlayerOwned = isOwnedByPlayer(province, GameState.currentPlayerId)

      // Draw hex fill
      this.hexGraphics.fillStyle(terrain.color, 1)
      this.hexGraphics.beginPath()
      this.hexGraphics.moveTo(x + corners[0].x, y + corners[0].y)
      for (let i = 1; i < 6; i++) {
        this.hexGraphics.lineTo(x + corners[i].x, y + corners[i].y)
      }
      this.hexGraphics.closePath()
      this.hexGraphics.fillPath()

      // Draw ownership indicator border (inner colored border)
      if (!isSelected) {
        // Player tiles: blue/green border, AI tiles: red border
        const ownershipColor = isPlayerOwned ? 0x4ade80 : 0xf87171
        const ownershipWidth = 2
        const ownershipAlpha = 0.6

        this.hexGraphics.lineStyle(ownershipWidth, ownershipColor, ownershipAlpha)
        this.hexGraphics.beginPath()
        // Draw slightly inside the hex
        const innerScale = 0.85
        this.hexGraphics.moveTo(x + corners[0].x * innerScale, y + corners[0].y * innerScale)
        for (let i = 1; i < 6; i++) {
          this.hexGraphics.lineTo(x + corners[i].x * innerScale, y + corners[i].y * innerScale)
        }
        this.hexGraphics.closePath()
        this.hexGraphics.strokePath()
      }

      // Draw hex border (outer edge)
      const borderColor = isSelected ? 0xffffff : 0x000000
      const borderWidth = isSelected ? 3 : 1
      const borderAlpha = isSelected ? 1 : 0.3

      this.hexGraphics.lineStyle(borderWidth, borderColor, borderAlpha)
      this.hexGraphics.beginPath()
      this.hexGraphics.moveTo(x + corners[0].x, y + corners[0].y)
      for (let i = 1; i < 6; i++) {
        this.hexGraphics.lineTo(x + corners[i].x, y + corners[i].y)
      }
      this.hexGraphics.closePath()
      this.hexGraphics.strokePath()

      // Draw resource indicator if has resources (small dot, moved up if building present)
      if (province.resources.length > 0 && !province.building) {
        this.hexGraphics.fillStyle(0xffffff, 0.8)
        this.hexGraphics.fillCircle(x, y, 4)
      }

      // Draw control overlay if province is being controlled
      this.drawControlOverlay(province, x, y, corners)

      // Update building icons
      this.updateBuildingIcon(province, x, y)

      // Update soldier and combat icons
      this.updateSoldierIcon(province, x, y)
      this.updateCombatIcon(province, x, y)
    }

    // Draw control projection arrows
    this.drawControlProjectionArrows()

    // Draw Army HQ projection arrows (persistent, not combat-based)
    this.drawProjectionArrows()
  }

  drawControlProjectionArrows() {
    this.controlGraphics.clear()

    for (const province of this.mapData.getAllProvinces()) {
      const soldiers = getSoldiers(province)
      if (soldiers <= 0) continue

      const neighbors = getNeighbors(province.q, province.r)

      for (const coord of neighbors) {
        const neighbor = this.mapData.getProvince(coord.q, coord.r)
        if (!neighbor) continue

        // Skip same-owner provinces
        if (neighbor.playerId === province.playerId) continue

        // Skip if neighbor has soldiers (that's combat, not control projection)
        const neighborSoldiers = getSoldiers(neighbor)
        if (neighborSoldiers > 0) continue

        // This is control projection - draw arrow
        const sourcePixel = axialToPixel(province.q, province.r)
        const destPixel = axialToPixel(neighbor.q, neighbor.r)

        const x1 = sourcePixel.x + this.mapOffset.x
        const y1 = sourcePixel.y + this.mapOffset.y
        const x2 = destPixel.x + this.mapOffset.x
        const y2 = destPixel.y + this.mapOffset.y

        // Determine color based on who is projecting
        const isPlayerProjecting = isOwnedByPlayer(province, GameState.currentPlayerId)
        const arrowColor = isPlayerProjecting ? 0x4ade80 : 0xf87171

        // Draw curved arrow (like history book war arrows)
        this.drawWarArrow(x1, y1, x2, y2, arrowColor, soldiers)
      }
    }
  }

  drawWarArrow(x1, y1, x2, y2, color, soldiers) {
    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Shorten arrow to not overlap hex centers
    const shortenStart = 15
    const shortenEnd = 20
    const startX = x1 + (dx / dist) * shortenStart
    const startY = y1 + (dy / dist) * shortenStart
    const endX = x2 - (dx / dist) * shortenEnd
    const endY = y2 - (dy / dist) * shortenEnd

    // Calculate perpendicular offset for curve
    const perpX = -dy / dist
    const perpY = dx / dist
    const curveAmount = 8

    // Control point for quadratic curve
    const midX = (startX + endX) / 2 + perpX * curveAmount
    const midY = (startY + endY) / 2 + perpY * curveAmount

    // Arrow thickness based on soldier count (min 2, max 6)
    const thickness = Math.min(6, Math.max(2, Math.floor(soldiers / 20) + 2))

    // Draw arrow body
    this.controlGraphics.lineStyle(thickness, color, 0.7)
    this.controlGraphics.beginPath()
    this.controlGraphics.moveTo(startX, startY)

    // Draw quadratic curve
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const invT = 1 - t
      const px = invT * invT * startX + 2 * invT * t * midX + t * t * endX
      const py = invT * invT * startY + 2 * invT * t * midY + t * t * endY
      this.controlGraphics.lineTo(px, py)
    }
    this.controlGraphics.strokePath()

    // Draw arrowhead
    const angle = Math.atan2(endY - midY, endX - midX)
    const arrowSize = thickness + 4
    const arrowAngle = Math.PI / 5

    this.controlGraphics.fillStyle(color, 0.8)
    this.controlGraphics.beginPath()
    this.controlGraphics.moveTo(endX, endY)
    this.controlGraphics.lineTo(
      endX - arrowSize * Math.cos(angle - arrowAngle),
      endY - arrowSize * Math.sin(angle - arrowAngle)
    )
    this.controlGraphics.lineTo(
      endX - arrowSize * Math.cos(angle + arrowAngle),
      endY - arrowSize * Math.sin(angle + arrowAngle)
    )
    this.controlGraphics.closePath()
    this.controlGraphics.fillPath()
  }

  drawControlOverlay(province, x, y, corners) {
    const control = province.control || 0
    if (control <= 0) return

    const controlPercent = control / GAME_CONFIG.combat.controlCap
    const controllingPlayerId = province.controllingPlayerId

    // Determine color based on who is controlling
    // Red if enemy is controlling player's province, green if player is controlling enemy
    const isPlayerOwned = isOwnedByPlayer(province, GameState.currentPlayerId)
    const isPlayerControlling = controllingPlayerId === GameState.currentPlayerId

    // If enemy controls player's province: red overlay
    // If player controls enemy province: green overlay
    const overlayColor = isPlayerOwned ? 0xf87171 : 0x4ade80

    // Draw control progress as a partial border overlay
    this.hexGraphics.lineStyle(4, overlayColor, 0.8)

    // Draw partial hex border based on control percentage
    const numSides = Math.ceil(controlPercent * 6)
    const partialSide = (controlPercent * 6) % 1

    this.hexGraphics.beginPath()
    const scale = 0.92 // Slightly inside the outer border
    this.hexGraphics.moveTo(x + corners[0].x * scale, y + corners[0].y * scale)

    for (let i = 1; i <= numSides && i <= 6; i++) {
      if (i === numSides && partialSide > 0 && i <= 6) {
        // Partial side
        const prevCorner = corners[(i - 1) % 6]
        const nextCorner = corners[i % 6]
        const partialX = prevCorner.x + (nextCorner.x - prevCorner.x) * partialSide
        const partialY = prevCorner.y + (nextCorner.y - prevCorner.y) * partialSide
        this.hexGraphics.lineTo(x + partialX * scale, y + partialY * scale)
      } else {
        this.hexGraphics.lineTo(x + corners[i % 6].x * scale, y + corners[i % 6].y * scale)
      }
    }

    this.hexGraphics.strokePath()
  }

  updateSoldierIcon(province, x, y) {
    const key = `${province.q},${province.r}`
    const soldiers = getSoldiers(province)

    let soldierText = this.soldierIcons.get(key)

    if (soldiers > 0) {
      if (!soldierText) {
        soldierText = this.add.text(0, 0, '', {
          fontSize: '10px',
          fontFamily: 'Arial',
          color: '#ffffff',
          backgroundColor: '#374151',
          padding: { x: 2, y: 1 }
        })
        soldierText.setOrigin(0.5, 0.5)
        soldierText.setDepth(10)
        this.soldierIcons.set(key, soldierText)
      }

      // Position at bottom-left of hex
      soldierText.setPosition(x - 14, y + 16)
      soldierText.setText(`⚔${soldiers}`)
      soldierText.setVisible(true)
    } else {
      if (soldierText) {
        soldierText.setVisible(false)
      }
    }
  }

  updateCombatIcon(province, x, y) {
    const key = `${province.q},${province.r}`
    const combatStatus = getCombatStatus(province, this.mapData)

    let combatText = this.combatIcons.get(key)

    if (combatStatus.inCombat) {
      if (!combatText) {
        combatText = this.add.text(0, 0, '', {
          fontSize: '14px'
        })
        combatText.setOrigin(0.5, 0.5)
        combatText.setDepth(15)
        this.combatIcons.set(key, combatText)
      }

      // Position at top-right of hex, show crossed swords
      combatText.setPosition(x + 14, y - 16)
      combatText.setText('⚔️')
      combatText.setVisible(true)
    } else {
      if (combatText) {
        combatText.setVisible(false)
      }
    }
  }

  updateBuildingIcon(province, x, y) {
    const key = `${province.q},${province.r}`

    // Get or create building icon text
    let buildingText = this.buildingIcons.get(key)
    let productText = this.productIcons.get(key)

    if (province.building) {
      const buildingType = getBuildingType(province.building.type)
      const buildingIcon = buildingType?.icon || '🏗️'

      // Determine if under construction
      const isConstructing = province.building.constructionProgress > 0
      const isUpgrading = province.building.upgradeProgress > 0

      // Create building text if doesn't exist
      if (!buildingText) {
        buildingText = this.add.text(0, 0, '', {
          fontSize: '20px',
          align: 'center'
        })
        buildingText.setOrigin(0.5, 0.5)
        this.buildingIcons.set(key, buildingText)
      }

      // Update building icon position and text
      buildingText.setPosition(x, y - 4)

      if (isConstructing) {
        buildingText.setText('🔨')
        buildingText.setAlpha(0.7)
      } else if (isUpgrading) {
        buildingText.setText(buildingIcon)
        buildingText.setAlpha(0.7)
      } else {
        buildingText.setText(buildingIcon)
        buildingText.setAlpha(1)
      }

      // Create product text if doesn't exist
      if (!productText) {
        productText = this.add.text(0, 0, '', {
          fontSize: '12px',
          align: 'center'
        })
        productText.setOrigin(0.5, 0.5)
        this.productIcons.set(key, productText)
      }

      // Determine product icon
      let productIcon = ''

      if (!isConstructing) {
        if (province.building.type === 'factory') {
          if (province.building.recipe) {
            const recipe = getRecipe(province.building.recipe)
            if (recipe && recipe.outputs && recipe.outputs[0]) {
              const good = getGood(recipe.outputs[0].good)
              productIcon = good?.icon || '📦'
            }
          } else {
            // No recipe set - show empty/question icon
            productIcon = '❓'
          }
        } else if (province.building.type === 'recruitmentCenter') {
          productIcon = '⚔️'
        }
      }

      // Update product icon position (bottom-right of building icon)
      productText.setPosition(x + 10, y + 10)
      productText.setText(productIcon)
      productText.setAlpha(isConstructing ? 0 : 0.9)

    } else {
      // No building - hide icons if they exist
      if (buildingText) {
        buildingText.setText('')
      }
      if (productText) {
        productText.setText('')
      }
    }
  }

  handleClick(pointer) {
    if (pointer.rightButtonDown()) return

    // Convert click to hex coordinates
    const worldX = pointer.x - this.mapOffset.x
    const worldY = pointer.y - this.mapOffset.y
    const hex = pixelToAxial(worldX, worldY)

    // Check if hex exists in map
    const province = this.mapData.getProvince(hex.q, hex.r)

    if (province) {
      this.selectedHex = { q: hex.q, r: hex.r }
      this.drawMap()

      // Emit event for info panel
      this.events.emit('provinceSelected', province)

      // Also emit on game events for external listeners
      this.game.events.emit('provinceSelected', province)
    }
  }

  onResize(gameSize) {
    // Redraw on resize
    this.drawMap()
  }

  update() {
    // Game logic runs here
  }

  /**
   * Draw railroads connected to selected hex
   */
  drawRailroads() {
    this.railroadGraphics.clear()

    if (!this.selectedHex || !GameState.railroads) return

    const selectedKey = `${this.selectedHex.q},${this.selectedHex.r}`

    for (const railroad of GameState.railroads) {
      const sourceKey = `${railroad.sourceQ},${railroad.sourceR}`
      const destKey = `${railroad.destQ},${railroad.destR}`

      // Only show railroads connected to selected hex
      if (sourceKey === selectedKey || destKey === selectedKey) {
        this.drawRailroadLine(railroad, sourceKey === selectedKey)
      }
    }
  }

  /**
   * Draw a single railroad line
   */
  drawRailroadLine(railroad, isOutgoing) {
    const sourcePixel = axialToPixel(railroad.sourceQ, railroad.sourceR)
    const destPixel = axialToPixel(railroad.destQ, railroad.destR)

    const x1 = sourcePixel.x + this.mapOffset.x
    const y1 = sourcePixel.y + this.mapOffset.y
    const x2 = destPixel.x + this.mapOffset.x
    const y2 = destPixel.y + this.mapOffset.y

    // Color: green for outgoing, blue for incoming
    const color = isOutgoing ? 0x4ade80 : 0x60a5fa

    // Opacity: 40% if under construction, 80% if operational
    const alpha = railroad.constructionProgress > 0 ? 0.4 : 0.8

    // Draw dashed line
    this.railroadGraphics.lineStyle(3, color, alpha)
    this.drawDashedLine(x1, y1, x2, y2, 8, 4)

    // Draw arrow at destination
    this.drawArrow(x1, y1, x2, y2, color, alpha)
  }

  /**
   * Draw a dashed line
   */
  drawDashedLine(x1, y1, x2, y2, dashLength, gapLength) {
    const dx = x2 - x1
    const dy = y2 - y1
    const distance = Math.sqrt(dx * dx + dy * dy)
    const unitX = dx / distance
    const unitY = dy / distance

    let pos = 0
    while (pos < distance) {
      const startX = x1 + unitX * pos
      const startY = y1 + unitY * pos
      const endPos = Math.min(pos + dashLength, distance)
      const endX = x1 + unitX * endPos
      const endY = y1 + unitY * endPos

      this.railroadGraphics.beginPath()
      this.railroadGraphics.moveTo(startX, startY)
      this.railroadGraphics.lineTo(endX, endY)
      this.railroadGraphics.strokePath()

      pos += dashLength + gapLength
    }
  }

  /**
   * Draw an arrow at the end of a line
   */
  drawArrow(x1, y1, x2, y2, color, alpha) {
    const dx = x2 - x1
    const dy = y2 - y1
    const angle = Math.atan2(dy, dx)

    const arrowSize = 10
    const arrowAngle = Math.PI / 6

    // Arrow is positioned slightly before the destination
    const arrowX = x2 - Math.cos(angle) * 15
    const arrowY = y2 - Math.sin(angle) * 15

    this.railroadGraphics.fillStyle(color, alpha)
    this.railroadGraphics.beginPath()
    this.railroadGraphics.moveTo(arrowX, arrowY)
    this.railroadGraphics.lineTo(
      arrowX - arrowSize * Math.cos(angle - arrowAngle),
      arrowY - arrowSize * Math.sin(angle - arrowAngle)
    )
    this.railroadGraphics.lineTo(
      arrowX - arrowSize * Math.cos(angle + arrowAngle),
      arrowY - arrowSize * Math.sin(angle + arrowAngle)
    )
    this.railroadGraphics.closePath()
    this.railroadGraphics.fillPath()
  }

  /**
   * Draw railroad build preview
   */
  drawRailroadPreview(previewData, mouseX, mouseY) {
    this.railroadGraphics.clear()

    // First draw existing railroads
    this.drawRailroads()

    const { sourceHex, destHex, valid, path, cost, lossPercent, distance, reason } = previewData

    const sourcePixel = axialToPixel(sourceHex.q, sourceHex.r)
    const destPixel = axialToPixel(destHex.q, destHex.r)

    const x1 = sourcePixel.x + this.mapOffset.x
    const y1 = sourcePixel.y + this.mapOffset.y
    const x2 = destPixel.x + this.mapOffset.x
    const y2 = destPixel.y + this.mapOffset.y

    // Color based on validity
    const color = valid ? 0x4ade80 : 0xf87171

    // Draw preview line
    this.railroadGraphics.lineStyle(3, color, 0.6)
    this.drawDashedLine(x1, y1, x2, y2, 8, 4)

    // Highlight path hexes
    if (path) {
      for (const hex of path) {
        const pixel = axialToPixel(hex.q, hex.r)
        const hx = pixel.x + this.mapOffset.x
        const hy = pixel.y + this.mapOffset.y
        this.railroadGraphics.fillStyle(color, 0.2)
        this.railroadGraphics.fillCircle(hx, hy, 12)
      }
    }

    // Update tooltip
    let tooltipText
    if (valid) {
      tooltipText = `Cost: ${cost} gold\nDistance: ${distance} tiles\nLoss: ${lossPercent}%`
    } else {
      tooltipText = reason || 'Invalid'
    }

    this.previewTooltip.setText(tooltipText)
    this.previewTooltip.setPosition(mouseX + 15, mouseY + 15)
    this.previewTooltip.setVisible(true)

    // Set tooltip background color
    this.previewTooltip.setBackgroundColor(valid ? '#1a4a7a' : '#7a1a1a')
  }

  /**
   * Hide railroad preview
   */
  hideRailroadPreview() {
    this.railroadBuildMode = false
    railroadBuilder.reset()
    this.previewTooltip.setVisible(false)
    this.railroadGraphics.clear()
    this.drawRailroads()
  }

  /**
   * Draw persistent Army HQ projection arrows
   */
  drawProjectionArrows() {
    this.projectionGraphics.clear()

    for (const province of this.mapData.getAllProvinces()) {
      // Only show for player's HQs
      if (!isOwnedByPlayer(province, GameState.currentPlayerId)) continue
      if (!province.building || province.building.type !== 'armyHQ') continue

      const hqSummary = getHQSummary(province, this.mapData)
      if (!hqSummary || !hqSummary.operational) continue
      if (!hqSummary.projection.enabled) continue

      // Draw the arrow from HQ to target
      this.drawHQProjectionArrow(
        province,
        hqSummary.projection,
        hqSummary.distribution,
        hqSummary.front,
        hqSummary.radius
      )
    }
  }

  /**
   * Draw an HQ projection arrow with distribution visualization
   */
  drawHQProjectionArrow(hqProvince, projection, distribution, front, radius) {
    const hqPixel = axialToPixel(hqProvince.q, hqProvince.r)
    const hx = hqPixel.x + this.mapOffset.x
    const hy = hqPixel.y + this.mapOffset.y

    const targetPixel = axialToPixel(projection.targetQ, projection.targetR)
    const tx = targetPixel.x + this.mapOffset.x
    const ty = targetPixel.y + this.mapOffset.y

    // Draw projection radius indicator (subtle circle)
    this.projectionGraphics.lineStyle(1, 0x4ade80, 0.2)
    this.projectionGraphics.strokeCircle(hx, hy, radius * HEX_SIZE * 1.5)

    // Draw main arrow from HQ to target
    const arrowColor = 0x22c55e  // Green for player
    this.drawProjectionMainArrow(hx, hy, tx, ty, arrowColor, projection.width)

    // Draw spread fan lines based on width
    if (projection.width > 0.1) {
      this.drawSpreadFan(hx, hy, tx, ty, projection.width, arrowColor)
    }

    // Highlight front tiles with soldier distribution
    for (const deploy of distribution) {
      const pixel = axialToPixel(deploy.q, deploy.r)
      const fx = pixel.x + this.mapOffset.x
      const fy = pixel.y + this.mapOffset.y

      // Draw soldier count bubble
      const bubbleRadius = Math.min(18, Math.max(10, deploy.soldiers / 5 + 8))
      this.projectionGraphics.fillStyle(0x22c55e, 0.6)
      this.projectionGraphics.fillCircle(fx, fy, bubbleRadius)

      // Draw the count (handled by Phaser text objects - simplified here)
      this.projectionGraphics.lineStyle(2, 0xffffff, 0.5)
      this.projectionGraphics.strokeCircle(fx, fy, bubbleRadius)
    }
  }

  /**
   * Draw the main projection arrow
   */
  drawProjectionMainArrow(x1, y1, x2, y2, color, width) {
    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Arrow thickness based on width setting
    const thickness = 4 + width * 4

    // Draw curved arrow body
    const perpX = -dy / dist
    const perpY = dx / dist
    const curveAmount = 15

    const midX = (x1 + x2) / 2 + perpX * curveAmount
    const midY = (y1 + y2) / 2 + perpY * curveAmount

    this.projectionGraphics.lineStyle(thickness, color, 0.7)
    this.projectionGraphics.beginPath()
    this.projectionGraphics.moveTo(x1, y1)

    // Quadratic curve
    const steps = 15
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const invT = 1 - t
      const px = invT * invT * x1 + 2 * invT * t * midX + t * t * x2
      const py = invT * invT * y1 + 2 * invT * t * midY + t * t * y2
      this.projectionGraphics.lineTo(px, py)
    }
    this.projectionGraphics.strokePath()

    // Draw arrowhead
    const angle = Math.atan2(y2 - midY, x2 - midX)
    const arrowSize = thickness + 6
    const arrowAngle = Math.PI / 5

    this.projectionGraphics.fillStyle(color, 0.8)
    this.projectionGraphics.beginPath()
    this.projectionGraphics.moveTo(x2, y2)
    this.projectionGraphics.lineTo(
      x2 - arrowSize * Math.cos(angle - arrowAngle),
      y2 - arrowSize * Math.sin(angle - arrowAngle)
    )
    this.projectionGraphics.lineTo(
      x2 - arrowSize * Math.cos(angle + arrowAngle),
      y2 - arrowSize * Math.sin(angle + arrowAngle)
    )
    this.projectionGraphics.closePath()
    this.projectionGraphics.fillPath()
  }

  /**
   * Draw spread fan lines showing projection cone
   */
  drawSpreadFan(x1, y1, x2, y2, width, color) {
    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)

    // Fan angle based on width (0 = 0 degrees, 1 = 60 degrees)
    const fanAngle = width * Math.PI / 3

    const fanLength = dist * 0.7

    // Draw fan lines
    this.projectionGraphics.lineStyle(1, color, 0.3)

    // Left fan line
    const leftAngle = angle - fanAngle / 2
    this.projectionGraphics.beginPath()
    this.projectionGraphics.moveTo(x1, y1)
    this.projectionGraphics.lineTo(
      x1 + Math.cos(leftAngle) * fanLength,
      y1 + Math.sin(leftAngle) * fanLength
    )
    this.projectionGraphics.strokePath()

    // Right fan line
    const rightAngle = angle + fanAngle / 2
    this.projectionGraphics.beginPath()
    this.projectionGraphics.moveTo(x1, y1)
    this.projectionGraphics.lineTo(
      x1 + Math.cos(rightAngle) * fanLength,
      y1 + Math.sin(rightAngle) * fanLength
    )
    this.projectionGraphics.strokePath()

    // Draw arc connecting fan lines
    this.projectionGraphics.beginPath()
    this.projectionGraphics.arc(x1, y1, fanLength * 0.5, leftAngle, rightAngle)
    this.projectionGraphics.strokePath()
  }

  /**
   * Draw projection arrow build preview
   */
  drawProjectionPreview(previewData, mouseX, mouseY) {
    this.projectionGraphics.clear()

    // First draw existing projection arrows
    this.drawProjectionArrows()

    const { hqProvince, targetHex, width, front, distribution, valid, reason, radius } = previewData

    const hqPixel = axialToPixel(hqProvince.q, hqProvince.r)
    const hx = hqPixel.x + this.mapOffset.x
    const hy = hqPixel.y + this.mapOffset.y

    const targetPixel = axialToPixel(targetHex.q, targetHex.r)
    const tx = targetPixel.x + this.mapOffset.x
    const ty = targetPixel.y + this.mapOffset.y

    // Draw projection radius
    const previewColor = valid ? 0x4ade80 : 0xf87171
    this.projectionGraphics.lineStyle(2, previewColor, 0.3)
    this.projectionGraphics.strokeCircle(hx, hy, radius * HEX_SIZE * 1.5)

    // Highlight front tiles
    for (const tile of front) {
      const pixel = axialToPixel(tile.q, tile.r)
      const fx = pixel.x + this.mapOffset.x
      const fy = pixel.y + this.mapOffset.y

      this.projectionGraphics.fillStyle(previewColor, 0.2)
      this.projectionGraphics.fillCircle(fx, fy, 16)
    }

    // Draw preview arrow
    this.drawProjectionMainArrow(hx, hy, tx, ty, previewColor, width)

    // Draw spread fan
    if (width > 0.1) {
      this.drawSpreadFan(hx, hy, tx, ty, width, previewColor)
    }

    // Show soldier distribution preview
    for (const deploy of distribution) {
      const pixel = axialToPixel(deploy.q, deploy.r)
      const fx = pixel.x + this.mapOffset.x
      const fy = pixel.y + this.mapOffset.y

      const bubbleRadius = Math.min(18, Math.max(10, deploy.soldiers / 5 + 8))
      this.projectionGraphics.fillStyle(previewColor, 0.5)
      this.projectionGraphics.fillCircle(fx, fy, bubbleRadius)
    }

    // Update tooltip
    let tooltipText
    if (valid) {
      const widthPercent = Math.round(width * 100)
      tooltipText = `Target: (${targetHex.q},${targetHex.r})\nWidth: ${widthPercent}%\nFront tiles: ${front.length}\nScroll to adjust width`
    } else {
      tooltipText = reason || 'Invalid target'
    }

    this.previewTooltip.setText(tooltipText)
    this.previewTooltip.setPosition(mouseX + 15, mouseY + 15)
    this.previewTooltip.setVisible(true)
    this.previewTooltip.setBackgroundColor(valid ? '#1a4a7a' : '#7a1a1a')
  }

  /**
   * Hide projection preview
   */
  hideProjectionPreview() {
    this.projectionBuildMode = false
    projectionArrowBuilder.reset()
    this.previewTooltip.setVisible(false)
    this.projectionGraphics.clear()
    this.drawProjectionArrows()
  }
}
