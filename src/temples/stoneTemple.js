/**
 * The Stone Temple: its map and its monsters, with no canvas and no React in
 * sight so the whole thing can be exercised headlessly.
 *
 * Movement, health, collision and the inventory are the same in every temple,
 * so they live in world.js and are passed straight back out of here - anything
 * that used to import them from this file still can.
 *
 * The temple runs corridor -> main room -> boss room, left to right, and is
 * top-down: a jump is a hop over a gap rather than a climb, so while you are in
 * the air a ravine underneath you does not matter, and you only fall if the
 * tile beneath you is empty at the moment you land.
 */
export * from './world.js'

import {
  angleDiff, carve, FLOOR, key, VOID, WALL, worldH, worldW,
} from './world.js'

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

export function buildWorld() {
  const tiles = []
  for (let y = 0; y < WORLD_H; y++) tiles.push(new Array(WORLD_W).fill(WALL))

  carve(tiles, CORRIDOR, FLOOR)
  carve(tiles, MAIN_ROOM, FLOOR)
  carve(tiles, BOSS_ROOM, FLOOR)
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

// ---------------------------------------------------------------- zombies

export const ZOMBIE_HP = 20
export const ZOMBIE_DAMAGE = 2
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

/** How far past his own edge a swing still lands. */
export const GARGOYLE_REACH = 3

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
      if (x < 0 || y < 0 || x >= worldW(world) || y >= worldH(world)) continue
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

/**
 * Built last, because scattering the blocks needs the whole room laid out
 * first - the graves, the tablets, the chest and the Gargoyle's footprint are
 * all keep-out zones.
 */
export const BUTTONS = buildButtons()

/** Which set of buttons belongs to a given tablet. */
export const buttonsFor = (owner) => BUTTONS.filter((b) => b.owner === owner)
