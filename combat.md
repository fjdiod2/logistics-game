# Combat System Design

## Overview

Combat in Logistics Game is a war of attrition, not tactical maneuvering. Soldiers flow like resources through the logistics network. Victory comes from superior production and supply lines, not clever positioning.

## Core Concept:
COMBAT: is then to enemy tiles both have soldiers, it causes ATTRITION to both sides.
ATTRITION: is the loss of soldiers per turn.
CONTROL: acts like a "health-bar" for a province but reversed, once enemy fills it he take control of the province. Can only be filled if tile has no soldiers

## Core Concept: Soldiers as Resources

Soldiers are stored in `transportStorage.soldiers` just like any other good. This means:
- Recruitment centers produce soldiers into local storage
- Soldiers auto-deploy to the field each turn
- Soldiers can be transported via railroad to reinforce other provinces
- Transport capacity limits how fast you can move armies

## Three Combat States

### 1. COMBAT (Mutual Attrition)
When two enemy provinces both have soldiers, they fight. Both sides lose soldiers each turn based on:
- Base attrition rate (5% of soldiers)
- Terrain modifiers (mountains favor defenders, plains are neutral)
- Soldier ratio (outnumbering the enemy reduces your losses)

**Example:** 50 soldiers vs 50 soldiers on plains = ~2-3 losses each per turn.

### 2. CONTROL (Territory Capture)
When your soldiers border an undefended enemy province, you project control:
- Control accumulates each turn based on soldier count
- At 100% control, the province changes ownership
- Multiple provinces can project control simultaneously (additive)
- Projecting control causes occupation attrition (half combat rate)

### 3. DECAY (Control Fades)
When no enemy soldiers threaten a province:
- Accumulated enemy control decays 10% per turn

## Terrain Effects

Terrain acts as a modifier to attrition:

## Soldier Ratio Modifier

Having more soldiers than the enemy reduces your attrition:

