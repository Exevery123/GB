/**
 * The parts of a temple that are not about any one temple: how fast you walk,
 * how far a jump carries you, what a heart is worth, what counts as solid.
 *
 * Everything here is measured in BLOCKS and converted to pixels only when
 * drawing. Nothing in this file knows how big the map is - the world is a plain
 * array of rows, so its size is read off the array itself and two temples of
 * completely different shapes can share the same movement code.
 */

export const BLOCK = 40 // pixels per block when drawn

// ---------------------------------------------------------------- movement

/** Half the width of the player's body, used for both walls and landings. */
export const BODY_R = 0.35
/** Seconds spent in the air. Speed is what changes, not hang time. */
export const JUMP_TIME = 0.6
/** The gaps a jump has to clear, straight out of the brief. */
export const WALK_GAP = 2.5
export const SPRINT_GAP = 4.5

/**
 * You take off with your body against the near edge and have to land with your
 * middle on the far side, so a jump has to cover the gap plus one body radius.
 * Deriving the speeds from that keeps the two numbers above honest.
 */
export const WALK_SPEED = (WALK_GAP + BODY_R) / JUMP_TIME
export const SPRINT_SPEED = (SPRINT_GAP + BODY_R) / JUMP_TIME

/** How far a jump carries you at a given speed. */
export const jumpDistance = (speed) => speed * JUMP_TIME
/** The widest ravine that jump can clear. */
export const gapCleared = (speed) => jumpDistance(speed) - BODY_R

// ---------------------------------------------------------------- health

export const MAX_HEALTH = 20
export const HEART_COUNT = 10
export const HEALTH_PER_HEART = MAX_HEALTH / HEART_COUNT // two health to a heart
export const HURT_INVULN = 0.6 // seconds of grace after being hit

/**
 * How full the heart at `index` is, counting from the left. Hearts empty from
 * the right, and an odd point of health leaves exactly one of them half full.
 */
export function heartFill(index, health) {
  const full = (index + 1) * HEALTH_PER_HEART
  if (health >= full) return 1
  if (health === full - 1) return 0.5
  return 0
}

// ---------------------------------------------------------------- combat

export const SWORD_DAMAGE = 5
export const JUMP_DAMAGE_MULTIPLIER = 1.5
/** Hitting while airborne is worth half again, rounded down: 5 -> 7. */
export const swingDamage = (airborne) =>
  Math.floor(SWORD_DAMAGE * (airborne ? JUMP_DAMAGE_MULTIPLIER : 1))

export const SWORD_REACH = 1.6
export const SWING_TIME = 0.25

// ---------------------------------------------------------------- blocks

export const MINE_SECONDS = 12
export const PLACE_REACH = 5

// ---------------------------------------------------------------- the staff

/**
 * The Staff of Stone throws cobblestone. It is worth one heart on contact,
 * and whatever it touches, it leaves a stone block behind on the grid. It is
 * an item rather than a temple, so both temples can be thrown at.
 */
export const STAFF_DAMAGE = HEALTH_PER_HEART // one heart
export const STAFF_SPEED = 14 // blocks a second
export const STAFF_RANGE = 12
export const STAFF_COOLDOWN = 0.35
export const STAFF_HIT_R = 0.55

// ---------------------------------------------------------------- inventory

export const HOTBAR_SLOTS = 9
export const INVENTORY_SLOTS = 27 // the 9 x 3 rectangle
export const ARMOR_SLOTS = 4
export const CRAFT_SLOTS = 4 // the 2 x 2 square

export const ITEMS = {
  sword: { name: 'Stone Sword', max: 1, sword: true },
  cobblestone: { name: 'Cobblestone', max: 64, placeable: true },
  stone: { name: 'Stone Block', max: 64, placeable: true },
  staff: { name: 'Staff of Stone', max: 1, staff: true },
  acorn: { name: 'Acorn', max: 64 },
  /**
   * Sand comes out of the eye's hoard. It goes down like cobblestone and comes
   * back up in a second rather than twelve - but put it over a hole and it only
   * holds for a second before it drops through.
   */
  sand: { name: 'Sand', max: 64, placeable: true, mine: 1, falls: true },
  /**
   * A pair of eyes, and only ever a pair. Put both down and each one is the
   * way to the other.
   */
  eye: { name: 'Eye', max: 2, placeable: true, portal: true },
}

export const stack = (kind, count = 1) => ({ kind, count })
export const isSword = (slot) => !!(slot && ITEMS[slot.kind]?.sword)
export const isPlaceable = (slot) => !!(slot && ITEMS[slot.kind]?.placeable)
export const isStaff = (slot) => !!(slot && ITEMS[slot.kind]?.staff)
export const isPortal = (slot) => !!(slot && ITEMS[slot.kind]?.portal)
export const fallsThrough = (kind) => !!ITEMS[kind]?.falls
/** How long that block takes to dig out. */
export const mineSeconds = (kind) => ITEMS[kind]?.mine ?? MINE_SECONDS

/** Put a stack in the first slot that will take it. Returns true if it fit. */
export function addToSlots(slots, incoming) {
  const max = ITEMS[incoming.kind]?.max ?? 64
  if (max > 1) {
    for (const slot of slots) {
      if (slot && slot.kind === incoming.kind && slot.count < max) {
        const room = Math.min(max - slot.count, incoming.count)
        slot.count += room
        incoming.count -= room
        if (incoming.count === 0) return true
      }
    }
  }
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]) {
      slots[i] = stack(incoming.kind, incoming.count)
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------- tiles

export const FLOOR = 0
export const WALL = 1
export const VOID = 2
/**
 * Sandstone. Walkable like any floor, and the only thing about it that is a
 * rule rather than a colour: nothing in the game can break it.
 */
export const SANDSTONE = 3
/** The boss arena's floor. Soul sand is the half of it that holds you back. */
export const SOUL_SOIL = 4
export const SOUL_SAND = 5

/**
 * How fast a walking monster goes. It lives here rather than with the zombies
 * because everything else that moves is quoted against it - a phantom is two
 * and a half zombies.
 */
export const ZOMBIE_SPEED = 1.9

/** How big the map is, read off the map rather than assumed. */
export const worldW = (world) => world[0].length
export const worldH = (world) => world.length

export const inRect = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1

export const key = (x, y) => `${x},${y}`

/** Fill a rectangle of the map with one tile. */
export function carve(tiles, r, tile = FLOOR) {
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) tiles[y][x] = tile
  }
}

// ---------------------------------------------------------------- collision

/**
 * Walls, the world's edge and anything the player has built stop movement.
 * `airborne` skips the built blocks only, so a hop clears a cobblestone wall
 * while the temple's own walls still hold you in.
 */
export function isSolid(world, blocks, x, y, airborne = false) {
  if (x < 0 || y < 0 || x >= worldW(world) || y >= worldH(world)) return true
  if (!airborne && blocks.has(key(x, y))) return true
  return world[y][x] === WALL
}

/** Would a body centred here overlap something solid? */
export function blocked(world, blocks, cx, cy, airborne = false, r = BODY_R) {
  const x0 = Math.floor(cx - r)
  const x1 = Math.floor(cx + r)
  const y0 = Math.floor(cy - r)
  const y1 = Math.floor(cy + r)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (isSolid(world, blocks, x, y, airborne)) return true
    }
  }
  return false
}

/**
 * Move one axis at a time so running into a wall slides along it instead of
 * stopping dead. Long steps are broken up, so nothing is ever tunnelled
 * through at a sprint.
 */
export function stepMove(world, blocks, pos, dx, dy, airborne = false, r = BODY_R) {
  let { x, y } = pos
  const steps = Math.max(1, Math.ceil((Math.abs(dx) + Math.abs(dy)) / 0.1))
  const sx = dx / steps
  const sy = dy / steps
  for (let i = 0; i < steps; i++) {
    if (sx && !blocked(world, blocks, x + sx, y, airborne, r)) x += sx
    if (sy && !blocked(world, blocks, x, y + sy, airborne, r)) y += sy
  }
  return { x, y }
}

/** Standing over a ravine with both feet on the ground means falling in. */
export function overVoid(world, blocks, x, y) {
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= worldW(world) || ty >= worldH(world)) return false
  if (blocks.has(key(tx, ty))) return false
  return world[ty][tx] === VOID
}

/**
 * Landing inside a block you jumped over. Slide on in the direction of travel
 * until there is room to stand; null means there was nowhere to go.
 */
export function landingSpot(world, blocks, p, facing) {
  // Coming down over a ravine is not this function's problem - that is a fall.
  if (!blocked(world, blocks, p.x, p.y)) return p
  const len = Math.hypot(facing.x, facing.y) || 1
  const dx = facing.x / len
  const dy = facing.y / len
  for (let d = 0.05; d <= 2.5; d += 0.05) {
    const x = p.x + dx * d
    const y = p.y + dy * d
    if (!blocked(world, blocks, x, y) && !overVoid(world, blocks, x, y)) return { x, y }
  }
  return null
}

/** A block can go anywhere empty and in range that the player is not standing in. */
export function canPlace(world, blocks, player, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= worldW(world) || ty >= worldH(world)) return false
  if (world[ty][tx] === WALL) return false
  if (blocks.has(key(tx, ty))) return false
  if (Math.hypot(tx + 0.5 - player.x, ty + 0.5 - player.y) > PLACE_REACH) return false
  // Never seal the player inside their own block.
  const nearX = Math.max(tx, Math.min(player.x, tx + 1))
  const nearY = Math.max(ty, Math.min(player.y, ty + 1))
  return Math.hypot(player.x - nearX, player.y - nearY) >= BODY_R
}

export const inReach = (player, tx, ty) =>
  Math.hypot(tx + 0.5 - player.x, ty + 0.5 - player.y) <= PLACE_REACH

/** Did this swing connect? In range, and roughly in the direction faced. */
export function swingHits(player, facing, target, reach = SWORD_REACH) {
  const dx = target.x - player.x
  const dy = target.y - player.y
  const dist = Math.hypot(dx, dy)
  if (dist > reach) return false
  if (dist < 1e-6) return true
  return (dx * facing.x + dy * facing.y) / dist > 0.2
}

/** The nearest point on a square centred on `box` to the point (px, py). */
export function nearestOnBox(px, py, box, half) {
  return {
    x: Math.max(box.x - half, Math.min(px, box.x + half)),
    y: Math.max(box.y - half, Math.min(py, box.y + half)),
  }
}

/** How far outside a square a point is. Zero means it is inside. */
export function distToBox(px, py, box, half) {
  const n = nearestOnBox(px, py, box, half)
  return Math.hypot(n.x - px, n.y - py)
}

/** A dot-product floor below zero: a little over 200 degrees of forgiveness. */
export const HIT_CONE = -0.2

/**
 * Swinging at something the size of a house. Range is measured from its hide
 * rather than its middle, and the cone is wide enough that anywhere you can
 * stand beside it counts - hitting a four-by-four target should never be
 * fiddly.
 */
export function boxHits(player, facing, box, half, reach, cone = HIT_CONE) {
  const near = nearestOnBox(player.x, player.y, box, half)
  const dx = near.x - player.x
  const dy = near.y - player.y
  const dist = Math.hypot(dx, dy)
  if (dist > reach) return false
  if (dist < 1e-6) return true
  return (dx * facing.x + dy * facing.y) / dist > cone
}

/** The shortest way round from angle b to angle a, in radians. */
export function angleDiff(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Where a thrown block comes to rest: the tile it hit, or the last clear one
 * behind it if that tile is already taken. Null means there is nowhere for it.
 */
export function boltLanding(world, blocks, hit, from) {
  const cells = [
    { x: Math.floor(hit.x), y: Math.floor(hit.y) },
    { x: Math.floor(from.x), y: Math.floor(from.y) },
  ]
  for (const c of cells) {
    if (c.x < 0 || c.y < 0 || c.x >= worldW(world) || c.y >= worldH(world)) continue
    if (world[c.y][c.x] === WALL) continue
    if (blocks.has(key(c.x, c.y))) continue
    return c
  }
  return null
}
