// Map data structure and utilities
// Maps are stored as JSON with this structure

import { getTerrain } from './terrains.js'
import { GAME_CONFIG } from './gameConfig.js'

/*
Example map format:
{
  "name": "Example Map",
  "width": 10,
  "height": 8,
  "provinces": [
    {
      "q": 0,
      "r": 0,
      "terrain": "plains",
      "resources": ["food"],
      "name": "Green Valley",
      "population": 100,
      "building": null,
      "workerAllocation": { "extractor": 0, "building": 0 }
    },
    ...
  ]
}
*/

// Create default extractor data for a resource
function createExtractor(resourceId) {
  return {
    resourceId,
    storage: 0,
    capacity: GAME_CONFIG.extractorOutputCapacity
  }
}

// Create default worker allocation
function createWorkerAllocation() {
  return {
    extractor: 0,   // % of population on extraction (0-1)
    building: 0     // % of population in building (0-1)
  }
}

// Create default transport storage
function createTransportStorage() {
  return {}  // { goodId/resourceId: amount }
}

export class MapData {
  constructor(data = {}) {
    this.name = data.name || 'Unnamed Map'
    this.width = data.width || 10
    this.height = data.height || 8
    this.provinces = new Map()

    if (data.provinces) {
      for (const p of data.provinces) {
        this.setProvince(p.q, p.r, p)
      }
    }
  }

  // Create key from axial coordinates
  static key(q, r) {
    return `${q},${r}`
  }

  getProvince(q, r) {
    return this.provinces.get(MapData.key(q, r))
  }

  setProvince(q, r, data) {
    const terrainData = getTerrain(data.terrain || 'plains')

    // Auto-create extractors from resources
    const extractors = {}
    const resources = data.resources || []
    for (const resourceId of resources) {
      extractors[resourceId] = data.extractors?.[resourceId] || createExtractor(resourceId)
    }

    const province = {
      q,
      r,
      terrain: data.terrain || 'plains',
      resources,
      name: data.name || `Province (${q}, ${r})`,

      // Population
      population: data.population ?? terrainData.basePopulation,

      // Player ownership (0 = human, 1 = AI, extensible)
      playerId: data.playerId ?? 0,

      // Building slot (null = empty, object = building data)
      building: data.building || null,

      // Extractors (auto-created from resources)
      extractors,

      // Worker allocation percentages
      workerAllocation: data.workerAllocation || createWorkerAllocation(),

      // Transport storage for goods received via railroad
      transportStorage: data.transportStorage || createTransportStorage(),

      // Combat: control fields
      control: data.control ?? 0,                      // Enemy control level (0 to controlCap)
      controllingPlayerId: data.controllingPlayerId ?? null,  // Who is exerting control (null = none)

      // Cached values (computed each turn)
      _cachedGrowthRate: terrainData.basePopulationGrowth,
      _cachedTaxOutput: 0
    }

    this.provinces.set(MapData.key(q, r), province)
    return province
  }

  // Update a province (partial update)
  updateProvince(q, r, updates) {
    const province = this.getProvince(q, r)
    if (!province) return null

    Object.assign(province, updates)
    return province
  }

  getAllProvinces() {
    return Array.from(this.provinces.values())
  }

  // Get provinces with population (excludes water, etc.)
  getPopulatedProvinces() {
    return this.getAllProvinces().filter(p => p.population > 0)
  }

  // Get total population across all provinces
  getTotalPopulation() {
    return this.getAllProvinces().reduce((sum, p) => sum + p.population, 0)
  }

  // Get provinces with a specific building type
  getProvincesWithBuilding(buildingType) {
    return this.getAllProvinces().filter(
      p => p.building && p.building.type === buildingType
    )
  }

  // Get provinces with available building slots
  getBuildableProvinces() {
    return this.getAllProvinces().filter(p => {
      const terrain = getTerrain(p.terrain)
      const slots = terrain.maxBuildingSlots || 0
      return slots > 0 && !p.building
    })
  }

  // Get all provinces owned by a specific player
  getProvincesByPlayer(playerId) {
    return this.getAllProvinces().filter(p => p.playerId === playerId)
  }

  // Get total population for a specific player
  getPlayerPopulation(playerId) {
    return this.getProvincesByPlayer(playerId).reduce((sum, p) => sum + p.population, 0)
  }

  // Export to JSON format
  toJSON() {
    return {
      name: this.name,
      width: this.width,
      height: this.height,
      provinces: this.getAllProvinces().map(p => ({
        ...p,
        // Don't save cached values
        _cachedGrowthRate: undefined,
        _cachedTaxOutput: undefined
      }))
    }
  }

  // Import from JSON
  static fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json
    return new MapData(data)
  }
}

// Building state structure (for reference)
export const BuildingStateTemplate = {
  type: 'factory',           // building type id
  level: 1,                  // upgrade level (1-4)
  recipe: null,              // recipe id (for factories)
  constructionProgress: 0,   // 0 = not building, >0 = turns remaining
  upgradeProgress: 0,        // 0 = not upgrading, >0 = turns remaining
  storage: {},               // output storage { goodId: amount }
  inputStorage: {}           // input storage { resourceId/goodId: amount }
}
