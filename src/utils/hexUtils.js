// Hex grid utilities
// Using axial coordinates (q, r) with pointy-top hexagons

export const HEX_SIZE = 32 // Radius (center to corner)

// Hex dimensions derived from size
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE
export const HEX_HEIGHT = 2 * HEX_SIZE
export const HEX_VERT_SPACING = HEX_HEIGHT * 0.75

// Direction vectors for 6 neighbors (pointy-top)
const DIRECTIONS = [
  { q: 1, r: 0 },   // East
  { q: 1, r: -1 },  // Northeast
  { q: 0, r: -1 },  // Northwest
  { q: -1, r: 0 },  // West
  { q: -1, r: 1 },  // Southwest
  { q: 0, r: 1 }    // Southeast
]

// Convert axial (q, r) to pixel (x, y)
export function axialToPixel(q, r) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2)
  const y = HEX_SIZE * (3 / 2) * r
  return { x, y }
}

// Convert pixel (x, y) to axial (q, r)
export function pixelToAxial(x, y) {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE
  const r = (2 / 3 * y) / HEX_SIZE
  return axialRound(q, r)
}

// Round fractional axial coordinates to nearest hex
export function axialRound(q, r) {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  let rs = Math.round(s)

  const qDiff = Math.abs(rq - q)
  const rDiff = Math.abs(rr - r)
  const sDiff = Math.abs(rs - s)

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs
  } else if (rDiff > sDiff) {
    rr = -rq - rs
  }

  return { q: rq, r: rr }
}

// Get all 6 neighbor coordinates
export function getNeighbors(q, r) {
  return DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }))
}

// Get neighbor in specific direction (0-5)
export function getNeighbor(q, r, direction) {
  const d = DIRECTIONS[direction]
  return { q: q + d.q, r: r + d.r }
}

// Calculate distance between two hexes
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2
}

// Get corner points for drawing a hex at origin
export function getHexCorners(size = HEX_SIZE) {
  const corners = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30) // Pointy-top starts at -30°
    corners.push({
      x: size * Math.cos(angle),
      y: size * Math.sin(angle)
    })
  }
  return corners
}

// Check if coordinates are within map bounds
export function isInBounds(q, r, width, height) {
  // For offset coordinates conversion
  const col = q + Math.floor(r / 2)
  return col >= 0 && col < width && r >= 0 && r < height
}

// Generate all hex coordinates for a rectangular map
export function generateMapCoords(width, height) {
  const coords = []
  for (let r = 0; r < height; r++) {
    const rOffset = Math.floor(r / 2)
    for (let col = 0; col < width; col++) {
      const q = col - rOffset
      coords.push({ q, r })
    }
  }
  return coords
}
