# Logistics Game

A hex-based strategy game focused on logistics and resource management. Players manage provinces, extract resources, build factories, recruit soldiers, and connect territories via railroads. The core gameplay loop emphasizes supply chains and economic warfare over tactical combat.

If you need to implement somthing for COMBAT, you may consult combat.md for design directions.

## Project Structure

```
src/
├── main.js                    # Entry point, initializes Phaser game and connects UI components
├── data/
│   ├── gameConfig.js          # All balance values and configuration constants in one place
│   ├── MapData.js             # Province data structure and map storage/retrieval
│   ├── buildings.js           # Building types, recipes, and goods definitions
│   ├── resources.js           # Natural resource types (iron, food, wood, etc.)
│   └── terrains.js            # Terrain types with movement costs, build limits, and population
├── systems/
│   ├── GameState.js           # Global game state singleton (treasury, turn, railroads)
│   ├── Economy.js             # Turn processing: growth, taxes, production, combat phases
│   ├── Building.js            # Building construction, upgrades, factory/recruitment production
│   ├── Extractor.js           # Resource extraction from terrain
│   ├── Railroad.js            # Railroad construction, transport, and distribution logic
│   ├── Combat.js              # Soldier combat, control projection, and territory capture
│   └── Ownership.js           # Player ownership checks and fog-of-war helpers
├── scenes/
│   └── MapScene.js            # Phaser scene rendering hex map, buildings, soldiers, and arrows
├── ui/
│   ├── TopBar.js              # Top HUD showing treasury, population, soldiers, turn controls
│   ├── InfoPanel.js           # Side panel displaying selected province details
│   ├── BuildMenu.js           # Modal for building/recipe selection
│   └── RailroadBuilder.js     # Railroad placement preview and validation
└── utils/
    ├── hexUtils.js            # Hex grid math (axial coords, pixel conversion, neighbors)
    └── mapGenerator.js        # Procedural map generation with terrain and resources

index.html                     # Game HTML with embedded CSS styles
vite.config.js                 # Vite bundler configuration
```
