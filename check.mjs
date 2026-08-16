/**
 * `npm run check` - walks the real solution path of every problem in the
 * algebra units, pressing the same buttons, clicking the same signs and
 * dragging the same terms a student would.
 *
 * The point is that a problem being *solvable* is not obvious from the model:
 * a term can end up somewhere it cannot be combined from, and a bracket can
 * open at the wrong moment. This proves each one can actually be finished.
 */
import {
  applyOperation, canCombineFactors, canCombineGroups, canonEq, canonical,
  combineFactors, combineGroups, equationText, expr, firstEquation, moveGroup,
  num, openParens, parseOperand, parseSide, powerSymbols, rAdd, rat, ratText,
  rEq, rMul, rNeg, solutionSide, solvedExpr, solvedValue, substitute,
  substitutionSpots,
} from './src/algebra/equation.js'
import { moreVariableStages } from './src/algebra/moreVariables.js'
import {
  angularSpeed, ARENA, ARENA_CENTRE, ARENA_SLABS, ARENA_SPAWN, asEquation,
  assignedEquation, BEAM_SPREAD, EYE_KINDS, eyeKind, EYE_SPAWN_RADIUS, eyeSpawn,
  partCoefficients, sideFromCanonical, slabCentre, SLAB_RANGE, spiralHeading,
  twoWayPuzzle,
  beamAim, beamHits, blockFits, buildWorld, CHANNEL, CRACK_COUNT, crackTargets,
  CRACK_HOLD, crackTile, dangerRadius, decayTargets, discTiles, intactSand,
  SAND_DECAY_EVERY, SAND_DECAY_SHARE, dropSpot, EYE_MAX_SPEED, EYE_MIN_SPEED,
  eyeSpeed, formatHint, HALL, HALL_CENTRE, INSCRIPTION, inscriptionAnswer,
  inscriptionEquation, key, openSphinx, partsOn, PHANTOM_RINGS, PHANTOM_SPEED,
  phantomAt, PHANTOM_CHASE, flyToward, PORTAL, ringTiles, SANDSTONE, SOUL_SAND, SOUL_SAND_SHARE,
  settleCracks, SOUL_SOIL, SPAWN, SPHINX, VARIABLE_BLOCKS, VOID, WALL, WORLD_H,
  WORLD_W,
  ZOMBIE_SPEED,
} from './src/temples/sandTemple.js'

let fails = 0
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log('  FAIL ' + msg) }
  else console.log('  ok   ' + msg)
}

/** Click every live sign until nothing is left to click. */
function simp(side) {
  let cur = openParens(side)
  for (let guard = 0; guard < 500; guard++) {
    let moved = false
    outer: for (let gi = 0; gi < cur.length; gi++) {
      for (let i = 0; i < cur[gi].ops.length; i++) {
        if (canCombineFactors(cur[gi], i)) {
          cur = cur.map((g, k) => (k === gi ? combineFactors(g, i) : g))
          moved = true
          break outer
        }
      }
    }
    if (!moved) {
      for (let i = 1; i < cur.length; i++) {
        if (canCombineGroups(cur, i)) { cur = combineGroups(cur, i); moved = true; break }
      }
    }
    if (!moved) return cur
    cur = openParens(cur)
  }
  throw new Error('simp did not settle')
}

const clean = (eq) => ({ left: simp(eq.left), right: simp(eq.right) })
const op = (eq, kind, text) => clean(applyOperation(eq, kind, parseOperand(text)))
/** Drag a term next to the one it cancels, then work it out. */
const drag = (eq, sideKey, from, to) =>
  clean({ ...eq, [sideKey]: moveGroup(eq[sideKey], from, to) })

const show = (eq) => equationText(eq)

// Single clicks, for checking what the student sees between steps rather than
// just where they end up.
const clickGroup = (eq, sideKey, i) =>
  ({ ...eq, [sideKey]: openParens(combineGroups(eq[sideKey], i)) })
const clickFactor = (eq, sideKey, gi, i) => ({
  ...eq,
  [sideKey]: openParens(eq[sideKey].map((g, k) => (k === gi ? combineFactors(g, i) : g))),
})
const raw = (eq, kind, text) => applyOperation(eq, kind, parseOperand(text))

// ---------------------------------------------------------------- old unit

console.log('Solve that Equation! (unchanged behaviour)')
{
  let eq = firstEquation().eq // 3x + 7 = 49
  eq = op(eq, 'sub', '7')
  eq = op(eq, 'div', '3')
  ok(show(eq) === 'x = 14', `3x + 7 = 49  ->  ${show(eq)}`)
  ok(solvedValue(eq)?.n === 14, 'solvedValue still returns a plain rational')
}

// ---------------------------------------------------------------- the unit

const stages = moreVariableStages()

console.log('\n1. 3x/4 - 5 = 1, then the interruption')
{
  let eq = stages[0].eq
  eq = op(eq, 'add', '5')
  eq = op(eq, 'mul', '4')
  eq = op(eq, 'div', '3')
  ok(show(eq) === 'x = 8', `${show(eq)} reaches x = 8`)
  ok(canonEq(solvedExpr(eq, 'x'), stages[0].trigger.answer), 'trigger fires')

  eq = stages[0].after.eq // x + 10y = 8
  eq = op(eq, 'sub', '10y')
  ok(canonEq(solvedExpr(eq, 'x'), stages[0].after.answer), `${show(eq)}`)
}

console.log('\n2. y/5 - 7 + 15x^2 = 13, find y')
{
  let eq = stages[1].eq
  eq = op(eq, 'add', '7')
  // The +7 lands past the 15x^2, so it has to be dragged back to the -7.
  eq = drag(eq, 'left', 3, 1)
  eq = op(eq, 'sub', '15x^2')
  eq = op(eq, 'mul', '5')
  ok(canonEq(solvedExpr(eq, 'y'), stages[1].answer), `${show(eq)}`)
}

console.log('\n3. (a + b)/c + d = e, find b')
{
  let eq = stages[2].eq
  ok(show(eq) === '(a + b) / c + d = e', `starts as ${show(eq)}`)

  // Click by click, so the bracket's behaviour is pinned down rather than
  // inferred from wherever the working happens to end up.
  eq = raw(eq, 'sub', 'd')
  eq = clickGroup(eq, 'left', 2) // d - d
  eq = clickGroup(eq, 'right', 2)
  ok(show(eq) === '(a + b) / c = e - d', `the bracket survives -d: ${show(eq)}`)

  eq = raw(eq, 'mul', 'c')
  ok(show(eq) === '(a + b) / c * c = e * c - d * c', `after *c: ${show(eq)}`)
  eq = clickFactor(eq, 'left', 0, 0) // the c divides into the bracket
  ok(show(eq) === '(a / c + b / c) * c = e * c - d * c', `divided in: ${show(eq)}`)
  eq = clickFactor(eq, 'left', 0, 0) // and the c multiplies back in
  ok(
    show(eq) === 'a / c * c + b / c * c = e * c - d * c',
    `nothing left holding the bracket, so it opens: ${show(eq)}`,
  )

  eq = clean(eq)
  ok(show(eq) === 'a + b = ce - cd', `the c's cancel: ${show(eq)}`)

  eq = op(eq, 'sub', 'a')
  // a + b - a: the -a has to be dragged next to the a before it can cancel.
  eq = drag(eq, 'left', 2, 1)
  ok(canonEq(solvedExpr(eq, 'b'), stages[2].answer), `${show(eq)}`)
  // The same answer written any other way round is still right.
  ok(canonEq(expr('-a + ce - cd'), stages[2].answer), 'order does not matter')
  ok(canonEq(expr('ce - cd - a'), stages[2].answer), 'ce and c*e are the same')
  ok(!canonEq(expr('ce - cd + a'), stages[2].answer), 'a wrong sign is still wrong')
}

console.log('\n4. 3x/7 + 4y/9 = 11, by hand')
{
  ok(canonEq(canonical(parseSide('77/3 - 28y/27')), stages[3].answer), 'the answer parses')
  ok(canonEq(canonical(parseSide('-28y/27 + 77/3')), stages[3].answer), 'either order')
  // Check it really is the answer: substitute it back and the equation holds.
  let eq = stages[3].eq
  eq = clean({ ...eq, left: substitute(eq.left, 0, 'x', parseSide('77/3 - 28y/27')) })
  ok(show(eq) === '11 = 11', `substituting back gives ${show(eq)}`)
}

console.log('\n5. Bonus chain')
{
  const [one, two, three] = stages[4].steps

  let eq = one.eq // 4x - 12y - 3 = 17
  ok(show(eq) === '4x - 12y - 3 = 17', `starts as ${show(eq)}`)
  eq = op(eq, 'add', '3')
  eq = op(eq, 'add', '12y')
  eq = op(eq, 'div', '4')
  ok(canonEq(solvedExpr(eq, 'x'), one.answer), `${show(eq)} matches x = 3y + 5`)
  const xIs = solutionSide(eq, 'x')

  eq = two.eq // 7x = 4y + 1
  eq = { ...eq, left: substitute(eq.left, 0, 'x', xIs) }
  ok(show(eq) === '7 * 5 + 7 * 3y = 4y + 1', `dropped in: ${show(eq)}`)
  eq = clean(eq)
  ok(show(eq) === '35 + 21y = 4y + 1', `multiplied out: ${show(eq)}`)
  eq = op(eq, 'sub', '35')
  eq = drag(eq, 'left', 2, 1)
  eq = op(eq, 'sub', '4y')
  eq = drag(eq, 'right', 2, 1)
  eq = op(eq, 'div', '17')
  ok(canonEq(solvedExpr(eq, 'y'), two.answer), `${show(eq)} matches y = -2`)
  const yIs = solutionSide(eq, 'y')

  eq = three.eq // x = 3y + 5
  eq = { ...eq, right: substitute(eq.right, 0, 'y', yIs) }
  ok(show(eq) === 'x = 3 * -2 + 5', `dropped in: ${show(eq)}`)
  ok(solvedExpr(eq, 'x') === null, 'not solved until the student works it out')
  eq = clean(eq)
  ok(canonEq(solvedExpr(eq, 'x'), three.answer), `${show(eq)} matches x = -1`)
}

// ---------------------------------------------------------- the Sand Temple

/** Every tile you can walk to from the spawn, ignoring the giant blocks. */
function reachable(world) {
  const seen = new Set()
  const queue = [[Math.floor(SPAWN.x), Math.floor(SPAWN.y)]]
  seen.add(key(queue[0][0], queue[0][1]))
  while (queue.length) {
    const [x, y] = queue.pop()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue
      if (world[ny][nx] === WALL || seen.has(key(nx, ny))) continue
      seen.add(key(nx, ny))
      queue.push([nx, ny])
    }
  }
  return seen
}

console.log('\n6. Sand Temple - the map')
{
  const world = buildWorld()
  ok(world[Math.floor(SPAWN.y)][Math.floor(SPAWN.x)] !== WALL, 'you spawn on open floor')

  const before = reachable(world)
  ok(
    VARIABLE_BLOCKS.every((b) => blockFits(world, new Map(), b.x, b.y)),
    'all three blocks sit somewhere they actually fit',
  )
  ok(
    VARIABLE_BLOCKS.every((b) => before.has(key(b.x, b.y - 1))),
    'and all three can be walked up to',
  )
  ok(
    world[INSCRIPTION.y0][INSCRIPTION.x0] === WALL &&
      before.has(key(INSCRIPTION.x0, INSCRIPTION.y0 - 1)),
    'the inscription is cut into the wall, with floor to stand on in front of it',
  )
  ok(!before.has(key(CHANNEL.x0 + 40, CHANNEL.y0 + 1)), 'the channel is sealed off')
  ok(!before.has(key(PORTAL.x0, PORTAL.y0)), 'and so is the portal')
  ok(
    world[SPHINX.y0][SPHINX.x0] === WALL,
    'the Sphinx is the wall, not a hole in it',
  )

  openSphinx(world)
  const after = reachable(world)
  ok(world[SPHINX.y0][SPHINX.x0] === SANDSTONE, 'she leaves sandstone behind her')
  ok(after.has(key(PORTAL.x0, PORTAL.y0)), 'once she fades the portal is reachable')

  // Somewhere to put a block down, standing in the middle of the hall.
  const spot = dropSpot(world, new Map(), { x: 24, y: 20 })
  ok(!!spot && blockFits(world, new Map(), spot.x, spot.y), 'a block can be set back down')
}

console.log('\n7. Sand Temple - the inscription')
{
  const seeded = (seed) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  /** A term of the answer written the way a student would type it: 3y/4. */
  const termText = (v) => {
    const syms = powerSymbols(v.powers).join('')
    const n = Math.abs(v.coef.n)
    const head = n === 1 && syms ? syms : `${n}${syms}`
    return (v.coef.n < 0 ? '-' : '+') + head + (v.coef.d === 1 ? '' : `/${v.coef.d}`)
  }
  const answerText = (map, reverse) => {
    const parts = [...map.values()].map(termText)
    return (reverse ? parts.reverse() : parts).join(' ')
  }

  /** A side worked out for actual numbers, exactly. */
  const evalSide = (side, vals) =>
    side.reduce((acc, g) => {
      const f = g.factors[0]
      let v = f.coef
      for (const [sym, p] of Object.entries(f.powers)) {
        for (let i = 0; i < p; i++) v = rMul(v, vals[sym])
      }
      return rAdd(acc, g.sign === '-' ? rNeg(v) : v)
    }, num(0))

  const evalCanon = (map, vals) =>
    [...map.values()].reduce((acc, v) => {
      let t = v.coef
      for (const [sym, p] of Object.entries(v.powers)) {
        for (let i = 0; i < p; i++) t = rMul(t, vals[sym])
      }
      return rAdd(acc, t)
    }, num(0))

  // Every letter can end up in every socket, so all six orderings get a turn.
  const ORDERS = [
    ['x', 'y', 'z'], ['x', 'z', 'y'], ['y', 'x', 'z'],
    ['y', 'z', 'x'], ['z', 'x', 'y'], ['z', 'y', 'x'],
  ]

  let bad = null
  let hintClash = 0
  const runs = 600
  for (let i = 0; i < runs && !bad; i++) {
    const rand = seeded(i * 7919 + 13)
    const spec = inscriptionEquation(rand)
    const letters = ORDERS[i % ORDERS.length]
    const eq = assignedEquation(spec, letters)
    const answer = inscriptionAnswer(spec, letters)
    const target = letters[spec.solveSlot]
    const others = letters.filter((l) => l !== target)

    const note = (why) => {
      bad = `${why}  (${equationText(eq)}, solve for ${target})`
    }

    if (!partsOn(spec, 'left').length || !partsOn(spec, 'right').length) {
      note('a side came out empty')
      break
    }
    // Three terms and a number, wherever they landed.
    if (spec.parts.length !== 4) {
      note('wrong number of parts')
      break
    }

    // Pick values for the other two letters out of the air, work the target
    // out from the answer, and the equation has to hold exactly.
    const vals = { [others[0]]: rat(3), [others[1]]: rat(-5, 2) }
    vals[target] = evalCanon(answer, vals)
    if (!rEq(evalSide(eq.left, vals), evalSide(eq.right, vals))) {
      note('the answer does not satisfy the equation')
      break
    }

    // And it has to survive being typed out, in either order.
    const typed = answerText(answer, false)
    if (!canonEq(canonical(parseSide(typed)), answer)) {
      note(`"${typed}" did not parse back to the same answer`)
      break
    }
    if (!canonEq(canonical(parseSide(answerText(answer, true))), answer)) {
      note('the same answer written backwards was rejected')
      break
    }
    if (canonEq(expr(formatHint(others, answer)), answer)) hintClash += 1
  }

  ok(!bad, bad || `${runs} random inscriptions all solve, and the answer parses back`)
  ok(hintClash === 0, 'the format hint is never the answer')
}

console.log('\n7b. Sand Temple - the hall giving way')
{
  const world = buildWorld()
  const cracks = new Map()
  const start = intactSand(world, cracks).length
  ok(start > 1000, `the hall starts as ${start} blocks of whole sand`)
  ok(
    Math.abs(decayTargets(world, cracks).length - Math.round(start * SAND_DECAY_SHARE)) === 0,
    `and ${Math.round(start * SAND_DECAY_SHARE)} of them go every ${SAND_DECAY_EVERY} seconds`,
  )

  // Two minutes of it, run for real: crack, wait, fall through, repeat.
  let clock = 0
  for (let tick = 0; tick < 60; tick++) {
    for (const t of decayTargets(world, cracks)) crackTile(world, cracks, t.x, t.y)
    settleCracks(world, cracks, SAND_DECAY_EVERY)
    clock += SAND_DECAY_EVERY
  }
  const left = intactSand(world, cracks).length
  ok(left < start, `after ${clock}s of it there are ${left} left of ${start}`)
  ok(
    Math.abs(left - start * Math.pow(1 - SAND_DECAY_SHARE, 60)) < start * 0.05,
    'which is the one percent a tick compounding, not something faster',
  )

  // It only ever eats the hall, and never the sandstone or the arena.
  let strayed = 0
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (world[y][x] !== VOID) continue
      if (x < HALL.x0 || x > HALL.x1 || y < HALL.y0 || y > HALL.y1) strayed += 1
    }
  }
  ok(strayed === 0, 'and every hole it opened is inside the hall')
}

console.log('\n8. Sand Temple - the phantoms')
{
  const world = buildWorld()
  ok(PHANTOM_SPEED === ZOMBIE_SPEED * 2.5, `they fly at ${PHANTOM_SPEED}, two and a half zombies`)
  ok(
    new Set(PHANTOM_RINGS.map((r) => r.radius)).size === 3,
    'a wide ring, a middling one and a tight one',
  )
  ok(
    new Set(PHANTOM_RINGS.map((r) => r.start)).size === 3,
    'and no two of them start at the same angle',
  )

  // Same speed on every ring is the point, so the tight one laps the wide one.
  const laps = PHANTOM_RINGS.map((r) => angularSpeed(r.radius) * r.radius)
  ok(laps.every((v) => Math.abs(v - PHANTOM_SPEED) < 1e-9), 'all three fly at that same speed')

  let strays = 0
  for (const ring of PHANTOM_RINGS) {
    for (let i = 0; i < 360; i++) {
      const at = phantomAt(ring.radius, (i * Math.PI) / 180)
      // They fly, so a pillar is fine - but leaving the hall is not.
      if (at.x < HALL.x0 || at.x > HALL.x1 + 1 || at.y < HALL.y0 || at.y > HALL.y1 + 1) strays += 1
    }
  }
  ok(strays === 0, 'every ring stays inside the hall all the way round')
  ok(PHANTOM_CHASE === 3, 'and inside three blocks they leave the ring and come for you')

  // Breaking off and rejoining both go through the same straight-line flight.
  const away = flyToward({ x: 0, y: 0 }, { x: 10, y: 0 }, PHANTOM_SPEED, 1)
  ok(Math.abs(away.x - PHANTOM_SPEED) < 1e-9, 'a chase covers exactly its own speed in a second')
  const arrived = flyToward({ x: 0, y: 0 }, { x: 0.1, y: 0 }, PHANTOM_SPEED, 1)
  ok(arrived.x === 0.1, 'and it never overshoots what it is flying to')
  ok(
    Math.abs(HALL_CENTRE.x - (HALL.x0 + HALL.x1 + 1) / 2) < 1e-9 &&
      world[Math.floor(HALL_CENTRE.y)][Math.floor(HALL_CENTRE.x)] !== WALL,
    'and they are all centred on the middle of it',
  )
}

console.log('\n9. Sand Temple - the arena')
{
  const world = buildWorld()
  let sand = 0
  let soil = 0
  for (let y = ARENA.y0; y <= ARENA.y1; y++) {
    for (let x = ARENA.x0; x <= ARENA.x1; x++) {
      if (world[y][x] === SOUL_SAND) sand += 1
      else if (world[y][x] === SOUL_SOIL) soil += 1
    }
  }
  const share = sand / (sand + soil)
  ok(sand + soil === (ARENA.x1 - ARENA.x0 + 1) * (ARENA.y1 - ARENA.y0 + 1),
    'the arena is soul soil and soul sand, and nothing else')
  ok(
    Math.abs(share - SOUL_SAND_SHARE) < 0.02,
    `a quarter of it is soul sand (${(share * 100).toFixed(1)}%)`,
  )
  ok(
    world[Math.floor(ARENA_SPAWN.y)][Math.floor(ARENA_SPAWN.x)] !== WALL,
    'the portal lands you on solid ground',
  )

  // Sealed: you can only get in through the portal, never on foot.
  const onFoot = reachable(world)
  openSphinx(world)
  const withChannel = reachable(world)
  ok(
    !onFoot.has(key(ARENA_SPAWN.x | 0, ARENA_SPAWN.y | 0)) &&
      !withChannel.has(key(ARENA_SPAWN.x | 0, ARENA_SPAWN.y | 0)),
    'and there is no way to walk into the arena, portal or nothing',
  )

  ok(
    eyeSpeed(0) === EYE_MIN_SPEED && eyeSpeed(1e6) === EYE_MAX_SPEED,
    `the eye never drops below ${EYE_MIN_SPEED} or climbs past ${EYE_MAX_SPEED} blocks a second`,
  )
  ok(eyeSpeed(20) > eyeSpeed(10), 'and the further off you are the faster it comes')

  // Fifty degrees either way, and no further.
  const rand = (() => {
    let s = 99
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648
      return s / 2147483648
    }
  })()
  const eye = { x: 0, y: 0 }
  const target = { x: 10, y: 0 }
  let worst = 0
  let hits = 0
  for (let i = 0; i < 2000; i++) {
    const a = beamAim(eye, target, rand)
    worst = Math.max(worst, Math.abs(a))
    if (beamHits(eye, a, target)) hits += 1
  }
  ok(worst <= BEAM_SPREAD + 1e-9, 'the beam is never thrown more than fifty degrees off')
  ok(hits > 0 && hits < 2000, `it misses most of the time but not always (${hits} of 2000)`)

  // Both circles are drawn round the eye at twice your distance from it.
  const player = { x: ARENA_CENTRE.x + 6, y: ARENA_CENTRE.y }
  const radius = dangerRadius(ARENA_CENTRE, player)
  ok(Math.abs(radius - 12) < 1e-9, 'six blocks away puts the danger circle out at twelve')

  const ring = ringTiles(world, ARENA_CENTRE, radius)
  ok(ring.length > 0, `the ring of blue fire covers ${ring.length} blocks`)
  ok(
    ring.every((t) => Math.abs(Math.hypot(t.x + 0.5 - ARENA_CENTRE.x, t.y + 0.5 - ARENA_CENTRE.y) - radius) <= 0.6),
    'and every one of them is on the circle, not inside it',
  )
  ok(
    discTiles(world, ARENA_CENTRE, radius).length > ring.length,
    'the cracking circle is the whole disc, not just the rim',
  )
  ok(
    crackTargets(world, ARENA_CENTRE, radius, Math.random).length === CRACK_COUNT,
    `exactly ${CRACK_COUNT} blocks crack at a time`,
  )

  // Sandstone is the one thing that never gives way.
  const cracks = new Map()
  const sx = CHANNEL.x0 + 20
  crackTile(world, cracks, sx, CHANNEL.y0)
  settleCracks(world, cracks, CRACK_HOLD * 2)
  ok(world[CHANNEL.y0][sx] === SANDSTONE && cracks.size === 0, 'sandstone cannot be cracked')

  // Everything else gets exactly one second of warning.
  const cx = ARENA.x0 + 5
  const cy = ARENA.y0 + 5
  ok(crackTile(world, cracks, cx, cy) === true, 'a block cracks')
  settleCracks(world, cracks, CRACK_HOLD * 0.9)
  ok(world[cy][cx] !== VOID && cracks.size === 1, 'and is still floor most of a second later')
  settleCracks(world, cracks, CRACK_HOLD * 0.2)
  ok(world[cy][cx] === VOID && cracks.size === 0, 'then a second later it is a hole')
}


console.log('\n10. Sand Temple - the second fight')
{
  const world = buildWorld()

  // The three slabs are cut into the arena wall, with floor in front of each.
  ok(
    ARENA_SLABS.every((slab) => world[slab.y0][slab.x0] === WALL),
    'all three slabs are carved into the wall',
  )
  ok(
    ARENA_SLABS.every((slab) => {
      const c = slabCentre(slab)
      return world[Math.floor(c.y) - 1][Math.floor(c.x)] !== WALL
    }),
    'and you can stand in front of every one of them',
  )
  ok(
    ARENA_SLABS.every((slab, i) =>
      ARENA_SLABS.every((other, j) => {
        if (i === j) return true
        const a = slabCentre(slab)
        const b = slabCentre(other)
        return Math.hypot(a.x - b.x, a.y - b.y) > SLAB_RANGE * 2
      })),
    'and no two of them are close enough to be at once',
  )

  // The squad: three eyes, ten blocks out, a third of a turn apart.
  const spawns = [0, 1, 2].map(eyeSpawn)
  ok(
    spawns.every((at) =>
      Math.abs(Math.hypot(at.x - ARENA_CENTRE.x, at.y - ARENA_CENTRE.y) - EYE_SPAWN_RADIUS) < 1e-9),
    'the three of them come in ten blocks from the middle',
  )
  ok(
    spawns.every((at) => at.x > ARENA.x0 && at.x < ARENA.x1 && at.y > ARENA.y0 && at.y < ARENA.y1),
    'and all three land inside the arena',
  )
  ok(
    EYE_KINDS.map((k) => k.special).join() === '0,1,2' &&
      EYE_KINDS.map((k) => k.grow).join() === '0,2,4' &&
      EYE_KINDS.map((k) => k.beam).join() === '0,0.7,1.4',
    'their specials start 0, 1 and 2 late and slow by 0, 2 and 4 each round',
  )
  ok(
    EYE_KINDS.filter((k) => k.cracks).length === 1,
    'and only one of them ever takes the floor apart',
  )
  ok(
    eyeKind(3) === EYE_KINDS[2] && eyeKind(9) === EYE_KINDS[2],
    'every eye after the third is another copy of the third',
  )

  // Clockwise, anticlockwise, and whichever is the shorter turn.
  const at = { x: 0, y: 0, heading: 0 }
  const target = { x: 0, y: 10 }
  ok(
    spiralHeading(at, target, 1) > spiralHeading(at, target, -1),
    'the first curls one way and the second the other',
  )
  const auto = spiralHeading({ ...at, heading: Math.PI / 2 - 1 }, target, 0)
  ok(
    Math.abs(auto - (Math.PI / 2 - Math.PI / 5)) < 1e-9,
    'and the third takes whichever of the two is less of a turn',
  )

  // The pair of equations, over and over.
  let bad = null
  const runs = 2000
  for (let i = 0; i < runs && !bad; i++) {
    const puzzle = twoWayPuzzle()
    if (!puzzle) { bad = 'no puzzle could be built'; break }
    const { first, second, letters, xValue, yValue, xExpr } = puzzle

    if (first.solveSlot !== 0) { bad = 'the first slab did not ask for x'; break }

    // Both equations have to hold at the one answer.
    for (const spec of [first, second]) {
      const c = partCoefficients(spec, letters)
      const v = rAdd(rAdd(rMul(c.x, xValue), rMul(c.y, yValue)), c.const)
      if (!rEq(v, num(0))) { bad = `${equationText(assignedEquation(spec, letters))} does not hold`; break }
    }
    if (bad) break

    // x written in y has to give that same x back at the real y.
    let acc = num(0)
    for (const t of xExpr.values()) acc = rAdd(acc, t.powers.y ? rMul(t.coef, yValue) : t.coef)
    if (!rEq(acc, xValue)) { bad = 'x in terms of y disagrees with x'; break }

    // The chain the three slabs walk you through: plug x into the second
    // equation and y has to come out on its own, uniquely.
    const side = sideFromCanonical(xExpr)
    const eq2 = assignedEquation(second, letters)
    const spot = substitutionSpots(eq2.left, 'x').length
      ? { key: 'left', i: substitutionSpots(eq2.left, 'x')[0].group }
      : { key: 'right', i: substitutionSpots(eq2.right, 'x')[0].group }
    const plugged = clean({
      ...eq2,
      [spot.key]: substitute(eq2[spot.key], spot.i, 'x', side),
    })
    const both = [...canonical(plugged.left), ...canonical(plugged.right)]
    if (both.some(([k]) => k === 'x^1')) { bad = 'x survived being plugged in'; break }
    const yCoef = (canonical(plugged.left).get('y^1')?.coef ?? num(0))
    const yCoefR = (canonical(plugged.right).get('y^1')?.coef ?? num(0))
    if (rEq(yCoef, yCoefR)) { bad = 'the y terms cancelled, so y has no single value'; break }

    // And the third slab: the real y back into x = f(y) gives the real x.
    const eq3 = asEquation('x', side)
    const at3 = substitutionSpots(eq3.right, 'y')
    if (!at3.length) { bad = 'nowhere to plug y in on the third slab'; break }
    const done = clean({
      ...eq3,
      right: substitute(eq3.right, at3[0].group, 'y', parseSide(ratText(yValue))),
    })
    const got = solvedExpr(done, 'x')
    if (!got || !canonEq(got, canonical(parseSide(ratText(xValue))))) {
      bad = `the third slab landed on ${show(done)} rather than x = ${ratText(xValue)}`
      break
    }
  }
  ok(!bad, bad || `${runs} pairs of equations cross once, and the three slabs reach it`)
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
