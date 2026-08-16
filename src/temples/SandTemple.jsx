/**
 * The Sand Temple.
 *
 * The hall is the puzzle: three giant tablets with a letter carved on each, an
 * inscription with three empty sockets, and a Sphinx who will not say anything
 * except what she always says. Three phantoms patrol rings around the middle of
 * it, so hauling a tablet is never a quiet walk.
 *
 * The portal at the end of the channel drops you into the arena, which is soul
 * soil, soul sand, and one very large eye.
 */
import { Fragment, useEffect, useReducer, useRef, useState } from 'react'
import BackButton from '../BackButton.jsx'
import { Frac } from '../algebra/EquationView.jsx'
import {
  canonEq, canonical, parseSide, ratText, solutionSide, solvedExpr, substitute,
} from '../algebra/equation.js'
import {
  BAGS, cloneInventory, Hearts, InventoryPanel, makeInventory, restoreInventory,
  Slot, slotBinder,
} from './Kit.jsx'
import { SlabOne, SlabThree, SlabTwo } from './ArenaChain.jsx'
import {
  addToSlots, angularSpeed, ARENA, ARENA_CENTRE, ARENA_SPAWN, BEAM_DAMAGE, BEAM_EVERY,
  BEAM_HALF_WIDTH, BEAM_LIFE, BEAM_RANGE, BEAM_TELL, beamAim, beamHits, BLOCK,
  BLOCK_SPAN, blockTiles, boltLanding, boxHits, BURN_DAMAGE, BURN_TICK,
  BURN_TIME, buildWorld, CARRY_SPEED, clickedBlock, CRACK_EVERY, crackTargets,
  crackTile, dangerRadius, dropSpot, EYE_HITBOX, EYE_HP, EYE_SIZE,
  EYE_TOUCH_DAMAGE, EYE_TOUCH_TICK, eyeHeading, eyeSpeed, FIRE_CLICK_REACH,
  FIRE_DAMAGE, FIRE_EVERY, FIRE_LIFE, FIRE_TICK, formatHint, GROUND_ITEMS,
  HURT_INVULN,
  inRect, INSCRIPTION, INSCRIPTION_CENTRE, INSCRIPTION_RANGE, inscriptionAnswer,
  inscriptionEquation, isStaff, isSword, JUMP_TIME, key,
  landingSpot, MAX_HEALTH, nearEnough, openSphinx, overVoid, partsOn,
  PHANTOM_DAMAGE, PHANTOM_HP, PHANTOM_KNOCKBACK, PHANTOM_R, PHANTOM_REVIVE,
  PHANTOM_CHASE, PHANTOM_RINGS, phantomAt, angleOf, flyToward, PICKUP_RANGE, PORTAL, PORTAL_CENTRE, PORTAL_RANGE,
  ringTiles, settleCracks, canPlace, CRACK_HOLD, decayTargets,
  SAND_DECAY_EVERY, fallsThrough, inReach, isPlaceable,
  isPortal, ITEMS, mineSeconds, PORTAL_STEP, SAND_HOLD, stack,
  ARENA_SLABS, asEquation, assignedEquation, BEAM_EVERY as LONE_BEAM_EVERY,
  CHEST_EMERALDS, CHEST_EYES, CHEST_SAND, EYE_REVIVE, eyeKind, eyeSpawn,
  sideFromCanonical, slabCentre, SLAB_RANGE, soulTile, spiralHeading,
  SQUAD_BEAM_EVERY, twoWayPuzzle, XY_TABLET,
  SANDSTONE, SOUL_SAND, SOUL_SAND_SLOW, SOUL_SOIL, SPAWN, SPHINX, SPHINX_FADE,
  SPRINT_SPEED, STAFF_COOLDOWN, STAFF_DAMAGE, STAFF_HIT_R, STAFF_RANGE,
  STAFF_SPEED, stepMove, swingDamage, SWING_TIME, swingHits, VARIABLE_BLOCKS,
  VOID, WALK_SPEED, WALL, WORLD_H, WORLD_W,
} from './sandTemple.js'

const VIEW_W = 960
const VIEW_H = 560
const JUMP_LIFT = 22 // pixels the sprite rises at the top of a hop
const FALL_TIME = 0.55

// ---------------------------------------------------------------- the slab

/**
 * A socket on the inscription. Empty it is a hole to drop a tablet into; full
 * it is the letter, in that letter's own colour. `live` is what makes it a
 * button at all - once all three are seated nothing on the slab responds.
 */
function Socket({ letter, live, onClick }) {
  if (!live) {
    return letter ? (
      <span className={'eq-x eq-sym--' + letter}>{letter}</span>
    ) : (
      <span className="sand-socket">?</span>
    )
  }
  return (
    <button
      type="button"
      className={'sand-socket sand-socket--live' + (letter ? ' sand-socket--full' : '')}
      title={letter ? 'Take this tablet back out' : 'Set the tablet you are carrying in here'}
      onClick={onClick}
    >
      {letter ? <span className={'eq-x eq-sym--' + letter}>{letter}</span> : '?'}
    </button>
  )
}

/**
 * A coefficient and its socket. A denominator stacks the whole thing as a
 * fraction, exactly the way an ordinary term is drawn, so `3x/2` reads as one
 * term rather than a term with something after it.
 */
function SlotTerm({ coef, ...socket }) {
  const numerator = (
    <>
      {coef.n !== 1 && <span className="eq-num">{coef.n}</span>}
      <Socket {...socket} />
    </>
  )
  if (coef.d === 1) return numerator
  return (
    <span className="eq-num frac-wrap">
      <span className="frac">
        <span className="frac-top">{numerator}</span>
        <span className="frac-bot">{coef.d}</span>
      </span>
    </span>
  )
}

function InscriptionSide({ spec, side, slots, liveFor, onSlot }) {
  return (
    <span className="eq-side">
      {partsOn(spec, side).map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <span className="eq-op eq-op--flat">{p.sign}</span>}
          <span className="eq-group">
            {i === 0 && p.sign === '-' && <span className="eq-num">-</span>}
            {p.kind === 'const' ? (
              <Frac value={p.coef} />
            ) : (
              <SlotTerm
                coef={p.coef}
                letter={slots[p.slot]}
                live={liveFor(p.slot)}
                onClick={() => onSlot(p.slot)}
              />
            )}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

function InscriptionEquation({ spec, slots, liveFor, onSlot }) {
  const sideProps = (side) => ({ spec, side, slots, liveFor, onSlot })
  return (
    <div className="equation equation--static equation--slab">
      <InscriptionSide {...sideProps('left')} />
      <span className="eq-equals">=</span>
      <InscriptionSide {...sideProps('right')} />
    </div>
  )
}

/**
 * She asks the same thing whatever state the temple is in, and says nothing
 * about whether an answer was close. The only note she ever gives is when what
 * was typed is not an expression at all, which is a typing problem rather than
 * a maths one.
 */
function SphinxPanel({ onAsk, onClose, note }) {
  const [text, setText] = useState('')
  const ask = () => onAsk(text)
  return (
    <div className="panel sphinx-panel">
      <p className="sphinx-line">“What is the answer”</p>
      <div className="op-row">
        <input
          className="op-input op-input--wide"
          value={text}
          autoFocus
          aria-label="Your answer"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
        />
      </div>
      <div className="op-row op-row--wide">
        <button type="button" className="pixel-btn" onClick={ask}>
          Answer
        </button>
        <button type="button" className="pixel-btn pixel-btn--alt" onClick={onClose}>
          Say nothing
        </button>
      </div>
      {note && <p className="op-note">{note}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- the temple

export default function SandTemple({ onBack, onReward, onStash, save }) {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const invRef = useRef(null)
  const carriedRef = useRef(null)
  const uiRef = useRef(null)
  const dragRef = useRef(null)
  const stashRef = useRef(onStash)
  stashRef.current = onStash
  const rewardRef = useRef(onReward)
  rewardRef.current = onReward
  const [, bump] = useReducer((n) => n + 1, 0)

  if (!invRef.current) invRef.current = makeInventory(save?.inventory)
  if (!carriedRef.current) carriedRef.current = cloneInventory(invRef.current)
  if (!uiRef.current) {
    uiRef.current = {
      atSlab: false,
      slab: null,
      loot: null,
      sphinxOpen: false,
      invOpen: false,
      pick: null,
      over: null,
      note: '',
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const ui = uiRef.current
    const inv = invRef.current
    const held = () => inv.hotbar[inv.selected]

    const game = {
      world: null,
      // Tile -> tablet id, so a giant tablet stops you the way a wall does.
      blocks: new Map(),
      cracks: new Map(), // tile -> seconds before that block drops away
      decayTimer: 0,
      player: {},
      keys: new Set(),
      mouse: { x: SPAWN.x, y: SPAWN.y, down: false },
      camera: { x: 0, y: 0 },
      floats: [],
      swing: 0,
      swingAim: null,
      ground: [],
      bolts: [],
      staffCooldown: 0,
      mining: null,
      spec: null,
      slots: [null, null, null],
      vars: [],
      carrying: null, // the id of the tablet in your arms
      phantoms: [],
      sphinx: { fade: 0, gone: false },
      answered: false,
      inArena: false,
      // 'first' is the lone eye; 'chain' is the squad and the three slabs;
      // 'won' is after the right answer, when they stop coming back.
      phase: 'first',
      eyes: [],
      nextEye: 0,
      puzzle: null,
      chain: null,
      chest: null,
      sand: new Map(), // tile -> seconds a sand block over a hole has left
      portals: [],
      portalArmed: true,
      fires: new Map(), // tile -> seconds of blue fire left
      beams: [],
    }
    gameRef.current = game

    const carried = () => game.vars.find((b) => b.id === game.carrying) || null

    const say = (x, y, text, tone) => game.floats.push({ x, y, t: 1.2, text, tone })

    /** Put a tablet's four tiles into the collision map, or take them out. */
    function occupy(b, on) {
      for (const t of blockTiles(b.x, b.y)) {
        if (on) game.blocks.set(key(t.x, t.y), b.id)
        else game.blocks.delete(key(t.x, t.y))
      }
    }

    // ------------------------------------------------------------ a run

    function freshPhantoms() {
      game.phantoms = PHANTOM_RINGS.map((ring) => ({
        ...ring,
        angle: ring.start,
        hp: PHANTOM_HP,
        dead: false,
        revive: 0,
        ...phantomAt(ring.radius, ring.start),
      }))
    }

    /**
     * One eye. The lone one keeps the timings you first met; every one after it
     * is late to start by its own delay and slower to wind up each time round,
     * and only the first of the squad cracks the floor.
     */
    function makeEye(index, at, original = false) {
      const k = eyeKind(index)
      return {
        id: `eye-${game.nextEye++}`,
        index,
        original,
        x: at.x,
        y: at.y,
        hp: EYE_HP,
        dead: false,
        revive: 0,
        gone: false,
        awake: original ? false : true,
        heading: 0,
        touchTick: 0,
        spin: original ? 1 : k.spin,
        cracks: original ? true : k.cracks,
        beamEvery: original ? LONE_BEAM_EVERY : SQUAD_BEAM_EVERY,
        beamTimer: original ? 0 : -k.beam,
        fireEvery: FIRE_EVERY,
        fireGrow: original ? 0 : k.grow,
        fireTimer: original ? 0 : -k.special,
        crackEvery: CRACK_EVERY,
        crackGrow: original ? 0 : k.grow,
        crackTimer: original ? 0 : -k.special,
      }
    }

    function freshEye() {
      game.nextEye = 0
      game.eyes = [makeEye(0, ARENA_CENTRE, true)]
      game.beams = []
    }

    /** Three more, ten blocks out at a third of a turn apart. */
    function summonSquad() {
      game.eyes = [0, 1, 2].map((i) => makeEye(i, eyeSpawn(i)))
    }

    /** One more, on the same clock as the third. */
    function addEye() {
      game.eyes.push(makeEye(game.eyes.length, eyeSpawn(game.eyes.length)))
    }

    /** Put the arena floor back exactly as it was laid. */
    function healArena() {
      for (let y = ARENA.y0; y <= ARENA.y1; y++) {
        for (let x = ARENA.x0; x <= ARENA.x1; x++) game.world[y][x] = soulTile(x, y)
      }
      game.cracks = new Map()
    }

    /** A fresh pair of equations for the three slabs. */
    function freshChain() {
      game.puzzle = twoWayPuzzle()
      const xSide = sideFromCanonical(game.puzzle.xExpr)
      game.chain = {
        seated: game.chain?.seated ?? false,
        xSide,
        eq2: assignedEquation(game.puzzle.second, game.puzzle.letters),
        plugged2: false,
        ySide: null,
        eq3: asEquation('x', xSide),
        plugged3: false,
        xSide2: null,
        note: '',
      }
    }

    /**
     * A run from scratch. Dying costs you the whole temple, exactly as it does
     * in the Stone Temple: back to the entrance, the Sphinx sitting in her wall
     * again, the tablets back where they were, and a brand new inscription to
     * work out. Only what you walked in carrying survives.
     */
    function freshRun() {
      game.gen = (game.gen || 0) + 1
      game.world = buildWorld()
      game.cracks = new Map()
      game.decayTimer = 0
      game.fires = new Map()
      game.sand = new Map()
      game.portals = []
      game.portalArmed = true
      game.beams = []
      game.bolts = []
      game.staffCooldown = 0
      game.swing = 0
      game.mining = null
      game.floats = []

      game.spec = inscriptionEquation()
      game.slots = [null, null, null]
      game.blocks = new Map()
      game.vars = VARIABLE_BLOCKS.map((b) => ({ ...b, placed: false }))
      for (const b of game.vars) occupy(b, true)
      game.carrying = null
      game.sphinx = { fade: 0, gone: false }
      game.answered = false
      game.inArena = false

      // The bag goes back to what you brought, so anything found inside is
      // lost - which means the sword in the sand is put out again.
      restoreInventory(inv, carriedRef.current)
      const armed = BAGS.some((bag) => inv[bag].some((s) => s?.kind === 'sword'))
      game.ground = armed ? [] : GROUND_ITEMS.map((g) => ({ ...g, item: { ...g.item } }))

      Object.assign(game.player, {
        ...SPAWN,
        airborne: false,
        jumpT: 0,
        airSpeed: WALK_SPEED,
        facing: { x: 0, y: -1 },
        falling: 0,
        health: MAX_HEALTH,
        invuln: HURT_INVULN * 2,
        burn: 0,
        burnTick: 0,
        fireTick: 0,
      })
      freshPhantoms()
      freshEye()
      game.phase = 'first'
      game.chest = null
      game.chain = null
      freshChain()
      game.chain.seated = false
      ui.atSlab = false
      ui.slab = null
      ui.sphinxOpen = false
      ui.note = ''
      bump()
    }
    freshRun()

    function die() {
      freshRun()
      say(game.player.x, game.player.y, 'You died', 'hurt')
    }

    // ------------------------------------------------------------ damage

    function hurt(amount, ignoreInvuln = false) {
      const p = game.player
      if (!ignoreInvuln && p.invuln > 0) return
      p.health = Math.max(0, p.health - amount)
      if (!ignoreInvuln) p.invuln = HURT_INVULN
      say(p.x, p.y, `-${amount}`, 'hurt')
      if (p.health === 0) die()
      bump()
    }

    // ------------------------------------------------------------ carrying

    function pickUp(b) {
      if (game.carrying || b.placed) return
      occupy(b, false)
      game.carrying = b.id
      bump()
    }

    function setDown() {
      const b = carried()
      if (!b) return
      const spot = dropSpot(game.world, game.blocks, game.player)
      if (!spot) {
        say(game.player.x, game.player.y, 'No room to set it down', 'note')
        return
      }
      b.x = spot.x
      b.y = spot.y
      occupy(b, true)
      game.carrying = null
      bump()
    }

    /**
     * Clicking the slab in front of you, rather than hunting for the panel.
     * The hall's inscription takes one letter into the first empty socket; the
     * arena's first slab takes the pair.
     */
    function seatFromCanvas(at) {
      const b = carried()
      if (!b) return false
      const onHall =
        at.x >= INSCRIPTION.x0 && at.x <= INSCRIPTION.x1 + 1 &&
        at.y >= INSCRIPTION.y0 && at.y <= INSCRIPTION.y1 + 1 &&
        Math.hypot(INSCRIPTION_CENTRE.x - game.player.x, INSCRIPTION_CENTRE.y - game.player.y)
          <= INSCRIPTION_RANGE
      if (onHall && !b.pair && !game.slots.every(Boolean)) {
        const free = game.slots.findIndex((v) => !v)
        game.slots[free] = b.sym
        b.placed = true
        game.carrying = null
        bump()
        return true
      }
      const slab = ARENA_SLABS[0]
      const c = slabCentre(slab)
      const onArena =
        at.x >= slab.x0 && at.x <= slab.x1 + 1 &&
        at.y >= slab.y0 && at.y <= slab.y1 + 1 &&
        Math.hypot(c.x - game.player.x, c.y - game.player.y) <= SLAB_RANGE
      if (onArena && b.pair && game.chain && !game.chain.seated) {
        b.placed = true
        game.carrying = null
        game.chain.seated = true
        game.phase = 'chain'
        summonSquad()
        bump()
        return true
      }
      return false
    }

    /** Take a tablet, or put down the one you have. */
    function interact() {
      if (game.carrying) return setDown()
      const near = game.vars
        .filter((b) => !b.placed && nearEnough(game.player, b))
        .sort(
          (a, b) =>
            Math.hypot(a.x - game.player.x, a.y - game.player.y) -
            Math.hypot(b.x - game.player.x, b.y - game.player.y),
        )
      if (near[0]) pickUp(near[0])
    }

    // ------------------------------------------------------------ weapons

    function swing() {
      const p = game.player
      game.swing = SWING_TIME
      const dx = game.mouse.x - p.x
      const dy = game.mouse.y - p.y
      const len = Math.hypot(dx, dy) || 1
      const aim = { x: dx / len, y: dy / len }
      game.swingAim = aim
      const dmg = swingDamage(p.airborne)

      for (const f of game.phantoms) {
        if (f.dead || !swingHits(p, aim, f, 2.2)) continue
        f.hp -= dmg
        say(f.x, f.y, `-${dmg}`, 'hit')
        if (f.hp <= 0) killPhantom(f)
      }

      for (const e of game.eyes) {
        if (e.dead || e.gone || !e.awake) continue
        if (!boxHits(p, aim, e, EYE_HITBOX / 2, 2.4)) continue
        e.hp = Math.max(0, e.hp - dmg)
        say(e.x, e.y - 2, `-${dmg}`, 'hit')
        if (e.hp === 0) killEye(e)
      }
      bump()
    }

    function fireStaff() {
      const p = game.player
      if (game.staffCooldown > 0) return
      game.staffCooldown = STAFF_COOLDOWN
      const dx = game.mouse.x - p.x
      const dy = game.mouse.y - p.y
      const len = Math.hypot(dx, dy) || 1
      game.swing = SWING_TIME
      game.swingAim = { x: dx / len, y: dy / len }
      game.bolts.push({
        x: p.x,
        y: p.y,
        vx: (dx / len) * STAFF_SPEED,
        vy: (dy / len) * STAFF_SPEED,
        left: STAFF_RANGE / STAFF_SPEED,
        spin: 0,
      })
    }

    function updateBolts(dt) {
      if (game.staffCooldown > 0) game.staffCooldown -= dt
      for (const b of game.bolts) {
        const from = { x: b.x, y: b.y }
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.left -= dt
        b.spin += dt * 12

        let hit = false
        for (const f of game.phantoms) {
          if (f.dead) continue
          if (Math.hypot(f.x - b.x, f.y - b.y) > STAFF_HIT_R + PHANTOM_R) continue
          f.hp -= STAFF_DAMAGE
          say(f.x, f.y, `-${STAFF_DAMAGE}`, 'hit')
          if (f.hp <= 0) killPhantom(f)
          hit = true
          break
        }
        // The eye is immune to anything thrown at it - you have to walk up to
        // it, which is the whole difficulty of the fight.
        for (const e of game.eyes) {
          if (hit || e.dead || e.gone || !e.awake) continue
          if (Math.hypot(e.x - b.x, e.y - b.y) > EYE_HITBOX / 2 + STAFF_HIT_R) continue
          say(e.x, e.y - 2, 'nothing', 'note')
          hit = true
        }
        if (!hit && game.world[Math.floor(b.y)]?.[Math.floor(b.x)] === WALL) hit = true

        if (hit || b.left <= 0) {
          const cell = boltLanding(game.world, game.blocks, b, from)
          if (cell) game.blocks.set(key(cell.x, cell.y), 'stone')
          b.done = true
        }
      }
      game.bolts = game.bolts.filter((b) => !b.done)
    }

    // ------------------------------------------------------------ phantoms

    function killPhantom(f) {
      f.dead = true
      f.hp = 0
      f.revive = PHANTOM_REVIVE
      // The outline is left exactly where it went down, and that is where it
      // comes back.
      f.ghostAngle = f.angle
      bump()
    }

    function updatePhantoms(dt) {
      const p = game.player
      for (const f of game.phantoms) {
        if (f.dead) {
          f.revive -= dt
          if (f.revive <= 0) {
            f.dead = false
            f.hp = PHANTOM_HP
            f.angle = f.ghostAngle
            say(f.x, f.y, 'It returns', 'note')
            bump()
          }
          continue
        }

        // Inside three blocks it breaks off the patrol and comes for you.
        // Outside it, it flies back to where its ring has got to by now.
        const chasing = Math.hypot(p.x - f.x, p.y - f.y) <= PHANTOM_CHASE
        if (chasing) {
          const at = flyToward(f, p, PHANTOM_SPEED, dt)
          f.x = at.x
          f.y = at.y
          f.angle = angleOf(f) // keep the ring honest for when it gives up
        } else {
          f.angle += angularSpeed(f.radius) * dt
          const at = flyToward(f, phantomAt(f.radius, f.angle), PHANTOM_SPEED, dt)
          f.x = at.x
          f.y = at.y
        }
        f.chasing = chasing

        if (p.invuln > 0 || p.falling > 0) continue
        if (Math.hypot(p.x - f.x, p.y - f.y) > PHANTOM_R + 0.4) continue

        // A block back for each of you, so you are never stuck inside one.
        const dx = p.x - f.x
        const dy = p.y - f.y
        const len = Math.hypot(dx, dy) || 1
        const push = stepMove(
          game.world, game.blocks, p,
          (dx / len) * PHANTOM_KNOCKBACK, (dy / len) * PHANTOM_KNOCKBACK, true,
        )
        p.x = push.x
        p.y = push.y
        // A block back for it too, straight away from you.
        f.x -= (dx / len) * PHANTOM_KNOCKBACK
        f.y -= (dy / len) * PHANTOM_KNOCKBACK
        f.angle = angleOf(f)
        hurt(PHANTOM_DAMAGE)
        return // one hit a frame, and a death would invalidate the list
      }
    }

    // ------------------------------------------------------------ the eye

    /**
     * The lone eye leaves a tablet and puts the floor back. A squad eye is an
     * outline for ten seconds and then it is up again - until the slabs have
     * been answered, at which point they stay down.
     */
    function killEye(e) {
      game.beams = game.beams.filter((b) => b.eye !== e.id)
      if (e.original) {
        game.eyes = game.eyes.filter((o) => o !== e)
        healArena()
        game.phase = 'tablet'
        // Whatever it was holding, dropped where it fell.
        const at = dropSpot(game.world, game.blocks, { x: e.x, y: e.y }) || {
          x: Math.round(ARENA_CENTRE.x),
          y: Math.round(ARENA_CENTRE.y),
        }
        const tablet = { ...XY_TABLET, pair: true, placed: false, x: at.x, y: at.y }
        game.vars.push(tablet)
        occupy(tablet, true)
        say(e.x, e.y, 'It drops a tablet', 'note')
        bump()
        return
      }
      if (game.phase === 'won') {
        game.eyes = game.eyes.filter((o) => o !== e)
        if (!game.eyes.length) openChest()
        bump()
        return
      }
      e.dead = true
      e.revive = EYE_REVIVE
      bump()
    }

    function updateEyes(dt) {
      const p = game.player
      const gen = game.gen
      for (const e of game.eyes) {
        if (e.dead) {
          e.revive -= dt
          if (e.revive <= 0) {
            e.dead = false
            e.hp = EYE_HP
            bump()
          }
          continue
        }
        if (!e.awake) {
          if (inRect(ARENA, p.x, p.y)) {
            e.awake = true
            bump()
          }
          continue
        }

        const dist = Math.hypot(p.x - e.x, p.y - e.y)
        e.heading = spiralHeading(e, p, e.spin)
        const speed = eyeSpeed(dist)
        // It goes over walls, holes and everything else without noticing.
        e.x += Math.cos(e.heading) * speed * dt
        e.y += Math.sin(e.heading) * speed * dt

        if (dist <= EYE_HITBOX / 2 + 0.4) {
          e.touchTick += dt
          while (e.touchTick >= EYE_TOUCH_TICK) {
            e.touchTick -= EYE_TOUCH_TICK
            hurt(EYE_TOUCH_DAMAGE, true)
          }
        } else {
          e.touchTick = 0
        }
        if (game.gen !== gen) return

        e.beamTimer += dt
        if (e.beamTimer >= e.beamEvery) {
          e.beamTimer -= e.beamEvery
          game.beams.push({
            eye: e.id, x: e.x, y: e.y, angle: beamAim(e, p), t: 0, fired: false,
          })
        }

        e.fireTimer += dt
        if (e.fireTimer >= e.fireEvery) {
          e.fireTimer -= e.fireEvery
          e.fireEvery += e.fireGrow // every round takes that bit longer to wind up
          for (const t of ringTiles(game.world, e, dangerRadius(e, p))) {
            game.fires.set(key(t.x, t.y), FIRE_LIFE)
          }
        }

        // Only ever one of them takes the floor apart.
        if (!e.cracks) continue
        e.crackTimer += dt
        if (e.crackTimer >= e.crackEvery) {
          e.crackTimer -= e.crackEvery
          e.crackEvery += e.crackGrow
          for (const t of crackTargets(game.world, e, dangerRadius(e, p))) {
            crackTile(game.world, game.cracks, t.x, t.y)
          }
        }
      }
    }

    /** An outline you get half a second to leave, and then the real thing. */
    function updateBeams(dt) {
      const gen = game.gen
      for (const b of game.beams) {
        b.t += dt
        if (!b.fired && b.t >= BEAM_TELL) {
          b.fired = true
          if (beamHits(b, b.angle, game.player)) hurt(BEAM_DAMAGE)
          if (game.gen !== gen) return
        }
      }
      game.beams = game.beams.filter((b) => b.t < BEAM_TELL + BEAM_LIFE)
    }

    function updateFire(dt) {
      const p = game.player
      const gen = game.gen
      let standing = false
      for (const [k, left] of game.fires) {
        const next = left - dt
        if (next <= 0) {
          game.fires.delete(k)
          continue
        }
        game.fires.set(k, next)
        const [fx, fy] = k.split(',').map(Number)
        if (Math.floor(p.x) === fx && Math.floor(p.y) === fy) standing = true
      }

      if (standing) {
        p.fireTick += dt
        while (p.fireTick >= FIRE_TICK) {
          p.fireTick -= FIRE_TICK
          hurt(FIRE_DAMAGE, true)
        }
        if (game.gen !== gen) return // burned to death, and already back at spawn
        p.burn = BURN_TIME // it keeps being topped back up while you stand in it
      } else {
        p.fireTick = 0
      }

      // Still alight after you step out.
      if (p.burn > 0 && !standing) {
        p.burn -= dt
        p.burnTick += dt
        while (p.burnTick >= BURN_TICK && p.burn > 0) {
          p.burnTick -= BURN_TICK
          hurt(BURN_DAMAGE, true)
        }
      } else if (!standing) {
        p.burnTick = 0
      }
    }

    /** Sand comes back up in a second; anything else takes its usual twelve. */
    function updateMining(dt) {
      const m = game.mining
      if (!m) return
      if (!game.mouse.down || ui.invOpen || ui.loot) {
        game.mining = null
        return
      }
      const kind = game.blocks.get(key(m.tx, m.ty))
      if (!ITEMS[kind]) {
        game.mining = null
        return
      }
      m.t += dt
      if (m.t < mineSeconds(kind)) return
      game.blocks.delete(key(m.tx, m.ty))
      game.sand.delete(key(m.tx, m.ty))
      game.portals = game.portals.filter((q) => q.x !== m.tx || q.y !== m.ty)
      const copy = stack(kind, 1)
      if (!addToSlots(inv.hotbar, copy)) addToSlots(inv.main, copy)
      game.mining = null
      bump()
    }

    /** Cracked floor holds for a second and then is not floor any more. */
    function updateCracks(dt) {
      settleCracks(game.world, game.cracks, dt)
    }

    /**
     * The hall eating itself. A percent of what is left every two seconds is
     * slow to begin with and quietly ruinous by the time you are on your third
     * tablet. The arena has its own eye for this, so it is left alone.
     */
    function updateDecay(dt) {
      if (game.inArena) return
      game.decayTimer += dt
      if (game.decayTimer < SAND_DECAY_EVERY) return
      game.decayTimer -= SAND_DECAY_EVERY
      for (const t of decayTargets(game.world, game.cracks)) {
        crackTile(game.world, game.cracks, t.x, t.y)
      }
    }

    /** Sand over a hole holds for a second, cracking, and then goes through. */
    function updateSand(dt) {
      for (const [k, left] of game.sand) {
        const next = left - dt
        if (next > 0) {
          game.sand.set(k, next)
          continue
        }
        game.sand.delete(k)
        game.blocks.delete(k)
        bump()
      }
    }

    /**
     * The pair of eyes out of the hoard. Step on one and you come out in the
     * middle of the other, and neither works again until you have walked off.
     */
    function updatePortals() {
      const p = game.player
      const near = game.portals.find(
        (q) => Math.hypot(q.x + 0.5 - p.x, q.y + 0.5 - p.y) <= PORTAL_STEP,
      )
      if (!near) {
        game.portalArmed = true
        return
      }
      if (!game.portalArmed || game.portals.length < 2) return
      const other = game.portals.find((q) => q !== near)
      if (!other) return
      game.portalArmed = false
      p.x = other.x + 0.5
      p.y = other.y + 0.5
      p.airborne = false
      p.jumpT = 0
      say(p.x, p.y, 'Through', 'note')
      bump()
    }

    function openChest() {
      if (game.chest?.opened) return
      game.chest = { ...ARENA_CENTRE, opened: false }
      say(ARENA_CENTRE.x, ARENA_CENTRE.y, 'The hoard is yours', 'note')
      bump()
    }

    function takeChest() {
      if (!game.chest || game.chest.opened) return
      game.chest.opened = true
      for (const s of [stack('sand', CHEST_SAND), stack('eye', CHEST_EYES)]) {
        if (!addToSlots(inv.hotbar, s)) addToSlots(inv.main, s)
      }
      rewardRef.current?.({ emeralds: CHEST_EMERALDS, stone: 0, staff: false })
      ui.loot = { emeralds: CHEST_EMERALDS, sand: CHEST_SAND, eyes: CHEST_EYES }
      bump()
    }

    // ------------------------------------------------------------ input

    const onKeyDown = (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      if (e.repeat) return
      if (e.code === 'KeyE') {
        ui.invOpen = !ui.invOpen
        ui.pick = null
        bump()
        return
      }
      if (e.code === 'Escape') {
        if (ui.sphinxOpen || ui.invOpen) {
          ui.sphinxOpen = false
          ui.invOpen = false
          ui.pick = null
          ui.note = ''
          bump()
        }
        return
      }
      const digit = e.code.match(/^Digit([1-9])$/)
      if (digit) {
        inv.selected = Number(digit[1]) - 1
        bump()
        return
      }
      if (e.code === 'KeyF') {
        interact()
        return
      }
      game.keys.add(e.code)
    }
    const onKeyUp = (e) => game.keys.delete(e.code)
    const onBlur = () => game.keys.clear()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    const toWorld = (e) => {
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (canvas.width / rect.width)
      const py = (e.clientY - rect.top) * (canvas.height / rect.height)
      return { x: (px + game.camera.x) / BLOCK, y: (py + game.camera.y) / BLOCK }
    }

    const onMove = (e) => {
      const p = toWorld(e)
      game.mouse.x = p.x
      game.mouse.y = p.y
    }

    /** Right click puts a block down. Sand over a hole is on borrowed time. */
    const onPlace = (e) => {
      e.preventDefault()
      if (ui.invOpen || ui.loot || game.carrying) return
      const p = toWorld(e)
      const slot = held()
      const tx = Math.floor(p.x)
      const ty = Math.floor(p.y)
      if (!isPlaceable(slot)) return
      if (!canPlace(game.world, game.blocks, game.player, tx, ty)) return
      if (isPortal(slot) && game.portals.length >= 2) return
      game.blocks.set(key(tx, ty), slot.kind)
      if (isPortal(slot)) game.portals.push({ x: tx, y: ty })
      else if (fallsThrough(slot.kind) && game.world[ty][tx] === VOID) {
        game.sand.set(key(tx, ty), SAND_HOLD)
      }
      slot.count -= 1
      if (slot.count <= 0) inv.hotbar[inv.selected] = null
      bump()
    }

    const onDown = (e) => {
      if (ui.invOpen || ui.loot) return
      if (e.button !== 0) return
      const p = toWorld(e)
      game.mouse.x = p.x
      game.mouse.y = p.y
      game.mouse.down = true

      // With a tablet in your arms you can do two things: set it into a slab
      // you are standing at, or put it back down on the sand.
      if (game.carrying) {
        if (seatFromCanvas(p)) return
        setDown()
        return
      }

      if (!game.sphinx.gone &&
          p.x >= SPHINX.x0 && p.x <= SPHINX.x1 + 1 &&
          p.y >= SPHINX.y0 && p.y <= SPHINX.y1 + 1) {
        ui.sphinxOpen = true
        ui.note = ''
        bump()
        return
      }

      // Beating out a flame beats swinging at nothing.
      const tile = key(Math.floor(p.x), Math.floor(p.y))
      if (game.fires.has(tile) &&
          Math.hypot(p.x - game.player.x, p.y - game.player.y) <= FIRE_CLICK_REACH) {
        game.fires.delete(tile)
        return
      }

      const b = clickedBlock(game.vars, p.x, p.y)
      if (b && nearEnough(game.player, b)) {
        pickUp(b)
        return
      }

      if (isStaff(held())) return fireStaff()
      if (isSword(held())) return swing()

      // Nothing in hand that fights, so a left click digs instead - but only
      // things you put down. A tablet is carried, never mined.
      const tx = Math.floor(p.x)
      const ty = Math.floor(p.y)
      const kind = game.blocks.get(key(tx, ty))
      if (ITEMS[kind] && inReach(game.player, tx, ty)) {
        game.mining = { tx, ty, t: 0 }
      }
    }

    const onUp = (e) => {
      if (e.button === 0) {
        game.mouse.down = false
        game.mining = null
      }
    }
    const onContext = (ev) => {
      ev.preventDefault()
      onPlace(ev)
    }

    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('contextmenu', onContext)

    // ------------------------------------------------------------ update

    function updatePlayer(dt) {
      const p = game.player
      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)

      // Nothing climbs back out of a hole. Cracked floor is a warning, not a
      // hazard to be tanked.
      if (p.falling > 0) {
        p.falling += dt
        if (p.falling >= FALL_TIME) die()
        return
      }

      const frozen = ui.sphinxOpen || ui.invOpen
      let dx = 0
      let dy = 0
      if (!frozen) {
        if (game.keys.has('KeyW')) dy -= 1
        if (game.keys.has('KeyS')) dy += 1
        if (game.keys.has('KeyA')) dx -= 1
        if (game.keys.has('KeyD')) dx += 1
      }

      const hauling = !!game.carrying
      const moving = dx !== 0 || dy !== 0
      const sprinting = game.keys.has('ShiftLeft') || game.keys.has('ShiftRight')
      let ground = (sprinting ? SPRINT_SPEED : WALK_SPEED) * (hauling ? CARRY_SPEED : 1)
      // Soul sand drags at your feet, so being off the ground is a way out of
      // it - the penalty is on walking through it, not on being over it.
      if (!p.airborne && game.world[Math.floor(p.y)]?.[Math.floor(p.x)] === SOUL_SAND) {
        ground *= SOUL_SAND_SLOW
      }

      if (moving) {
        const len = Math.hypot(dx, dy)
        dx /= len
        dy /= len
        p.facing = { x: dx, y: dy }
      }

      // No jumping with your arms full.
      if (!p.airborne && !hauling && !frozen && game.keys.has('Space')) {
        p.airborne = true
        p.jumpT = 0
        p.airSpeed = moving ? ground : WALK_SPEED
      }

      const speed = p.airborne ? p.airSpeed : ground
      if (moving) {
        const next = stepMove(
          game.world, game.blocks, p, dx * speed * dt, dy * speed * dt, p.airborne,
        )
        p.x = next.x
        p.y = next.y
      }

      if (p.airborne) {
        p.jumpT += dt
        if (p.jumpT >= JUMP_TIME) {
          p.airborne = false
          p.jumpT = 0
          const spot = landingSpot(game.world, game.blocks, p, p.facing)
          if (spot) {
            p.x = spot.x
            p.y = spot.y
          } else {
            p.falling = 0.0001
          }
        }
      }

      if (!p.airborne && overVoid(game.world, game.blocks, p.x, p.y)) p.falling = 0.0001

      // Through the portal and into the arena.
      if (game.sphinx.gone && !game.inArena &&
          Math.hypot(PORTAL_CENTRE.x - p.x, PORTAL_CENTRE.y - p.y) <= PORTAL_RANGE) {
        if (game.carrying) setDown() // whatever you were hauling stays behind
        game.inArena = true
        p.x = ARENA_SPAWN.x
        p.y = ARENA_SPAWN.y
        p.airborne = false
        p.jumpT = 0
        p.invuln = HURT_INVULN * 3
        say(p.x, p.y, 'Something is watching', 'note')
        bump()
      }

      for (const g of [...game.ground]) {
        if (Math.hypot(g.x + 0.5 - p.x, g.y + 0.5 - p.y) >= PICKUP_RANGE) continue
        const copy = { ...g.item }
        if (addToSlots(inv.hotbar, copy) || addToSlots(inv.main, copy)) {
          game.ground = game.ground.filter((o) => o !== g)
          say(p.x, p.y, 'Picked up a sword', 'note')
          bump()
        }
      }

      const atSlab =
        Math.hypot(INSCRIPTION_CENTRE.x - p.x, INSCRIPTION_CENTRE.y - p.y) <= INSCRIPTION_RANGE
      if (atSlab !== ui.atSlab) {
        ui.atSlab = atSlab
        bump()
      }

      const near = ARENA_SLABS.findIndex((slab) => {
        const c = slabCentre(slab)
        return Math.hypot(c.x - p.x, c.y - p.y) <= SLAB_RANGE
      })
      const slab = near < 0 ? null : near
      if (slab !== ui.slab) {
        ui.slab = slab
        bump()
      }

      if (game.chest && !game.chest.opened &&
          Math.hypot(game.chest.x - p.x, game.chest.y - p.y) <= 1.4) {
        takeChest()
      }
    }

    function updateSphinx(dt) {
      const s = game.sphinx
      if (!game.answered || s.gone) return
      s.fade += dt
      if (s.fade >= SPHINX_FADE) {
        s.gone = true
        openSphinx(game.world)
        say(game.player.x, game.player.y, 'The way is open', 'note')
        bump()
      }
    }

    function update(dt) {
      // Dying rebuilds the world from inside one of these steps, so each one
      // checks the run it started in is still the run that is going.
      const gen = game.gen
      for (const step of [
        updatePlayer, updatePhantoms, updateSphinx, updateEyes, updateBeams,
        updateFire, updateBolts, updateCracks, updateDecay, updateSand,
        updatePortals,
        updateMining,
      ]) {
        step(dt)
        if (game.gen !== gen) return
      }
      if (game.swing > 0) game.swing = Math.max(0, game.swing - dt)
      game.floats = game.floats.filter((f) => (f.t -= dt) > 0)
    }

    // ------------------------------------------------------------ drawing

    const grain = (x, y) => Math.abs((x * 73856093) ^ (y * 19349663)) % 7
    const sx = (wx) => wx * BLOCK - game.camera.x
    const sy = (wy) => wy * BLOCK - game.camera.y

    function drawTiles() {
      const fx = Math.max(0, Math.floor(game.camera.x / BLOCK))
      const lx = Math.min(WORLD_W - 1, fx + Math.ceil(VIEW_W / BLOCK) + 1)
      const fy = Math.max(0, Math.floor(game.camera.y / BLOCK))
      const ly = Math.min(WORLD_H - 1, fy + Math.ceil(VIEW_H / BLOCK) + 1)
      for (let y = fy; y <= ly; y++) {
        for (let x = fx; x <= lx; x++) {
          const px = sx(x)
          const py = sy(y)
          const t = game.world[y][x]

          if (t === VOID) {
            ctx.fillStyle = '#08060b'
            ctx.fillRect(px, py, BLOCK, BLOCK)
            if (y > 0 && game.world[y - 1][x] !== VOID) {
              ctx.fillStyle = '#150f1c'
              ctx.fillRect(px, py, BLOCK, 8)
            }
            continue
          }
          if (t === WALL) {
            ctx.fillStyle = '#4a3a26'
            ctx.fillRect(px, py, BLOCK, BLOCK)
            ctx.fillStyle = '#5c4830'
            ctx.fillRect(px + 3, py + 3, BLOCK - 6, BLOCK - 6)
            continue
          }
          if (t === SANDSTONE) {
            ctx.fillStyle = grain(x, y) < 3 ? '#d8bf8d' : '#cfb480'
            ctx.fillRect(px, py, BLOCK, BLOCK)
            ctx.fillStyle = 'rgba(90,70,40,0.35)'
            ctx.fillRect(px, py + BLOCK - 3, BLOCK, 3)
            ctx.fillRect(px + (y % 2 ? BLOCK - 3 : 0), py, 3, BLOCK)
            continue
          }
          if (t === SOUL_SOIL || t === SOUL_SAND) {
            const sand = t === SOUL_SAND
            ctx.fillStyle = sand ? '#4a3c33' : '#3b2f2a'
            ctx.fillRect(px, py, BLOCK, BLOCK)
            // Soul sand wears its faces, so the half that slows you down can be
            // read at a glance.
            if (sand) {
              ctx.fillStyle = '#6b5648'
              ctx.fillRect(px + 8, py + 10, 7, 7)
              ctx.fillRect(px + 24, py + 10, 7, 7)
              ctx.fillRect(px + 12, py + 25, 16, 5)
            } else {
              ctx.fillStyle = '#332924'
              ctx.fillRect(px + 6, py + 8, 12, 9)
              ctx.fillRect(px + 22, py + 22, 11, 10)
            }
            continue
          }
          ctx.fillStyle = grain(x, y) < 2 ? '#e0c78f' : '#dcc189'
          ctx.fillRect(px, py, BLOCK, BLOCK)
          ctx.fillStyle = 'rgba(150,120,70,0.18)'
          ctx.fillRect(px, py + BLOCK - 2, BLOCK, 2)
        }
      }

      // A cracked tile is one second from being a hole, so it has to read at a
      // glance. Dark cracks on soul soil are invisible - it gets a hot fill
      // that drains with the second it has left, and pale splits on top.
      for (const [k, left] of game.cracks) {
        const [x, y] = k.split(',').map(Number)
        const px = sx(x)
        const py = sy(y)
        if (px < -BLOCK || px > VIEW_W || py < -BLOCK || py > VIEW_H) continue
        ctx.fillStyle = `rgba(255,120,60,${0.15 + 0.4 * (1 - left / CRACK_HOLD)})`
        ctx.fillRect(px, py, BLOCK, BLOCK)
        ctx.strokeStyle = '#ffd9a8'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(px + 4, py + 6)
        ctx.lineTo(px + 18, py + 20)
        ctx.lineTo(px + 12, py + 34)
        ctx.moveTo(px + 20, py + 22)
        ctx.lineTo(px + 34, py + 12)
        ctx.stroke()
        ctx.strokeStyle = 'rgba(20,8,4,0.8)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    function drawFires() {
      const t = performance.now() / 120
      for (const [k, left] of game.fires) {
        const [x, y] = k.split(',').map(Number)
        const px = sx(x)
        const py = sy(y)
        if (px < -BLOCK || px > VIEW_W || py < -BLOCK || py > VIEW_H) continue
        ctx.globalAlpha = Math.min(1, left / 1.5)
        const flick = Math.sin(t + x * 1.7 + y * 2.3) * 4
        ctx.fillStyle = '#2b6bd6'
        ctx.beginPath()
        ctx.moveTo(px + 4, py + BLOCK - 2)
        ctx.lineTo(px + BLOCK / 2, py + 4 + flick)
        ctx.lineTo(px + BLOCK - 4, py + BLOCK - 2)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#7fdcff'
        ctx.beginPath()
        ctx.moveTo(px + 12, py + BLOCK - 4)
        ctx.lineTo(px + BLOCK / 2, py + 15 + flick)
        ctx.lineTo(px + BLOCK - 12, py + BLOCK - 4)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    /** The carved slab on the south wall. */
    function drawInscription() {
      const px = sx(INSCRIPTION.x0)
      const py = sy(INSCRIPTION.y0)
      const w = (INSCRIPTION.x1 - INSCRIPTION.x0 + 1) * BLOCK
      const h = (INSCRIPTION.y1 - INSCRIPTION.y0 + 1) * BLOCK
      if (px > VIEW_W || px + w < 0) return
      ctx.fillStyle = '#6b5335'
      ctx.fillRect(px, py, w, h)
      ctx.fillStyle = '#caa96f'
      ctx.fillRect(px + 6, py + 6, w - 12, h - 12)
      ctx.fillStyle = '#8a6f45'
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + 20, py + 18 + i * 12, w - 40 - (i % 2) * 30, 5)
      }
      ctx.fillStyle = '#3b2d1a'
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('THE INSCRIPTION', px + w / 2, py - 8)
      ctx.textAlign = 'left'
    }

    /** The three slabs cut into the arena's south wall. */
    function drawArenaSlabs() {
      ARENA_SLABS.forEach((slab, i) => {
        const px = sx(slab.x0)
        const py = sy(slab.y0)
        const w = (slab.x1 - slab.x0 + 1) * BLOCK
        const h = (slab.y1 - slab.y0 + 1) * BLOCK
        if (px > VIEW_W || px + w < 0) return
        const blank = i === 2 && !game.chain?.ySide
        ctx.fillStyle = '#2a211c'
        ctx.fillRect(px, py, w, h)
        ctx.fillStyle = blank ? '#4a3f38' : '#7a6a4a'
        ctx.fillRect(px + 6, py + 6, w - 12, h - 12)
        if (!blank) {
          ctx.fillStyle = '#c9b184'
          for (let r = 0; r < 3; r++) {
            ctx.fillRect(px + 20, py + 18 + r * 14, w - 40 - (r % 2) * 30, 5)
          }
        }
        ctx.fillStyle = '#e0c78f'
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(['FIRST', 'SECOND', 'THIRD'][i], px + w / 2, py - 8)
        ctx.textAlign = 'left'
      })
    }

    function drawChest() {
      const c = game.chest
      if (!c) return
      const px = sx(c.x) - BLOCK / 2
      const py = sy(c.y) - BLOCK / 2
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.ellipse(px + BLOCK / 2, py + BLOCK - 5, 18, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#6b4423'
      ctx.fillRect(px - 4, py + 8, BLOCK + 8, BLOCK - 12)
      ctx.fillStyle = '#8a5a2b'
      ctx.fillRect(px - 2, py + 10, BLOCK + 4, 12)
      ctx.fillStyle = '#ffcd75'
      ctx.fillRect(px + BLOCK / 2 - 4, py + 20, 8, 10)
      if (!c.opened) {
        ctx.fillStyle = '#f2f4f8'
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('walk up to open', px + BLOCK / 2, py - 6)
        ctx.textAlign = 'left'
      }
    }

    /** One giant tablet, on the floor or in your arms. */
    function drawVarBlock(px, py, b, scale = 1) {
      const size = BLOCK_SPAN * BLOCK * scale
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(px + 5, py + 9, size, size)
      ctx.fillStyle = '#6e727b'
      ctx.fillRect(px, py, size, size)
      ctx.fillStyle = '#878c96'
      ctx.fillRect(px + 5, py + 5, size - 10, size - 10)
      ctx.strokeStyle = '#43464d'
      ctx.lineWidth = 3
      ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3)
      // Only the letters are coloured. The tablet is stone like everything else.
      ctx.font = `bold ${Math.round((b.pair ? 32 : 46) * scale)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (b.pair) {
        ctx.fillStyle = b.tone
        ctx.fillText(b.syms[0], px + size * 0.32, py + size / 2 + 2)
        ctx.fillStyle = b.tone2
        ctx.fillText(b.syms[1], px + size * 0.68, py + size / 2 + 2)
      } else {
        ctx.fillStyle = b.tone
        ctx.fillText(b.sym, px + size / 2, py + size / 2 + 2)
      }
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }

    /** The sword, waiting in the sand. */
    /** Blocks the player has put down: sand, and the pair of eyes. */
    function drawPlacedBlocks() {
      for (const [k, kind] of game.blocks) {
        if (kind !== 'sand' && kind !== 'eye') continue
        const [x, y] = k.split(',').map(Number)
        const px = sx(x)
        const py = sy(y)
        if (px < -BLOCK || px > VIEW_W || py < -BLOCK || py > VIEW_H) continue
        if (kind === 'eye') {
          ctx.fillStyle = '#f2eee6'
          ctx.beginPath()
          ctx.ellipse(px + BLOCK / 2, py + BLOCK / 2, BLOCK * 0.42, BLOCK * 0.3, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#c14fd0'
          ctx.beginPath()
          ctx.arc(px + BLOCK / 2, py + BLOCK / 2, BLOCK * 0.2, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#0b0d12'
          ctx.beginPath()
          ctx.arc(px + BLOCK / 2, py + BLOCK / 2, BLOCK * 0.09, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        ctx.fillStyle = '#d9c184'
        ctx.fillRect(px, py, BLOCK, BLOCK)
        ctx.fillStyle = '#c4a969'
        ctx.fillRect(px + 5, py + 6, 12, 9)
        ctx.fillRect(px + 22, py + 21, 11, 10)
        ctx.strokeStyle = '#8a7345'
        ctx.lineWidth = 2
        ctx.strokeRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2)
        // Sand over a hole cracks while it is deciding to fall.
        const left = game.sand.get(k)
        if (left === undefined) continue
        ctx.strokeStyle = 'rgba(40,25,10,0.8)'
        ctx.beginPath()
        ctx.moveTo(px + 5, py + 7)
        ctx.lineTo(px + 19, py + 21)
        ctx.lineTo(px + 13, py + 35)
        ctx.moveTo(px + 21, py + 23)
        ctx.lineTo(px + 35, py + 13)
        ctx.stroke()
      }
    }

    /** How far through digging a block you are. */
    function drawMining() {
      const m = game.mining
      if (!m) return
      const kind = game.blocks.get(key(m.tx, m.ty))
      if (!kind) return
      const px = sx(m.tx)
      const py = sy(m.ty)
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(px + 2, py + BLOCK - 12, BLOCK - 4, 8)
      ctx.fillStyle = '#ffcd75'
      ctx.fillRect(px + 3, py + BLOCK - 11, (BLOCK - 6) * (m.t / mineSeconds(kind)), 6)
    }

    function drawGroundItems() {
      const bob = Math.sin(performance.now() / 300) * 3
      for (const g of game.ground) {
        const px = sx(g.x)
        const py = sy(g.y) + bob
        if (px < -BLOCK || px > VIEW_W) continue
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(px + BLOCK / 2, sy(g.y) + BLOCK - 8, 12, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.save()
        ctx.translate(px + BLOCK / 2, py + BLOCK / 2)
        ctx.rotate(-Math.PI / 4)
        ctx.fillStyle = '#b9c0c8'
        ctx.fillRect(-3, -16, 6, 22)
        ctx.fillStyle = '#6b4a2a'
        ctx.fillRect(-7, 6, 14, 4)
        ctx.fillRect(-2, 10, 4, 7)
        ctx.restore()
      }
    }

    function drawVarBlocks() {
      for (const b of game.vars) {
        if (b.placed || b.id === game.carrying) continue
        drawVarBlock(sx(b.x), sy(b.y), b)
      }
    }

    function drawCarried() {
      const b = carried()
      if (!b) return
      const p = game.player
      const size = BLOCK_SPAN * BLOCK * 0.55
      drawVarBlock(sx(p.x) - size / 2, sy(p.y) - size / 2 - 14, b, 0.55)
    }

    /**
     * Blue body, blue wings, green eyes, and white scales over both. Dead, the
     * same shape is drawn as an empty outline until it comes back.
     */
    function drawPhantom(f) {
      const px = sx(f.x)
      const py = sy(f.y)
      if (px < -80 || px > VIEW_W + 80 || py < -80 || py > VIEW_H + 80) return
      const ghost = f.dead
      const flap = Math.sin(performance.now() / 140 + f.radius) * 7
      // It faces along its ring, which is a quarter turn from the radius.
      const heading = f.angle + Math.PI / 2

      ctx.save()
      ctx.translate(px, py)
      if (!ghost) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.beginPath()
        ctx.ellipse(0, 22, 16, 6, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.rotate(heading + Math.PI / 2)

      const wing = (side) => {
        ctx.beginPath()
        ctx.moveTo(side * 5, -4)
        ctx.lineTo(side * 30, -14 - flap)
        ctx.lineTo(side * 26, 4 - flap * 0.5)
        ctx.closePath()
      }

      if (ghost) {
        ctx.strokeStyle = 'rgba(120,190,255,0.75)'
        ctx.lineWidth = 2
        wing(-1)
        ctx.stroke()
        wing(1)
        ctx.stroke()
        ctx.beginPath()
        ctx.ellipse(0, 0, 10, 16, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
        return
      }

      ctx.fillStyle = '#2f6ad0'
      wing(-1)
      ctx.fill()
      wing(1)
      ctx.fill()
      // White scales, on the wings as well as the body.
      ctx.fillStyle = '#eef4ff'
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(-8 - i * 6, -8 - flap * 0.6 + i, 4, 3)
        ctx.fillRect(4 + i * 6, -8 - flap * 0.6 + i, 4, 3)
      }
      ctx.fillStyle = '#3f7ee6'
      ctx.beginPath()
      ctx.ellipse(0, 0, 10, 16, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#eef4ff'
      for (let i = -1; i <= 2; i++) {
        ctx.fillRect(-6, i * 7 - 2, 5, 4)
        ctx.fillRect(2, i * 7 + 1, 5, 4)
      }
      ctx.fillStyle = '#4fdc7a'
      ctx.beginPath()
      ctx.arc(-4.5, -10, 3.4, 0, Math.PI * 2)
      ctx.arc(4.5, -10, 3.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = '#1a1c22'
      ctx.fillRect(px - 15, py - 30, 30, 5)
      ctx.fillStyle = '#ff5a5f'
      ctx.fillRect(px - 14, py - 29, 28 * (f.hp / PHANTOM_HP), 3)
    }

    function drawBeams() {
      for (const b of game.beams) drawBeam(b)
    }

    function drawBeam(b) {
      const px = sx(b.x)
      const py = sy(b.y)
      const w = BEAM_HALF_WIDTH * 2 * BLOCK
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(b.angle)
      if (!b.fired) {
        ctx.strokeStyle = 'rgba(255,120,120,0.8)'
        ctx.setLineDash([10, 8])
        ctx.lineWidth = 2
        ctx.strokeRect(0, -w / 2, BEAM_RANGE * BLOCK, w)
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = 'rgba(255,60,60,0.45)'
        ctx.fillRect(0, -w / 2, BEAM_RANGE * BLOCK, w)
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, -w / 6, BEAM_RANGE * BLOCK, w / 3)
      }
      ctx.restore()
    }

    function drawEyes() {
      for (const e of game.eyes) if (e.awake) drawEye(e)
    }

    /** Three blocks of eye, of which the middle two are what you can hit. */
    function drawEye(e) {
      const px = sx(e.x)
      const py = sy(e.y)
      if (px < -300 || px > VIEW_W + 300) return
      const r = (EYE_SIZE * BLOCK) / 2
      const look = Math.atan2(game.player.y - e.y, game.player.x - e.x)

      // Dead, it is only the shape of an eye, and only for ten seconds.
      if (e.dead) {
        ctx.strokeStyle = 'rgba(220,220,235,0.7)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(px, py, r * 0.45, 0, Math.PI * 2)
        ctx.stroke()
        return
      }

      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.ellipse(px, py + r * 0.8, r * 0.9, r * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#f2eee6'
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8d2b3a'
      ctx.lineWidth = 2
      for (let i = 0; i < 9; i++) {
        const a = (i * 2.399) % (Math.PI * 2)
        ctx.beginPath()
        ctx.moveTo(px + Math.cos(a) * r * 0.35, py + Math.sin(a) * r * 0.35)
        ctx.lineTo(px + Math.cos(a) * r * 0.95, py + Math.sin(a) * r * 0.95)
        ctx.stroke()
      }
      const ix = px + Math.cos(look) * r * 0.3
      const iy = py + Math.sin(look) * r * 0.3
      ctx.fillStyle = '#3f7ee6'
      ctx.beginPath()
      ctx.arc(ix, iy, r * 0.45, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0b0d12'
      ctx.beginPath()
      ctx.arc(ix, iy, r * 0.22, 0, Math.PI * 2)
      ctx.fill()
    }

    function drawBolts() {
      for (const b of game.bolts) {
        ctx.save()
        ctx.translate(sx(b.x), sy(b.y))
        ctx.rotate(b.spin)
        ctx.fillStyle = '#7b7f88'
        ctx.fillRect(-11, -11, 22, 22)
        ctx.strokeStyle = '#3a3d45'
        ctx.lineWidth = 2
        ctx.strokeRect(-11, -11, 22, 22)
        ctx.restore()
      }
    }

    function drawSphinx() {
      const s = game.sphinx
      if (s.gone) return
      const px = sx(SPHINX.x0)
      const py = sy(SPHINX.y0)
      const w = (SPHINX.x1 - SPHINX.x0 + 1) * BLOCK
      const h = (SPHINX.y1 - SPHINX.y0 + 1) * BLOCK
      if (px > VIEW_W || px + w < 0) return

      ctx.save()
      ctx.globalAlpha = 1 - s.fade / SPHINX_FADE
      ctx.fillStyle = '#c9a86a'
      ctx.fillRect(px, py + h * 0.3, w, h * 0.7)
      ctx.fillStyle = '#d9bc80'
      ctx.fillRect(px + 6, py + h * 0.36, w - 12, h * 0.55)
      ctx.fillStyle = '#b9975c'
      ctx.fillRect(px + 10, py + h - 22, w * 0.3, 16)
      ctx.fillRect(px + w - 10 - w * 0.3, py + h - 22, w * 0.3, 16)

      const hx = px + w / 2
      ctx.fillStyle = '#c9a86a'
      ctx.beginPath()
      ctx.moveTo(hx - 46, py + h * 0.42)
      ctx.lineTo(hx - 30, py + 6)
      ctx.lineTo(hx + 30, py + 6)
      ctx.lineTo(hx + 46, py + h * 0.42)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#7c6238'
      for (let i = -2; i <= 2; i++) ctx.fillRect(hx + i * 14 - 3, py + 8, 5, h * 0.34)
      ctx.fillStyle = '#e2c68d'
      ctx.fillRect(hx - 22, py + 14, 44, h * 0.34)
      ctx.fillStyle = '#3b2d1a'
      ctx.fillRect(hx - 15, py + 30, 9, 7)
      ctx.fillRect(hx + 6, py + 30, 9, 7)
      ctx.fillRect(hx - 9, py + 48, 18, 4)
      ctx.restore()
    }

    function drawPortal() {
      if (!game.sphinx.gone) return
      const px = sx(PORTAL.x0)
      const py = sy(PORTAL.y0)
      const w = (PORTAL.x1 - PORTAL.x0 + 1) * BLOCK
      const h = (PORTAL.y1 - PORTAL.y0 + 1) * BLOCK
      if (px > VIEW_W || px + w < 0) return
      const t = performance.now() / 600
      ctx.fillStyle = '#3a1030'
      ctx.fillRect(px - 4, py - 4, w + 8, h + 8)
      for (let i = 4; i >= 0; i--) {
        const k = i / 4
        ctx.fillStyle = `rgba(${255 - k * 40}, ${90 + k * 60}, ${200 + k * 40}, ${0.35 + k * 0.15})`
        const inset = (1 - k) * 10 + Math.sin(t + i) * 3
        ctx.fillRect(px + inset, py + inset, w - inset * 2, h - inset * 2)
      }
    }

    function drawPlayer() {
      const p = game.player
      const px = sx(p.x)
      const py = sy(p.y)
      const lift = p.airborne ? Math.sin((Math.PI * p.jumpT) / JUMP_TIME) * JUMP_LIFT : 0
      const shrink = p.falling > 0 ? 1 - p.falling / FALL_TIME : 1

      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.beginPath()
      ctx.ellipse(px, py + 12, 13 - lift * 0.2, 6 - lift * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.translate(px, py - lift)
      ctx.scale(shrink, shrink)
      if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.45
      ctx.fillStyle = '#3f6fc4'
      ctx.fillRect(-12, -6, 24, 18)
      ctx.fillStyle = '#e8b489'
      ctx.beginPath()
      ctx.arc(0, -6, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#4a3524'
      ctx.beginPath()
      ctx.arc(0, -8, 11, Math.PI, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2b2f38'
      ctx.beginPath()
      ctx.arc(p.facing.x * 8, -6 + p.facing.y * 8, 3, 0, Math.PI * 2)
      ctx.fill()

      // Still alight: blue flames on your own shoulders.
      if (p.burn > 0) {
        const t = performance.now() / 90
        ctx.fillStyle = '#7fdcff'
        for (let i = -1; i <= 1; i++) {
          const f = Math.sin(t + i * 2) * 4
          ctx.beginPath()
          ctx.moveTo(i * 9 - 4, -10)
          ctx.lineTo(i * 9, -22 - f)
          ctx.lineTo(i * 9 + 4, -10)
          ctx.closePath()
          ctx.fill()
        }
      }

      if (game.swing > 0) {
        const t = 1 - game.swing / SWING_TIME
        const aim = game.swingAim || p.facing
        const base = Math.atan2(aim.y, aim.x)
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(0, -2, 30, base - 1 + t * 2, base - 0.6 + t * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.restore()
    }

    function drawFloats() {
      ctx.font = 'bold 16px monospace'
      for (const f of game.floats) {
        ctx.globalAlpha = Math.min(1, f.t)
        ctx.fillStyle =
          f.tone === 'hurt' ? '#ff5a5f' : f.tone === 'note' ? '#7fdcff' : '#ffcd75'
        ctx.fillText(f.text, sx(f.x) + 14, sy(f.y) - (1.2 - f.t) * 26)
      }
      ctx.globalAlpha = 1
    }

    /** A ring on the tablet you are close enough to pick up. */
    function drawGrabHint() {
      if (game.carrying) return
      for (const b of game.vars) {
        if (b.placed || !nearEnough(game.player, b)) continue
        ctx.strokeStyle = '#ffcd75'
        ctx.lineWidth = 3
        ctx.strokeRect(sx(b.x) - 3, sy(b.y) - 3, BLOCK_SPAN * BLOCK + 6, BLOCK_SPAN * BLOCK + 6)
        ctx.fillStyle = '#ffcd75'
        ctx.font = 'bold 13px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('F to lift', sx(b.x) + BLOCK, sy(b.y) - 12)
        ctx.textAlign = 'left'
      }
    }

    function draw() {
      game.camera.x = Math.max(
        0, Math.min(WORLD_W * BLOCK - VIEW_W, game.player.x * BLOCK - VIEW_W / 2),
      )
      game.camera.y = Math.max(
        0, Math.min(WORLD_H * BLOCK - VIEW_H, game.player.y * BLOCK - VIEW_H / 2),
      )
      ctx.fillStyle = '#171008'
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      drawTiles()
      drawInscription()
      drawPortal()
      drawSphinx()
      drawPlacedBlocks()
      drawGroundItems()
      drawVarBlocks()
      drawGrabHint()
      drawFires()
      drawArenaSlabs()
      drawChest()
      drawEyes()
      drawBeams()
      for (const f of game.phantoms) drawPhantom(f)
      drawBolts()
      drawPlayer()
      drawCarried()
      drawMining()
      drawFloats()
    }

    // The panels live outside this effect, so the handful of things they need
    // to set in motion are handed out here.
    game.api = { summonSquad, addEye, freshChain }

    let raf = 0
    let last = performance.now()
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      update(dt)
      draw()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      stashRef.current?.(cloneInventory(inv))
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('contextmenu', onContext)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ---------------------------------------------------------------- HUD

  const ui = uiRef.current
  const inv = invRef.current
  const game = gameRef.current
  const slots = game ? game.slots : [null, null, null]
  const spec = game?.spec
  const locked = slots.every(Boolean)
  const solveLetter = locked ? slots[spec.solveSlot] : null
  const answer = locked ? inscriptionAnswer(spec, slots) : null
  const eyes = game?.eyes ?? []
  const bars = eyes.filter((e) => e.awake)
  // Black while they keep getting back up, and the ordinary colour once they
  // have stopped.
  const forGood = game?.phase === 'won'
  const hauling = game?.carrying ? game.vars.find((b) => b.id === game.carrying) : null
  const puzzle = game?.puzzle
  const chain = game?.chain

  const atArenaSlab = !!game?.inArena && ui.slab !== null && !!puzzle
  const docked = (ui.atSlab && !!spec) || atArenaSlab || ui.sphinxOpen

  const want = (value) => canonical(parseSide(ratText(value)))

  /** Both letters go in at once - there is only the one tablet. */
  function seatTablet() {
    const t = game.vars.find((v) => v.id === game.carrying && v.pair)
    if (!t || chain.seated) return
    t.placed = true
    game.carrying = null
    chain.seated = true
    game.phase = 'chain'
    game.api.summonSquad()
    bump()
  }

  /** The second slab: plug x in, then get y on its own. */
  const setEq2 = (updater) => {
    chain.eq2 = typeof updater === 'function' ? updater(chain.eq2) : updater
    const got = solvedExpr(chain.eq2, 'y')
    if (got && canonEq(got, want(puzzle.yValue))) chain.ySide = solutionSide(chain.eq2, 'y')
    bump()
  }
  const plug2 = (sideKey, gi) => {
    chain.eq2 = {
      ...chain.eq2,
      [sideKey]: substitute(chain.eq2[sideKey], gi, 'x', chain.xSide),
    }
    chain.plugged2 = true
    bump()
  }

  /** The third slab: y goes into your own expression and out comes x. */
  const setEq3 = (updater) => {
    chain.eq3 = typeof updater === 'function' ? updater(chain.eq3) : updater
    const got = solvedExpr(chain.eq3, 'x')
    if (got && canonEq(got, want(puzzle.xValue))) chain.xSide2 = solutionSide(chain.eq3, 'x')
    bump()
  }
  const plug3 = (sideKey, gi) => {
    chain.eq3 = {
      ...chain.eq3,
      [sideKey]: substitute(chain.eq3[sideKey], gi, 'y', chain.ySide),
    }
    chain.plugged3 = true
    bump()
  }

  /**
   * The first slab hears the number. Wrong, and every equation is thrown away,
   * a new pair carved, and one more eye put in the room - for as long as it
   * takes.
   */
  function answerX(text) {
    const parsed = parseSide(String(text).includes('=') ? String(text).split('=').pop() : text)
    if (!parsed) {
      chain.note = 'Write a number, like -7/4'
      return bump()
    }
    if (canonEq(canonical(parsed), want(puzzle.xValue))) {
      game.phase = 'won'
      chain.note = ''
      bump()
      return
    }
    game.api.freshChain()
    game.chain.seated = true
    game.chain.note = 'Wrong. Everything is carved again, and there is one more of them.'
    game.api.addEye()
    bump()
  }

  const slotProps = slotBinder({ inv, ui, dragRef, bump })

  /** Which sockets will respond to a click. Nothing does, once it is full. */
  const liveFor = (slot) => {
    if (locked || !game) return false
    return slots[slot] ? !game.carrying : !!game.carrying
  }

  function onSlot(slot) {
    if (!liveFor(slot)) return
    const held = game.vars.find((b) => b.id === game.carrying)
    if (slots[slot]) {
      // Taking one back out - you are carrying it again.
      const b = game.vars.find((v) => v.sym === slots[slot])
      b.placed = false
      game.carrying = b.id
      game.slots[slot] = null
    } else if (held) {
      held.placed = true
      game.carrying = null
      game.slots[slot] = held.sym
    }
    bump()
  }

  /** The Sphinx hears an answer. She never says whether it was close. */
  function ask(text) {
    if (!game || game.answered) return
    const body = text.includes('=') ? text.split('=').pop() : text
    const parsed = parseSide(body)
    if (!parsed) {
      const others = answer ? slots.filter((s) => s !== solveLetter) : ['y', 'z']
      ui.note = `Write it out like  ${formatHint(others, answer)}`
      return bump()
    }
    ui.note = ''
    if (answer && canonEq(canonical(parsed), answer)) {
      game.answered = true
      ui.sphinxOpen = false
    }
    bump()
  }

  return (
    <div className="screen screen--game">
      <BackButton onBack={onBack} />
      <h2 className="heading">Sand Temple</h2>

      <div className="temple-stage">
        {bars.length > 0 && (
          <div className="boss-stack">
            {bars.map((e) => (
              <div className="boss-bar" key={e.id}>
                {/* Every one of them is just "Eye". They are not numbered and
                    they are not told apart. */}
                <span className="boss-name">Eye</span>
                <span className="boss-track">
                  <span
                    className={'boss-fill' + (forGood ? '' : ' boss-fill--dark')}
                    style={{ width: `${(e.dead ? 0 : e.hp / EYE_HP) * 100}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Once the slab locks, the question travels with you - you have to
            walk all the way back to her to answer it. */}
        {locked && !game.inArena && (
          <div className="slab-banner">
            <InscriptionEquation
              spec={spec}
              slots={slots}
              liveFor={() => false}
              onSlot={() => {}}
            />
            <span className="slab-ask">
              Solve for <span className={'eq-x eq-sym--' + solveLetter}>{solveLetter}</span>
            </span>
          </div>
        )}

        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="temple-canvas" />

        {hauling && (
          <div className="carry-tag">
            Hauling <span className={'eq-x eq-sym--' + hauling.sym}>{hauling.sym}</span> · both
            hands full · click to set it down
          </div>
        )}

        <div className="hud-bottom">
          <Hearts health={game ? game.player.health : MAX_HEALTH} />
          <div className="hotbar">
            {inv.hotbar.map((item, i) => (
              <Slot
                key={i}
                item={item}
                selected={i === inv.selected}
                onClick={() => {
                  inv.selected = i
                  bump()
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="op-hint">
        WASD to move · SPACE to jump · LEFT SHIFT to sprint · E for the bag ·
        F to lift or set down a tablet · left click to swing, to speak to the
        Sphinx, or to beat out a flame
      </p>

      {/* Everything you can actually work at is docked to the bottom of the
          window. It used to sit under the canvas, where on most screens it
          was simply below the fold and looked like nothing had happened. */}
      {docked && (
        <div className="temple-dock">
        {ui.atSlab && spec && (
          <div className="panel slab-panel">
            <InscriptionEquation spec={spec} slots={slots} liveFor={liveFor} onSlot={onSlot} />
            {locked ? (
              <>
                <p className="body-text">
                  Solve for <span className={'eq-x eq-sym--' + solveLetter}>{solveLetter}</span>.
                </p>
                <p className="op-note">
                  The slab has nothing more to say. Find the answer yourself.
                </p>
              </>
            ) : (
              <p className="op-hint">
                {game?.carrying
                  ? 'Click a socket to seat the tablet you are carrying.'
                  : 'Three sockets, and no rule about which tablet goes in which.'}
              </p>
            )}
          </div>
        )}

        {game?.inArena && ui.slab === 0 && puzzle && (
          <SlabOne
            puzzle={puzzle}
            seated={chain.seated}
            carrying={!!game.vars.find((v) => v.id === game.carrying && v.pair)}
            onSeat={seatTablet}
            onAnswer={answerX}
            note={chain.note}
          />
        )}

        {game?.inArena && ui.slab === 1 && puzzle && (
          <SlabTwo
            puzzle={puzzle}
            seated={chain.seated}
            xSide={chain.xSide}
            eq={chain.eq2}
            setEq={setEq2}
            plugged={chain.plugged2}
            onPlug={plug2}
            onReset={() => {
              chain.eq2 = assignedEquation(puzzle.second, puzzle.letters)
              chain.plugged2 = false
              bump()
            }}
            solved={chain.ySide}
          />
        )}

        {game?.inArena && ui.slab === 2 && puzzle && (
          <SlabThree
            ySide={chain.seated ? chain.ySide : null}
            eq={chain.eq3}
            setEq={setEq3}
            plugged={chain.plugged3}
            onPlug={plug3}
            onReset={() => {
              chain.eq3 = asEquation('x', chain.xSide)
              chain.plugged3 = false
              bump()
            }}
            solved={chain.xSide2}
          />
        )}

        {ui.sphinxOpen && (
          <SphinxPanel
            note={ui.note}
            onAsk={ask}
            onClose={() => {
              ui.sphinxOpen = false
              ui.note = ''
              bump()
            }}
          />
        )}

        </div>
      )}

      {ui.loot && (
        <div className="inv-overlay">
          <div className="panel loot-panel">
            <h3 className="heading">The hoard</h3>
            <ul className="loot-list">
              <li>
                <span className="emerald-dot" /> {ui.loot.emeralds} emeralds
              </li>
              <li>{ui.loot.sand} sand</li>
              <li>{ui.loot.eyes} eyes</li>
            </ul>
            <p className="op-note">
              Sand digs out in a second, and holds over a hole for one before it
              drops through. Put both eyes down and each is the way to the other.
            </p>
            <button
              type="button"
              className="pixel-btn"
              onClick={() => {
                ui.loot = null
                bump()
              }}
            >
              Take it
            </button>
          </div>
        </div>
      )}

      {ui.invOpen && (
        <InventoryPanel
          inv={inv}
          slotProps={slotProps}
          onClose={() => {
            ui.invOpen = false
            ui.pick = null
            bump()
          }}
        />
      )}
    </div>
  )
}
