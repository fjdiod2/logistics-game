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
import { isOwnedByPlayer } from '../systems/Ownership.js'
import { getSoldiers, getCombatStatus } from '../systems/Combat.js'
import { GAME_CONFIG } from '../data/gameConfig.js'

export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene')
    this.mapData = null
    this.hexGraphics = null
    this.railroadGraphics = null
    this.selectedHex = null
    this.mapOffset = { x: 100, y: 80 }
    this.buildingIcons = new Map()  // Track building icon text objects
    this.productIcons = new Map()   // Track product icon text objects
    this.soldierIcons = new Map()   // Track soldier count text objects
    this.combatIcons = new Map()    // Track combat indicator text objects
    this.controlGraphics = null     // Graphics for control projection arrows
    this.railroadBuildMode = false
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
    })

    // Listen for turn processed to redraw map
    this.game.events.on('turnProcessed', () => {
      this.drawMap()
      this.drawRailroads()
    })

    // Listen for railroad build start
    this.game.events.on('startRailroadBuild', (sourceHex) => {
      this.railroadBuildMode = true
      railroadBuilder.startBuild(sourceHex.q, sourceHex.r)
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
}
