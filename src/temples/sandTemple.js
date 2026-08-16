/**
 * The Sand Temple: one buried hall, three giant blocks with a letter carved on
 * each, and a Sphinx sitting where a wall ought to be.
 *
 * The puzzle is the whole level. An inscription on the south wall holds an
 * equation with three empty sockets and nothing else - no answer button, no
 * keypad, no hint about which letter it wants. You haul the blocks over one at
 * a time, and only once all three are seated does it name the letter to solve
 * for. From there the only thing that will listen to an answer is the Sphinx.
 *
 * As with the Stone Temple, everything is in BLOCKS; movement, collision and
 * the tile constants come from world.js.
 */
import {
  canonEq, expr, makeGroup, makeTerm, num, powersKey, rAbs, rAdd, rat, rDiv,
  rIsZero, rMul, rNeg, rSign,
} from '../algebra/equation.js'
import {
  angleDiff, BODY_R, carve, FLOOR, key, SANDSTONE, SOUL_SAND, SOUL_SOIL, VOID,
  WALL, ZOMBIE_SPEED,
} from './world.js'

export * from './world.js'

export const WORLD_W = 128
export const WORLD_H = 42

// ---------------------------------------------------------------- the map

/** The buried hall you start in. */
export const HALL = { x0: 1, x1: 46, y0: 10, y1: 37 }

/**
 * The sealed passage above it, running the whole length of the map. Sandstone
 * from end to end, and nothing in the game can break sandstone.
 */
export const CHANNEL = { x0: 9, x1: 124, y0: 2, y1: 5 }

/**
 * Where the north wall should be, and is not. The Sphinx is what is holding
 * the channel shut, so she is solid rock until she fades.
 */
export const SPHINX = { x0: 9, x1: 14, y0: 6, y1: 9 }
export const SPHINX_CENTRE = { x: (SPHINX.x0 + SPHINX.x1 + 1) / 2, y: (SPHINX.y0 + SPHINX.y1 + 1) / 2 }
/** Seconds she takes to fade out once she has her answer. */
export const SPHINX_FADE = 2.6

/** Right underneath her, so she is the first thing you see. */
export const SPAWN = { x: 11.5, y: 13.5 }

/**
 * A sword, half buried in the sand a few steps from where you land. It is only
 * put out if you turned up without one - a second sword would be no use to
 * anybody, and the slot it took would be.
 */
export const GROUND_ITEMS = [
  { id: 'sword', x: 15, y: 14, item: { kind: 'sword', count: 1 } },
]
export const PICKUP_RANGE = 0.7

/** Broken columns, so the hall is not one flat rectangle of sand. */
export const PILLARS = [
  { x: 8, y: 24 }, { x: 14, y: 18 }, { x: 20, y: 28 },
  { x: 30, y: 20 }, { x: 38, y: 30 },
]

/** The way out, at the far end of the channel. */
export const PORTAL = { x0: 119, x1: 120, y0: 2, y1: 5 }
export const PORTAL_CENTRE = { x: (PORTAL.x0 + PORTAL.x1 + 1) / 2, y: (PORTAL.y0 + PORTAL.y1 + 1) / 2 }
export const PORTAL_RANGE = 1.4

/**
 * The carved slab. It is cut into the south wall itself rather than laid on
 * the floor, so you stand in front of it and read up at it.
 */
export const INSCRIPTION = { x0: 20, x1: 27, y0: 38, y1: 39 }
export const INSCRIPTION_CENTRE = { x: (INSCRIPTION.x0 + INSCRIPTION.x1 + 1) / 2, y: INSCRIPTION.y0 }
export const INSCRIPTION_RANGE = 4.5

// ---------------------------------------------------------------- the blocks

/** A variable block is two tiles by two, hence "giant". */
export const BLOCK_SPAN = 2
/** How close you have to be to take hold of one. */
export const CARRY_REACH = 2.6
/**
 * Hauling one costs you three quarters of your speed and the ability to jump.
 * It scales whatever you would have been doing, so a sprint still beats a walk
 * - it is just that both of them are now a crawl.
 */
export const CARRY_SPEED = 0.25

/**
 * Three blocks, well apart. `sym` is both the letter carved on the block and
 * the letter it puts in the inscription; the colour is the one that letter
 * already wears everywhere else in the game, except z, which borrows c's
 * pastel yellow because z has no colour of its own.
 */
export const VARIABLE_BLOCKS = [
  { id: 'x', sym: 'x', tone: '#ff5a5f', x: 5, y: 32 },
  { id: 'y', sym: 'y', tone: '#ffa930', x: 40, y: 13 },
  { id: 'z', sym: 'z', tone: '#f7e59a', x: 33, y: 33 },
]

export function buildWorld() {
  const tiles = []
  for (let y = 0; y < WORLD_H; y++) tiles.push(new Array(WORLD_W).fill(WALL))
  carve(tiles, HALL, FLOOR)
  carve(tiles, CHANNEL, SANDSTONE)
  for (const p of PILLARS) {
    carve(tiles, { x0: p.x, x1: p.x + 1, y0: p.y, y1: p.y + 1 }, WALL)
  }
  // The arena is walled off from everything. The only way in is the portal.
  for (let y = ARENA.y0; y <= ARENA.y1; y++) {
    for (let x = ARENA.x0; x <= ARENA.x1; x++) {
      tiles[y][x] = soulTile(x, y)
    }
  }
  return tiles
}

/** She fades, and what is left of her is more sandstone. */
export function openSphinx(world) {
  carve(world, SPHINX, SANDSTONE)
}

/** Every tile a block sitting at (x, y) takes up. */
export function blockTiles(x, y) {
  const out = []
  for (let dy = 0; dy < BLOCK_SPAN; dy++) {
    for (let dx = 0; dx < BLOCK_SPAN; dx++) out.push({ x: x + dx, y: y + dy })
  }
  return out
}

/** Is there room for a whole block here? */
export function blockFits(world, blocks, x, y) {
  for (const t of blockTiles(x, y)) {
    if (t.x < 0 || t.y < 0 || t.x >= WORLD_W || t.y >= WORLD_H) return false
    if (world[t.y][t.x] === WALL) return false
    if (blocks.has(key(t.x, t.y))) return false
  }
  return true
}

/** Whether a body at (px, py) would be standing inside a block at (x, y). */
export const overlapsBlock = (px, py, x, y) =>
  px > x - BODY_R && px < x + BLOCK_SPAN + BODY_R &&
  py > y - BODY_R && py < y + BLOCK_SPAN + BODY_R

/**
 * Somewhere to set a block down: the nearest spot it fits that the player is
 * not standing in. Null if they have backed themselves into a corner, in which
 * case they keep carrying it.
 */
export function dropSpot(world, blocks, player) {
  const px = Math.floor(player.x)
  const py = Math.floor(player.y)
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = px + dx
        const y = py + dy
        if (!blockFits(world, blocks, x, y)) continue
        if (overlapsBlock(player.x, player.y, x, y)) continue
        return { x, y }
      }
    }
  }
  return null
}

/** How close the crosshair has to be to a block's middle to grab it. */
export const clickedBlock = (blocks, wx, wy) =>
  blocks.find(
    (b) => !b.placed && wx >= b.x && wx <= b.x + BLOCK_SPAN &&
      wy >= b.y && wy <= b.y + BLOCK_SPAN,
  )

export const nearEnough = (player, b) =>
  Math.hypot(b.x + BLOCK_SPAN / 2 - player.x, b.y + BLOCK_SPAN / 2 - player.y) <= CARRY_REACH

// ------------------------------------------------------------ phantoms

/**
 * Three of them, patrolling rings around the middle of the hall - one tight,
 * one middling, one right out by the walls. They all fly at the same speed, so
 * the small ring comes round far more often than the big one, and they all
 * start a third of a turn apart so they are never bunched together.
 */
export const HALL_CENTRE = {
  x: (HALL.x0 + HALL.x1 + 1) / 2,
  y: (HALL.y0 + HALL.y1 + 1) / 2,
}

/** Two and a half zombies. Exactly a walking pace, so only a sprint outruns one. */
export const PHANTOM_SPEED = ZOMBIE_SPEED * 2.5
export const PHANTOM_HP = 20
export const PHANTOM_DAMAGE = 3
/** A block back for both of you, so a hit always breaks the contact. */
export const PHANTOM_KNOCKBACK = 1
export const PHANTOM_REVIVE = 10
export const PHANTOM_R = 0.6
/**
 * Get this close and it stops patrolling and comes for you. Out of range again
 * and it steers back onto its ring rather than snapping to it.
 */
export const PHANTOM_CHASE = 3

export const PHANTOM_RINGS = [
  { id: 'short', radius: 4, start: 0 },
  { id: 'medium', radius: 8, start: (Math.PI * 2) / 3 },
  { id: 'wide', radius: 12, start: (Math.PI * 4) / 3 },
]

/** Same speed on every ring means the tight ones turn faster. */
export const angularSpeed = (radius) => PHANTOM_SPEED / radius

export const phantomAt = (radius, angle) => ({
  x: HALL_CENTRE.x + Math.cos(angle) * radius,
  y: HALL_CENTRE.y + Math.sin(angle) * radius,
})

/** The angle a phantom is standing at, so a chase can rejoin its ring. */
export const angleOf = (at) =>
  Math.atan2(at.y - HALL_CENTRE.y, at.x - HALL_CENTRE.x)

/** Fly straight at something, stopping when you get there. */
export function flyToward(from, to, speed, dt) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const d = Math.hypot(dx, dy)
  const step = speed * dt
  if (d <= step || d === 0) return { x: to.x, y: to.y }
  return { x: from.x + (dx / d) * step, y: from.y + (dy / d) * step }
}

// ------------------------------------------------------------ the arena

/**
 * Sealed rock until the portal drops you into it. Soul soil, with a quarter of
 * it soul sand - speckled rather than in patches, so there is no clean line to
 * run along.
 */
export const ARENA = { x0: 60, x1: 118, y0: 10, y1: 38 }
export const ARENA_SPAWN = { x: 63.5, y: 24.5 }
export const ARENA_CENTRE = {
  x: (ARENA.x0 + ARENA.x1 + 1) / 2,
  y: (ARENA.y0 + ARENA.y1 + 1) / 2,
}

export const SOUL_SAND_SHARE = 0.25
/** Half speed in soul sand - unless you are in the air over it. */
export const SOUL_SAND_SLOW = 0.5

/** Fixed noise, so the arena is laid out the same way every time. */
function hash01(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const soulTile = (x, y) => (hash01(x, y) < SOUL_SAND_SHARE ? SOUL_SAND : SOUL_SOIL)

// ------------------------------------------------------------ the eye

export const EYE_HP = 40
/** Three blocks of eye, but only the middle two of it can be hit. */
export const EYE_SIZE = 3
export const EYE_HITBOX = 2
export const EYE_TOUCH_DAMAGE = 1
export const EYE_TOUCH_TICK = 0.3

/**
 * The further off you are the harder it comes at you, between a crawl and a
 * flat sprint. Full speed once you are thirty blocks out, which is most of the
 * way across the arena.
 */
export const EYE_MIN_SPEED = 2
export const EYE_MAX_SPEED = 10
export const EYE_SPEED_RAMP = EYE_MAX_SPEED / 30

export const eyeSpeed = (dist) =>
  Math.max(EYE_MIN_SPEED, Math.min(EYE_MAX_SPEED, dist * EYE_SPEED_RAMP))

/**
 * It never comes straight at you. Holding a fixed angle off the line to the
 * player winds it in as a spiral, so backing straight away from it does not
 * work the way it would against something that just charged.
 */
export const EYE_SPIRAL = Math.PI / 5

export const eyeHeading = (eye, player) =>
  Math.atan2(player.y - eye.y, player.x - eye.x) + EYE_SPIRAL

// -------- the beam

export const BEAM_EVERY = 1
/** The outline you get to dodge, then the beam itself. */
export const BEAM_TELL = 0.5
export const BEAM_LIFE = 0.25
/** Aimed at you and then thrown away by up to fifty degrees either side. */
export const BEAM_SPREAD = (50 * Math.PI) / 180
export const BEAM_DAMAGE = 3
export const BEAM_HALF_WIDTH = 0.7
export const BEAM_RANGE = 70

export const beamAim = (eye, player, rand = Math.random) =>
  Math.atan2(player.y - eye.y, player.x - eye.x) + (rand() * 2 - 1) * BEAM_SPREAD

/** Is a point inside the beam? A capsule down the ray, out to its range. */
export function beamHits(origin, angle, target, halfWidth = BEAM_HALF_WIDTH, range = BEAM_RANGE) {
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const along = dx * Math.cos(angle) + dy * Math.sin(angle)
  if (along < 0 || along > range) return false
  return Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) <= halfWidth
}

// -------- blue fire

export const FIRE_EVERY = 10
export const FIRE_LIFE = 8
export const FIRE_DAMAGE = 2
export const FIRE_TICK = 0.5
/** Standing in it leaves you alight for a while after you step out. */
export const BURN_TIME = 4
export const BURN_DAMAGE = 1
export const BURN_TICK = 0.5
/** How close the crosshair has to be to a flame to beat it out. */
export const FIRE_CLICK_REACH = 5

// -------- cracking

export const CRACK_EVERY = 5
export const CRACK_COUNT = 15

/** Sandstone cannot be cracked. Everything the arena is made of can. */
export const CRACKABLE = new Set([FLOOR, SOUL_SOIL, SOUL_SAND])

/**
 * Both the ring of fire and the spread of cracks are measured out from the eye
 * at twice its distance from you - so backing off does not make you safer, it
 * just throws the danger wider.
 */
export const RADIUS_FACTOR = 2

export const dangerRadius = (eye, player) =>
  RADIUS_FACTOR * Math.hypot(player.x - eye.x, player.y - eye.y)

/** Every tile the circle of this radius passes through. */
export function ringTiles(world, centre, radius) {
  const out = []
  if (radius < 1) return out
  const lo = Math.max(0, Math.floor(centre.y - radius - 1))
  const hi = Math.min(WORLD_H - 1, Math.ceil(centre.y + radius + 1))
  const left = Math.max(0, Math.floor(centre.x - radius - 1))
  const right = Math.min(WORLD_W - 1, Math.ceil(centre.x + radius + 1))
  for (let y = lo; y <= hi; y++) {
    for (let x = left; x <= right; x++) {
      if (!CRACKABLE.has(world[y][x])) continue
      const d = Math.hypot(x + 0.5 - centre.x, y + 0.5 - centre.y)
      if (Math.abs(d - radius) <= 0.6) out.push({ x, y })
    }
  }
  return out
}

/** Every tile inside that radius. */
export function discTiles(world, centre, radius) {
  const out = []
  const lo = Math.max(0, Math.floor(centre.y - radius))
  const hi = Math.min(WORLD_H - 1, Math.ceil(centre.y + radius))
  const left = Math.max(0, Math.floor(centre.x - radius))
  const right = Math.min(WORLD_W - 1, Math.ceil(centre.x + radius))
  for (let y = lo; y <= hi; y++) {
    for (let x = left; x <= right; x++) {
      if (!CRACKABLE.has(world[y][x])) continue
      if (Math.hypot(x + 0.5 - centre.x, y + 0.5 - centre.y) <= radius) out.push({ x, y })
    }
  }
  return out
}

/** Fifteen of them, picked at random from whatever the circle covers. */
export function crackTargets(world, centre, radius, rand = Math.random, count = CRACK_COUNT) {
  const options = discTiles(world, centre, radius)
  const out = []
  while (out.length < count && options.length) {
    out.push(options.splice(Math.floor(rand() * options.length), 1)[0])
  }
  return out
}

/** How long a cracked block holds before it drops away. */
export const CRACK_HOLD = 1

/**
 * Crack a block. It stays cracked - and walkable - for a second, which is all
 * the warning you get, and then the floor goes out from under it. Returns
 * whether this tile was newly cracked.
 */
export function crackTile(world, cracks, x, y) {
  if (!CRACKABLE.has(world[y][x])) return false
  const k = key(x, y)
  if (cracks.has(k)) return false
  cracks.set(k, CRACK_HOLD)
  return true
}

/** Run the cracks down. Anything that reaches zero becomes a hole. */
export function settleCracks(world, cracks, dt) {
  for (const [k, left] of cracks) {
    const next = left - dt
    if (next > 0) {
      cracks.set(k, next)
      continue
    }
    cracks.delete(k)
    const [x, y] = k.split(',').map(Number)
    world[y][x] = VOID
  }
}

// ------------------------------------------------------------ the equation

/**
 * Denominators. Three ones against a 2, 3, 4 and 5 means most terms are whole
 * and some are not - the inscription is under no obligation to come out tidy,
 * and usually doesn't.
 */
const DENOMS = [1, 1, 1, 2, 3, 4, 5]

/**
 * A term's contribution once everything has been dragged to the left of the
 * equals sign, which is the only form worth solving from.
 */
const signed = (p) => {
  const c = p.sign === '-' ? rNeg(p.coef) : p.coef
  return p.side === 'left' ? c : rNeg(c)
}

/**
 * A fresh inscription: three coefficients waiting for a letter, one loose
 * number, all four scattered across the two sides at random, and one of the
 * three sockets picked out as the one to solve for. Which letter that turns
 * out to be is not decided here - that is up to whoever hauls the blocks.
 */
export function inscriptionEquation(rand = Math.random, slotCount = 3) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const coef = (max) => rat(1 + Math.floor(rand() * max), pick(DENOMS))
  const side = () => (rand() < 0.5 ? 'left' : 'right')
  const sign = (chance) => (rand() < chance ? '-' : '+')

  const parts = [
    ...Array.from({ length: slotCount }, (_, slot) => ({
      id: `slot-${slot}`,
      kind: 'slot',
      slot,
      coef: coef(9),
      sign: sign(0.35),
      side: side(),
    })),
    { id: 'const', kind: 'const', coef: coef(15), sign: sign(0.4), side: side() },
  ]

  // Shuffle, so the loose number is not always the last thing on the slab.
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[parts[i], parts[j]] = [parts[j], parts[i]]
  }

  // An equation needs something on both sides of it.
  for (const empty of ['left', 'right']) {
    if (parts.some((p) => p.side === empty)) continue
    parts[Math.floor(rand() * parts.length)].side = empty
  }

  return { parts, solveSlot: Math.floor(rand() * slotCount) }
}

/** Signed, with everything dragged to the left of the equals sign. */
export const signedPart = signed

/** The parts on one side, in the order they are carved. */
export const partsOn = (spec, side) => spec.parts.filter((p) => p.side === side)

/**
 * The inscription as a real equation, once every socket has a letter.
 * `letters` is indexed by socket: letters[1] is the letter sitting in slot 1.
 */
export function assignedEquation(spec, letters) {
  const build = (side) =>
    partsOn(spec, side).map((p) =>
      makeGroup(p.sign, [
        makeTerm(p.coef, p.kind === 'slot' ? { [letters[p.slot]]: 1 } : {}),
      ]),
    )
  return { left: build('left'), right: build('right') }
}

/**
 * What the letter in the solve-for socket comes to, in terms of the other two
 * and the loose number, as a canonical map - so any way of writing the same
 * expression is accepted.
 */
export function inscriptionAnswer(spec, letters) {
  const target = spec.parts.find((p) => p.kind === 'slot' && p.slot === spec.solveSlot)
  const d = signed(target)
  const out = new Map()
  for (const p of spec.parts) {
    if (p === target) continue
    const coef = rNeg(rDiv(signed(p), d))
    if (rIsZero(coef)) continue
    const powers = p.kind === 'slot' ? { [letters[p.slot]]: 1 } : {}
    out.set(powersKey(powers), { powers, coef })
  }
  return out
}

/**
 * Shapes an answer is allowed to be written in. This is only ever shown when
 * what was typed does not parse, so it must never be the answer itself - hence
 * three of them, pairwise different, of which at most one can collide.
 */
const HINT_SHAPES = [
  (p, q) => `2${p} - 3${q}/4 + 5`,
  (p, q) => `${p}/2 + 6${q} - 1`,
  (p, q) => `7${p} + ${q}/3 - 9`,
]

export function formatHint(others, answer) {
  const [p, q] = others
  for (const shape of HINT_SHAPES) {
    const text = shape(p, q)
    if (!canonEq(expr(text), answer)) return text
  }
  return HINT_SHAPES[0](p, q)
}

// ------------------------------------------------------- the second fight

/**
 * Three more slabs, cut into the arena's south wall. The first sets the
 * question, the second is where you plug your answer back in, and the third is
 * blank until there is a value of y to write on it.
 */
export const ARENA_SLABS = [
  { id: 'first', x0: 64, x1: 71, y0: 39, y1: 40 },
  { id: 'second', x0: 84, x1: 91, y0: 39, y1: 40 },
  { id: 'third', x0: 104, x1: 111, y0: 39, y1: 40 },
]
export const SLAB_RANGE = 4.5
export const slabCentre = (s) => ({ x: (s.x0 + s.x1 + 1) / 2, y: s.y0 })

/**
 * What the first eye leaves behind: one tablet with both letters on it, which
 * fills both of the first slab's sockets in a single go.
 */
export const XY_TABLET = { id: 'xy', syms: ['x', 'y'], tone: '#ff5a5f', tone2: '#ffa930' }

// -------- the squad

export const EYE_SPAWN_RADIUS = 10
export const EYE_SPAWN_ANGLES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]
/** Killed, an eye is an outline for ten seconds and then it is back. */
export const EYE_REVIVE = 10
/** A squad eye winds up its beam half as often as the lone one did. */
export const SQUAD_BEAM_EVERY = 2

/**
 * Each eye is a different clock. The first is the one you have already met;
 * the second is a second late and slows by two every time; the third is two
 * late and slows by four. Anything past the third copies the third.
 */
export const EYE_KINDS = [
  { special: 0, grow: 0, beam: 0, spin: 1, cracks: true },
  { special: 1, grow: 2, beam: 0.7, spin: -1, cracks: false },
  { special: 2, grow: 4, beam: 1.4, spin: 0, cracks: false },
]

/** Eye four onwards is another copy of eye three. */
export const eyeKind = (index) => EYE_KINDS[Math.min(index, EYE_KINDS.length - 1)]

export const eyeSpawn = (index) => {
  const a = EYE_SPAWN_ANGLES[index % EYE_SPAWN_ANGLES.length]
  return {
    x: ARENA_CENTRE.x + Math.cos(a) * EYE_SPAWN_RADIUS,
    y: ARENA_CENTRE.y + Math.sin(a) * EYE_SPAWN_RADIUS,
  }
}

/**
 * Which way it curls. Clockwise, anticlockwise, or - for the third - whichever
 * of the two is less of a turn from where it is already pointed, which is what
 * makes it the awkward one to back away from.
 */
export function spiralHeading(eye, player, spin) {
  const direct = Math.atan2(player.y - eye.y, player.x - eye.x)
  if (spin !== 0) return direct + spin * EYE_SPIRAL
  const facing = eye.heading ?? direct
  const options = [direct + EYE_SPIRAL, direct - EYE_SPIRAL]
  return options.reduce((best, a) =>
    Math.abs(angleDiff(a, facing)) < Math.abs(angleDiff(best, facing)) ? a : best)
}

// -------- the two equations

/** Every part of an inscription boiled down to one signed coefficient each. */
export function partCoefficients(spec, letters) {
  const out = { const: num(0) }
  for (const letter of letters) out[letter] = num(0)
  for (const p of spec.parts) {
    const c = signed(p)
    const slot = p.kind === 'slot' ? letters[p.slot] : 'const'
    out[slot] = rAdd(out[slot], c)
  }
  return out
}

/**
 * The pair of equations the second fight is built on: two lines in x and y that
 * actually cross. Any pair whose determinant is zero is thrown away and rolled
 * again, so there is always exactly one answer rather than none or all of them.
 */
export function twoWayPuzzle(rand = Math.random) {
  const letters = ['x', 'y']
  for (let tries = 0; tries < 500; tries++) {
    const first = inscriptionEquation(rand, 2)
    first.solveSlot = 0 // it always wants x, and says so from the start
    const second = inscriptionEquation(rand, 2)

    const A = partCoefficients(first, letters)
    const B = partCoefficients(second, letters)
    // a1 x + b1 y + c1 = 0 and a2 x + b2 y + c2 = 0
    const det = rAdd(rMul(A.x, B.y), rNeg(rMul(B.x, A.y)))
    if (rIsZero(det)) continue

    const xValue = rDiv(rAdd(rMul(A.y, B.const), rNeg(rMul(B.y, A.const))), det)
    const yValue = rDiv(rAdd(rMul(B.x, A.const), rNeg(rMul(A.x, B.const))), det)
    return {
      first,
      second,
      letters,
      // What the first slab asks for: x written out in y.
      xExpr: inscriptionAnswer(first, letters),
      xValue,
      yValue,
    }
  }
  return null
}

/** A canonical answer turned back into groups, ready to be dragged about. */
export function sideFromCanonical(map) {
  const groups = [...map.values()].map((v) =>
    makeGroup(rSign(v.coef) < 0 ? '-' : '+', [makeTerm(rAbs(v.coef), v.powers)]),
  )
  return groups.length ? groups : [makeGroup('+', [makeTerm(num(0), {})])]
}

/** `x = <whatever>`, as an equation the board can work on. */
export const asEquation = (sym, side) => ({
  left: [makeGroup('+', [makeTerm(num(1), { [sym]: 1 })])],
  right: side,
})

// -------- the hoard

export const CHEST_EMERALDS = 20
export const CHEST_SAND = 64
export const CHEST_EYES = 2
/** How long sand holds over a hole before it goes through. */
export const SAND_HOLD = 1
/** How close the middle of an eye has to be to swallow you. */
export const PORTAL_STEP = 0.7

// ------------------------------------------------------- the hall giving way

/**
 * The hall does not stay put. Every two seconds one percent of whatever sand
 * is still whole cracks, at random, and a cracked block is a second from being
 * a hole - so the longer you spend hauling tablets about, the less floor there
 * is to haul them across.
 */
export const SAND_DECAY_EVERY = 2
export const SAND_DECAY_SHARE = 0.01

/** Sand still worth cracking: hall floor that is neither cracked nor a hole. */
export function intactSand(world, cracks) {
  const out = []
  for (let y = HALL.y0; y <= HALL.y1; y++) {
    for (let x = HALL.x0; x <= HALL.x1; x++) {
      if (world[y][x] !== FLOOR) continue
      if (cracks.has(key(x, y))) continue
      out.push({ x, y })
    }
  }
  return out
}

/**
 * Which blocks go this time. Always at least one, so the last of the floor
 * still goes rather than the whole thing stalling once a percent rounds to
 * nothing.
 */
export function decayTargets(world, cracks, rand = Math.random) {
  const pool = intactSand(world, cracks)
  if (!pool.length) return []
  const want = Math.max(1, Math.round(pool.length * SAND_DECAY_SHARE))
  const out = []
  while (out.length < want && pool.length) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  }
  return out
}
