/**
 * The Stone Temple: rules and world, with no canvas and no React in sight so
 * the whole thing can be exercised headlessly.
 *
 * Everything is measured in BLOCKS, converted to pixels only when drawing.
 * The world is top-down, and a jump is a hop over a gap rather than a climb:
 * while you are in the air a ravine underneath you does not matter, and you
 * only fall if the tile beneath you is empty at the moment you land.
 *
 * The temple runs corridor -> main room -> boss room, left to right.
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
}

export const stack = (kind, count = 1) => ({ kind, count })
export const isSword = (slot) => !!(slot && ITEMS[slot.kind]?.sword)
export const isPlaceable = (slot) => !!(slot && ITEMS[slot.kind]?.placeable)
export const isStaff = (slot) => !!(slot && ITEMS[slot.kind]?.staff)

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

// ---------------------------------------------------------------- the world

export const FLOOR = 0
export const WALL = 1
export const VOID = 2

export const WORLD_W = 126
export const WORLD_H = 38

/** Corridor, then a big room, then a bigger one, with a door between. */
export const CORRIDOR = { x0: 1, x1: 31, y0: 15, y1: 23 }
export const MAIN_ROOM = { x0: 32, x1: 72, y0: 4, y1: 34 }
export const DOOR = { x: 73, y0: 4, y1: 34 }
export const BOSS_ROOM = { x0: 74, x1: 124, y0: 2, y1: 36 }

/** A one-block ravine to learn on, then a three-block one that needs a sprint. */
export const RAVINES = [
  { x: 10, w: 1 },
  { x: 20, w: 3 },
]

export const inRect = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1

export function buildWorld() {
  const tiles = []
  for (let y = 0; y < WORLD_H; y++) tiles.push(new Array(WORLD_W).fill(WALL))

  const carve = (r) => {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) tiles[y][x] = FLOOR
    }
  }
  carve(CORRIDOR)
  carve(MAIN_ROOM)
  carve(BOSS_ROOM)
  // The door column stays walled until the gate equation is solved.

  for (const r of RAVINES) {
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = CORRIDOR.y0; y <= CORRIDOR.y1; y++) tiles[y][x] = VOID
    }
  }
  return tiles
}

/** Slide the two halves of the gate apart for good. */
export function openDoor(world) {
  for (let y = DOOR.y0; y <= DOOR.y1; y++) world[y][DOOR.x] = FLOOR
}

/** The gate splits across the middle; the top half rises, the bottom drops. */
export const DOOR_SPLIT = Math.floor((DOOR.y0 + DOOR.y1) / 2)
export const DOOR_TIME = 1.6 // seconds for the halves to slide clear

export const SPAWN = { x: 3.5, y: 19.5 }

/** Signs sit on the floor and say their piece when clicked. */
export const SIGNS = [
  { id: 'move', x: 5, y: 18, text: 'Use WASD to move' },
  { id: 'jump', x: 8, y: 19, text: 'SPACE to jump' },
  { id: 'sprint', x: 17, y: 19, text: 'LEFT SHIFT to sprint' },
]

/** Loose items, picked up by walking over them. */
export const GROUND_ITEMS = [
  { id: 'sword', x: 26, y: 19, item: { kind: 'sword', count: 1 } },
  { id: 'cobble', x: 29, y: 19, item: { kind: 'cobblestone', count: 64 } },
]

/** Three graves against each of the main room's four walls. */
export const TOMBSTONES = [
  { x: 42, y: 5 }, { x: 52, y: 5 }, { x: 62, y: 5 }, // top
  { x: 42, y: 33 }, { x: 52, y: 33 }, { x: 62, y: 33 }, // bottom
  { x: 33, y: 8 }, { x: 33, y: 19 }, { x: 33, y: 30 }, // left
  { x: 71, y: 8 }, { x: 71, y: 19 }, { x: 71, y: 30 }, // right
]

/**
 * Where an equation can be worked: the gate, then two in the boss room. The
 * boss room's two are told apart by colour, and each one has its own set of
 * buttons scattered about in the same colour.
 */
export const CONSOLES = [
  { id: 'gate', x: 69, y: 19, tone: 'plain' },
  { id: 'boss-a', x: 119, y: 6, tone: 'red' },
  { id: 'boss-b', x: 119, y: 32, tone: 'blue' },
]
export const CONSOLE_RANGE = 3.5

// ------------------------------------------------------------ button blocks

export const OP_KINDS = [
  { kind: 'add', symbol: '+' },
  { kind: 'sub', symbol: '−' },
  { kind: 'mul', symbol: '×' },
  { kind: 'div', symbol: '÷' },
]
export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** How close you have to be to a block for standing on it to count. */
export const PAD_RANGE = 0.8
/** Blocks are kept this far apart, so you never press two at once. */
export const PAD_SPACING = 2
export const MAX_DIGITS = 4

/**
 * One set of buttons - four operations and the nine digits - dropped around a
 * room. They are spread out on purpose: you have to cross the floor to build
 * an instruction rather than tapping it out in one place.
 */
export function scatterButtons(rect, owner, tone, rand, avoid = []) {
  const taken = new Set(avoid.map((a) => key(a.x, a.y)))
  const placed = []
  const wanted = [
    ...OP_KINDS.map((o) => ({ kind: 'op', op: o.kind, symbol: o.symbol })),
    ...DIGITS.map((d) => ({ kind: 'digit', digit: d, symbol: String(d) })),
  ]

  for (const want of wanted) {
    for (let tries = 0; tries < 500; tries++) {
      // Stay a couple of tiles off the walls so nothing hides in a corner.
      const x = rect.x0 + 2 + Math.floor(rand() * (rect.x1 - rect.x0 - 3))
      const y = rect.y0 + 2 + Math.floor(rand() * (rect.y1 - rect.y0 - 3))
      if (taken.has(key(x, y))) continue
      const crowded = [...placed, ...avoid].some(
        (o) => Math.abs(o.x - x) < PAD_SPACING && Math.abs(o.y - y) < PAD_SPACING,
      )
      if (crowded) continue
      taken.add(key(x, y))
      placed.push({
        ...want,
        id: `${owner}:${want.kind === 'op' ? want.op : want.digit}`,
        x,
        y,
        owner,
        tone,
      })
      break
    }
  }
  return placed
}

/** Fixed positions, so the temple is the same room every time you enter it. */
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

function buildButtons() {
  // Nothing may land on a grave, a tablet, the chest or the Gargoyle himself.
  const gargoyleFootprint = []
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      gargoyleFootprint.push({ x: GARGOYLE_HOME.x + dx, y: GARGOYLE_HOME.y + dy })
    }
  }
  const bossKeepOut = [...CONSOLES, CHEST, ...gargoyleFootprint]

  const gate = scatterButtons(MAIN_ROOM, 'gate', 'plain', seeded(7), [...TOMBSTONES, ...CONSOLES])
  const red = scatterButtons(BOSS_ROOM, 'boss-a', 'red', seeded(11), bossKeepOut)
  const blue = scatterButtons(BOSS_ROOM, 'boss-b', 'blue', seeded(23), [...bossKeepOut, ...red])
  return [...gate, ...red, ...blue]
}

export const CHEST = { x: 99, y: 19 }
export const CHEST_RANGE = 1.2

export const key = (x, y) => `${x},${y}`

// ---------------------------------------------------------------- collision

/**
 * Walls, the world's edge and anything the player has built stop movement.
 * `airborne` skips the built blocks only, so a hop clears a cobblestone wall
 * while the temple's own walls still hold you in.
 */
export function isSolid(world, blocks, x, y, airborne = false) {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return true
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
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false
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
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false
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

// ---------------------------------------------------------------- zombies

export const ZOMBIE_HP = 20
export const ZOMBIE_DAMAGE = 2
export const ZOMBIE_SPEED = 1.9 // blocks a second, slower than a walk
export const ZOMBIE_REACH = 0.85
export const ZOMBIE_HIT_COOLDOWN = 1
export const ZOMBIE_R = 0.35

/**
 * The graves get busier as the fight drags on: one every three seconds, one
 * every two after a minute, one a second after two.
 */
export const SPAWN_STEPS = [
  { after: 0, every: 3 },
  { after: 60, every: 2 },
  { after: 120, every: 1 },
]

export function spawnInterval(elapsed) {
  let every = SPAWN_STEPS[0].every
  for (const step of SPAWN_STEPS) if (elapsed >= step.after) every = step.every
  return every
}

// ---------------------------------------------------------------- gargoyle

export const GARGOYLE_SIZE = 4 // four blocks by four blocks
export const GARGOYLE_HP = 60
export const GARGOYLE_HOME = { x: 99, y: 19 }
export const GARGOYLE_SPEED = 1 // one block a second, and only when unstoned
export const GARGOYLE_TURN = Math.PI / 6 // thirty degrees a second
export const GARGOYLE_ARC = Math.PI / 2 // past ninety degrees he turns instead

/** How far past his own edge a swing still lands, and how wide the arc is. */
export const GARGOYLE_REACH = 3
/** A dot-product floor below zero: a little over 200 degrees of forgiveness. */
export const HIT_CONE = -0.2

export const BITE_DAMAGE = 5
export const BITE_REACH = GARGOYLE_SIZE / 2 + 1.5
export const BITE_ARC = Math.PI / 4
export const BITE_COOLDOWN = 2

export const SPIT_EVERY = 1 // a puddle a second
export const SPIT_SPREAD = Math.PI / 9 // "close to you", not exactly at you
export const SPIT_SPEED = 9 // blocks a second, straight over any wall
export const ACID_IMPACT_DAMAGE = 3
export const ACID_TICK_DAMAGE = 1
export const ACID_TICK = 0.5
export const PUDDLE_LIFE = 15
export const PUDDLE_RADIUS = 0.9

export const SUMMON_EVERY = 10 // every tenth puddle, four zombies
export const SUMMON_COUNT = 4
export const PETRIFY_EVERY = 5 // every fifth puddle, three blocks turn to stone
export const PETRIFY_COUNT = 3
export const PETRIFY_RANGE = 3

/** Phases, driven by how many of his two equations have been solved. */
export const gargoylePhase = (solved) =>
  solved >= 2 ? 'true' : solved === 1 ? 'cracked' : 'stone'

/** The shortest way round from angle b to angle a, in radians. */
export function angleDiff(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Facing too far off the player means turning on the spot rather than walking.
 * Returns the new angle and whether he is free to move this frame.
 */
export function turnToward(facing, target, dt) {
  const diff = angleDiff(target, facing)
  if (Math.abs(diff) <= GARGOYLE_ARC) return { facing, canMove: true }
  const step = Math.min(Math.abs(diff) - GARGOYLE_ARC, GARGOYLE_TURN * dt)
  return { facing: facing + Math.sign(diff) * step, canMove: false }
}

/** Three floor tiles near the player, for the petrify attack. */
export function petrifyTargets(world, blocks, player, rand = Math.random, count = PETRIFY_COUNT) {
  const px = Math.floor(player.x)
  const py = Math.floor(player.y)
  const options = []
  for (let dy = -PETRIFY_RANGE; dy <= PETRIFY_RANGE; dy++) {
    for (let dx = -PETRIFY_RANGE; dx <= PETRIFY_RANGE; dx++) {
      if (dx === 0 && dy === 0) continue // never under their feet
      if (Math.hypot(dx, dy) > PETRIFY_RANGE) continue
      const x = px + dx
      const y = py + dy
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue
      if (world[y][x] !== FLOOR || blocks.has(key(x, y))) continue
      options.push({ x, y })
    }
  }
  const out = []
  while (out.length < count && options.length) {
    out.push(options.splice(Math.floor(rand() * options.length), 1)[0])
  }
  return out
}

/** Where four summoned zombies stand, spread around him. */
export function summonRing(centre, count = SUMMON_COUNT, radius = GARGOYLE_SIZE / 2 + 1) {
  const out = []
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count
    out.push({ x: centre.x + Math.cos(a) * radius, y: centre.y + Math.sin(a) * radius })
  }
  return out
}

export const inPuddle = (puddle, x, y) =>
  Math.hypot(puddle.x - x, puddle.y - y) <= PUDDLE_RADIUS

// ---------------------------------------------------------------- the staff

/**
 * The Staff of Stone throws cobblestone. It is worth one heart on contact,
 * and whatever it touches, it leaves a stone block behind on the grid.
 */
export const STAFF_DAMAGE = HEALTH_PER_HEART // one heart
export const STAFF_SPEED = 14 // blocks a second
export const STAFF_RANGE = 12
export const STAFF_COOLDOWN = 0.35
export const STAFF_HIT_R = 0.55

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
    if (c.x < 0 || c.y < 0 || c.x >= WORLD_W || c.y >= WORLD_H) continue
    if (world[c.y][c.x] === WALL) continue
    if (blocks.has(key(c.x, c.y))) continue
    return c
  }
  return null
}

/**
 * Built last, because scattering the blocks needs the whole room laid out
 * first - the graves, the tablets, the chest and the Gargoyle's footprint are
 * all keep-out zones.
 */
export const BUTTONS = buildButtons()

/** Which set of buttons belongs to a given tablet. */
export const buttonsFor = (owner) => BUTTONS.filter((b) => b.owner === owner)
