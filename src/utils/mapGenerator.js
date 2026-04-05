// Random map generator
import { MapData } from '../data/MapData.js'
import { getTerrainIds } from '../data/terrains.js'
import { getResourcesForTerrain } from '../data/resources.js'
import { generateMapCoords } from './hexUtils.js'
import { createOwnershipMask, applyOwnershipToMap, getOwnershipConfig } from '../systems/Ownership.js'

// Simple seeded random for reproducible maps
function createRandom(seed) {
  let s = seed
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// Simple noise function for terrain generation
function noise2D(x, y, seed) {
  const random = createRandom(seed + x * 374761393 + y * 668265263)
  return random()
}

// Smoothed noise with neighbors
function smoothNoise(x, y, seed, scale = 0.1) {
  const sx = x * scale
  const sy = y * scale
  const x0 = Math.floor(sx)
  const y0 = Math.floor(sy)
  const fx = sx - x0
  const fy = sy - y0

  const n00 = noise2D(x0, y0, seed)
  const n10 = noise2D(x0 + 1, y0, seed)
  const n01 = noise2D(x0, y0 + 1, seed)
  const n11 = noise2D(x0 + 1, y0 + 1, seed)

  const nx0 = n00 * (1 - fx) + n10 * fx
  const nx1 = n01 * (1 - fx) + n11 * fx

  return nx0 * (1 - fy) + nx1 * fy
}

// Determine terrain based on noise values
function selectTerrain(elevation, moisture) {
  if (elevation < 0.3) return 'water'
  if (elevation > 0.8) return 'mountains'
  if (elevation > 0.65) {
    return moisture > 0.5 ? 'forest' : 'tundra'
  }
  if (moisture < 0.3) return 'desert'
  if (moisture > 0.6) return 'forest'
  return 'plains'
}

// Maybe add a resource to a province
function maybeAddResource(terrain, random) {
  const resources = getResourcesForTerrain(terrain)
  if (resources.length === 0) return []

  // 30% chance of having a resource
  if (random() > 0.3) return []

  // Pick a random valid resource
  const resource = resources[Math.floor(random() * resources.length)]
  return [resource.id]
}

// Generate province name
function generateName(q, r, terrain, random) {
  const prefixes = {
    plains: ['Green', 'Golden', 'Vast', 'Sunny', 'Fertile'],
    forest: ['Dark', 'Ancient', 'Whispering', 'Deep', 'Wild'],
    mountains: ['High', 'Iron', 'Storm', 'Eagle', 'Frozen'],
    water: ['Blue', 'Crystal', 'Misty', 'Silver', 'Calm'],
    desert: ['Burning', 'Red', 'Endless', 'Sun', 'Dry'],
    tundra: ['Frost', 'White', 'Cold', 'Ice', 'Pale']
  }

  const suffixes = {
    plains: ['Fields', 'Valley', 'Meadow', 'Prairie', 'Lands'],
    forest: ['Woods', 'Grove', 'Thicket', 'Wilds', 'Forest'],
    mountains: ['Peak', 'Ridge', 'Summit', 'Heights', 'Cliffs'],
    water: ['Bay', 'Lake', 'Waters', 'Sea', 'Shallows'],
    desert: ['Wastes', 'Dunes', 'Flats', 'Sands', 'Barrens'],
    tundra: ['Reach', 'Expanse', 'Wastes', 'Plains', 'Tundra']
  }

  const pre = prefixes[terrain] || prefixes.plains
  const suf = suffixes[terrain] || suffixes.plains

  const prefix = pre[Math.floor(random() * pre.length)]
  const suffix = suf[Math.floor(random() * suf.length)]

  return `${prefix} ${suffix}`
}

// Main generator function
export function generateMap(options = {}) {
  const {
    width = 12,
    height = 10,
    seed = Date.now(),
    name = 'Generated Map',
    ownershipMode = null,
    ownershipMask = null
  } = options

  const random = createRandom(seed)
  const coords = generateMapCoords(width, height)

  const mapData = new MapData({ name, width, height })

  for (const { q, r } of coords) {
    // Generate noise for this position
    const elevation = smoothNoise(q, r, seed, 0.15)
    const moisture = smoothNoise(q, r, seed + 1000, 0.12)

    const terrain = selectTerrain(elevation, moisture)
    const resources = maybeAddResource(terrain, random)
    const provinceName = generateName(q, r, terrain, random)

    mapData.setProvince(q, r, {
      terrain,
      resources,
      name: provinceName
    })
  }

  // Apply ownership to all provinces
  const ownershipConfig = getOwnershipConfig()
  const mode = ownershipMode || ownershipConfig.defaultSplit
  const maskFn = createOwnershipMask(mode, width, height, ownershipMask)
  applyOwnershipToMap(mapData, maskFn)

  return mapData
}

// Generate and export as JSON
export function generateMapJSON(options = {}) {
  const mapData = generateMap(options)
  return mapData.toJSON()
}
