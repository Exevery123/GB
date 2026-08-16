import { useEffect, useReducer, useRef } from 'react'
import BackButton from '../BackButton.jsx'
import EquationView from '../algebra/EquationView.jsx'
import {
  BAGS, cloneInventory, Hearts, makeInventory, restoreInventory, Slot,
} from './Kit.jsx'
import {
  applyOperation, isCorrect, keypadEquation, parseOperand, ratText, solvedValue,
} from '../algebra/equation.js'
import { chestReward } from '../save.js'
import {
  ACID_IMPACT_DAMAGE, ACID_TICK, ACID_TICK_DAMAGE, addToSlots, angleDiff,
  BITE_ARC, BITE_COOLDOWN, BITE_DAMAGE, BITE_REACH, BLOCK,
  blocked, boltLanding, BOSS_ROOM, boxHits, buildWorld, BUTTONS, canPlace,
  CHEST, CHEST_RANGE, CONSOLE_RANGE, CONSOLES, distToBox,
  DOOR, DOOR_SPLIT, DOOR_TIME, GARGOYLE_HOME, GARGOYLE_HP,
  GARGOYLE_REACH, GARGOYLE_SIZE, GARGOYLE_SPEED, gargoylePhase, GROUND_ITEMS,
  HURT_INVULN, inPuddle, inRect, inReach,
  isPlaceable, isStaff, isSword, JUMP_TIME, key,
  landingSpot,
  MAIN_ROOM, MAX_DIGITS, MAX_HEALTH, MINE_SECONDS, openDoor, OP_KINDS, overVoid,
  PAD_RANGE, petrifyTargets,
  PETRIFY_EVERY, PUDDLE_LIFE, PUDDLE_RADIUS, SIGNS, SPAWN, spawnInterval,
  SPIT_EVERY, SPIT_SPEED, SPIT_SPREAD, SPRINT_SPEED, stack, STAFF_COOLDOWN,
  STAFF_DAMAGE, STAFF_HIT_R, STAFF_RANGE, STAFF_SPEED, stepMove,
  summonRing, SUMMON_EVERY, swingDamage, SWING_TIME, swingHits, TOMBSTONES,
  turnToward, VOID, WALK_SPEED, WALL, WORLD_H, WORLD_W, ZOMBIE_DAMAGE,
  ZOMBIE_HIT_COOLDOWN, ZOMBIE_HP, ZOMBIE_R, ZOMBIE_REACH, ZOMBIE_SPEED,
} from './stoneTemple.js'

const VIEW_W = 960
const VIEW_H = 560
const JUMP_LIFT = 22 // pixels the sprite rises at the top of a hop
const PICKUP_RANGE = 0.7
const FALL_TIME = 0.55

const OPS = OP_KINDS
const opSymbol = (kind) => OPS.find((o) => o.kind === kind)?.symbol ?? '?'

/** Each tablet keeps its own half-built instruction. */
const emptyPads = () =>
  Object.fromEntries(CONSOLES.map((c) => [c.id, { op: null, digits: '' }]))

// ---------------------------------------------------------------- the temple

export default function StoneTemple({ onBack, onReward, onStash, save }) {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const invRef = useRef(null)
  const uiRef = useRef(null)
  const dragRef = useRef(null)
  const rewardRef = useRef(onReward)
  rewardRef.current = onReward
  const saveRef = useRef(save)
  saveRef.current = save
  const [, bump] = useReducer((n) => n + 1, 0)

  // What you walked in with. Dying puts the bag back to exactly this, so a
  // run costs you what you found in it and nothing you brought.
  if (!invRef.current) invRef.current = makeInventory(save?.inventory)
  const carriedRef = useRef(null)
  if (!carriedRef.current) carriedRef.current = cloneInventory(invRef.current)
  const stashRef = useRef(onStash)
  stashRef.current = onStash
  if (!uiRef.current) {
    uiRef.current = {
      signId: null,
      invOpen: false,
      pick: null,
      over: null,
      // The console the player is standing at, its keypad, and the loot panel.
      consoleId: null,
      pads: emptyPads(),
      note: '',
      loot: null,
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // Everything that a death resets lives in freshRun below; what is left
    // here is the handful of things that outlive a run.
    const game = {
      world: null,
      blocks: null, // "x,y" -> 'cobblestone' | 'stone'
      player: {},
      ground: null,
      keys: new Set(),
      mouse: { x: SPAWN.x, y: SPAWN.y, down: false },
      mining: null,
      swing: 0,
      floats: [],
      camera: { x: 0, y: 0 },
      bolts: [],
      staffCooldown: 0,
      onButton: null,
      roomEntered: false,
      roomClock: 0,
      spawnTimer: 0,
      gravesOff: false,
      zombies: [],
      door: null,
      gargoyle: null,
      shots: [],
      puddles: [],
      chest: null,
      consoles: null,
    }
    gameRef.current = game

    const inv = invRef.current
    const ui = uiRef.current
    const held = () => inv.hotbar[inv.selected]
    const consoleById = (id) => game.consoles.find((c) => c.id === id)

    // ------------------------------------------------------------ input

    const onKeyDown = (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      if (e.repeat) return
      if (e.code === 'KeyE') {
        ui.invOpen = !ui.invOpen
        ui.pick = null
        game.mining = null
        bump()
        return
      }
      if (e.code === 'Escape') {
        if (ui.invOpen || ui.loot) {
          ui.invOpen = false
          ui.loot = null
          ui.pick = null
          bump()
        }
        return
      }
      const digit = e.code.match(/^Digit([1-9])$/)
      if (digit) {
        inv.selected = Number(digit[1]) - 1
        game.mining = null
        bump()
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
      const sx = (e.clientX - rect.left) * (canvas.width / rect.width)
      const sy = (e.clientY - rect.top) * (canvas.height / rect.height)
      return { x: (sx + game.camera.x) / BLOCK, y: (sy + game.camera.y) / BLOCK }
    }

    const signUnder = (p) =>
      SIGNS.find(
        (s) =>
          p.x >= s.x && p.x <= s.x + 1 && p.y >= s.y && p.y <= s.y + 1 &&
          inReach(game.player, s.x, s.y),
      )

    const onMove = (e) => {
      const p = toWorld(e)
      game.mouse.x = p.x
      game.mouse.y = p.y
      // Wander off the block you were digging and the progress is lost.
      if (game.mining) {
        const tx = Math.floor(p.x)
        const ty = Math.floor(p.y)
        if (tx !== game.mining.tx || ty !== game.mining.ty) game.mining = null
      }
    }

    const onDown = (e) => {
      if (ui.invOpen || ui.loot) return
      const p = toWorld(e)
      game.mouse.x = p.x
      game.mouse.y = p.y
      const tx = Math.floor(p.x)
      const ty = Math.floor(p.y)

      if (e.button === 2) {
        e.preventDefault()
        const slot = held()
        if (isPlaceable(slot) && canPlace(game.world, game.blocks, game.player, tx, ty)) {
          game.blocks.set(key(tx, ty), slot.kind)
          slot.count -= 1
          if (slot.count <= 0) inv.hotbar[inv.selected] = null
          bump()
        }
        return
      }
      if (e.button !== 0) return
      game.mouse.down = true

      // A sign always wins the click, so reading one never swings the sword.
      const sign = signUnder(p)
      if (sign) {
        ui.signId = ui.signId === sign.id ? null : sign.id
        bump()
        return
      }

      if (isStaff(held())) {
        fireStaff()
        return
      }

      if (isSword(held())) {
        swing()
        return
      }

      // No sword in hand, so left click digs instead.
      if (game.blocks.has(key(tx, ty)) && inReach(game.player, tx, ty)) {
        game.mining = { tx, ty, t: 0 }
      }
    }

    const onUp = (e) => {
      if (e.button === 0) {
        game.mouse.down = false
        game.mining = null
      }
    }
    const onContext = (e) => e.preventDefault()

    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('contextmenu', onContext)

    // ------------------------------------------------------------ helpers

    function say(x, y, text, tone) {
      game.floats.push({ x, y, t: 0.9, text, tone })
    }

    /**
     * A run from scratch. Rebuilding the world is what shuts the gate again,
     * since opening it carves the door column out of the map for good.
     */
    function freshRun() {
      game.world = buildWorld()
      game.blocks = new Map()
      Object.assign(game.player, {
        ...SPAWN,
        airborne: false,
        jumpT: 0,
        airSpeed: WALK_SPEED,
        facing: { x: 1, y: 0 },
        falling: 0,
        health: MAX_HEALTH,
        invuln: HURT_INVULN * 2,
        acidTick: 0,
      })
      game.ground = GROUND_ITEMS.map((g) => ({ ...g, item: { ...g.item } }))
      game.zombies = []
      game.shots = []
      game.puddles = []
      game.bolts = []
      game.staffCooldown = 0
      game.floats = []
      game.mining = null
      game.swing = 0
      game.roomEntered = false
      game.roomClock = 0
      game.spawnTimer = 0
      game.gravesOff = false
      game.door = { open: 0, done: false }
      game.gargoyle = {
        x: GARGOYLE_HOME.x,
        y: GARGOYLE_HOME.y,
        hp: GARGOYLE_HP,
        facing: Math.PI, // looking back down the room, towards the door
        solved: 0,
        spitTimer: 0,
        spitCount: 0,
        biteTimer: 0,
        bite: 0,
        dead: false,
        awake: false,
      }
      game.chest = { there: false, opened: false }
      // Three new equations - the old ones do not come round again.
      game.consoles = CONSOLES.map((c) => {
        const made = keypadEquation()
        return { ...c, eq: made.eq, base: made.eq, answer: made.answer, done: false }
      })

      // Only what this run turned up is lost. Whatever you carried in comes
      // straight back.
      restoreInventory(inv, carriedRef.current)
      // The staff is a once-ever find, so once it is yours you always have
      // one - otherwise dying before you got out would put it beyond reach
      // for good and there would be nothing left to play with.
      if (saveRef.current?.staff && !BAGS.some((b) => inv[b].some((s) => s?.kind === 'staff'))) {
        addToSlots(inv.hotbar, stack('staff', 1))
      }

      ui.signId = null
      ui.invOpen = false
      ui.pick = null
      ui.over = null
      ui.consoleId = null
      ui.pads = emptyPads()
      ui.note = ''
      ui.loot = null
      game.onButton = null
      bump()
    }

    function hurtPlayer(amount, ignoreInvuln = false) {
      const p = game.player
      if (!ignoreInvuln && p.invuln > 0) return
      p.health = Math.max(0, p.health - amount)
      if (!ignoreInvuln) p.invuln = HURT_INVULN
      say(p.x, p.y, `-${amount}`, 'hurt')
      if (p.health === 0) die()
      bump()
    }

    /**
     * Dying costs you the whole run: back to the entrance, everything picked
     * up inside the temple gone, every room and monster reset, and three new
     * equations to solve. Only what has already reached the save file - your
     * emeralds, and whether the staff has ever been claimed - survives.
     */
    function die() {
      freshRun()
      say(game.player.x, game.player.y, 'You died', 'hurt')
    }

    function swing() {
      const p = game.player
      game.swing = SWING_TIME
      // The sword goes where the crosshair is, not where your feet are
      // pointed, so you can back away and still hit what is chasing you.
      const dx = game.mouse.x - p.x
      const dy = game.mouse.y - p.y
      const len = Math.hypot(dx, dy) || 1
      const aim = { x: dx / len, y: dy / len }
      game.swingAim = aim
      const dmg = swingDamage(p.airborne)
      for (const z of game.zombies) {
        if (z.hp > 0 && swingHits(p, aim, z)) {
          z.hp -= dmg
          say(z.x, z.y, `-${dmg}`, 'hit')
          if (z.hp <= 0) z.dead = true
        }
      }
      const g = game.gargoyle
      // He is a box, not a point: range is measured from his hide, and the
      // arc is wide, so landing a hit on him is never fiddly.
      if (!g.dead && boxHits(p, aim, g, GARGOYLE_SIZE / 2, GARGOYLE_REACH)) {
        if (gargoylePhase(g.solved) === 'true') {
          g.hp = Math.max(0, g.hp - dmg)
          say(g.x, g.y - 2, `-${dmg}`, 'hit')
          if (g.hp === 0) killGargoyle()
        } else {
          say(g.x, g.y - 2, 'clang!', 'note')
        }
      }
    }

    function killGargoyle() {
      game.gargoyle.dead = true
      game.zombies = [] // every zombie drops the moment he does
      game.shots = []
      game.chest.there = true
      say(CHEST.x, CHEST.y, 'The temple opens', 'note')
      bump()
    }

    /** Standing on a block presses it, once, until you step off again. */
    function pressButton(b) {
      const pad = ui.pads[b.owner]
      if (!pad) return
      if (b.kind === 'op') pad.op = b.op
      else if (pad.digits.length < MAX_DIGITS) pad.digits += String(b.digit)
      ui.note = ''
    }

    /** Throw a cobblestone. It hurts, and it leaves a block where it lands. */
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

    /** Drop the thrown block onto the grid wherever it stopped. */
    function landBolt(b, from) {
      const cell = boltLanding(game.world, game.blocks, b, from)
      if (cell) game.blocks.set(key(cell.x, cell.y), 'stone')
      b.done = true
    }

    function updateBolts(dt) {
      if (game.staffCooldown > 0) game.staffCooldown -= dt
      const g = game.gargoyle
      for (const b of game.bolts) {
        const from = { x: b.x, y: b.y }
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.left -= dt
        b.spin += dt * 12

        let hit = false
        for (const z of game.zombies) {
          if (z.hp > 0 && Math.hypot(z.x - b.x, z.y - b.y) <= STAFF_HIT_R + ZOMBIE_R) {
            z.hp -= STAFF_DAMAGE
            say(z.x, z.y, `-${STAFF_DAMAGE}`, 'hit')
            if (z.hp <= 0) z.dead = true
            hit = true
            break
          }
        }
        if (!hit && !g.dead && g.awake &&
            distToBox(b.x, b.y, g, GARGOYLE_SIZE / 2) <= STAFF_HIT_R) {
          if (gargoylePhase(g.solved) === 'true') {
            g.hp = Math.max(0, g.hp - STAFF_DAMAGE)
            say(g.x, g.y - 2, `-${STAFF_DAMAGE}`, 'hit')
            if (g.hp === 0) killGargoyle()
          } else {
            say(g.x, g.y - 2, 'clang!', 'note')
          }
          hit = true
        }
        // A wall counts as contact just as much as a zombie does.
        if (!hit && blocked(game.world, game.blocks, b.x, b.y, false, 0.05)) hit = true

        if (hit || b.left <= 0) landBolt(b, from)
      }
      game.bolts = game.bolts.filter((b) => !b.done)
      game.zombies = game.zombies.filter((z) => !z.dead)
    }

    function spawnZombie(at) {
      game.zombies.push({
        x: at.x + 0.5,
        y: at.y + 0.5,
        hp: ZOMBIE_HP,
        cooldown: 0,
        acidTick: 0,
        dead: false,
      })
    }

    function pickUp(g) {
      const copy = { ...g.item }
      if (addToSlots(inv.hotbar, copy) || addToSlots(inv.main, copy)) {
        game.ground = game.ground.filter((o) => o !== g)
        bump()
      } else if (copy.count !== g.item.count) {
        // Nowhere left for the rest of it, so leave the remainder on the floor
        // rather than quietly duplicating or losing what did fit.
        g.item.count = copy.count
        bump()
      }
    }

    function openChest() {
      if (game.chest.opened) return
      game.chest.opened = true
      const reward = chestReward(saveRef.current)
      const blocks = stack('stone', reward.stone)
      if (!addToSlots(inv.hotbar, blocks)) addToSlots(inv.main, blocks)
      if (reward.staff) {
        const staff = stack('staff', 1)
        if (!addToSlots(inv.hotbar, staff)) addToSlots(inv.main, staff)
      }
      rewardRef.current?.(reward)
      ui.loot = reward
      bump()
    }

    // ------------------------------------------------------------ update

    function updatePlayer(dt) {
      const p = game.player
      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)

      // A ravine is not a setback. Whatever is down there, nobody climbs out.
      if (p.falling > 0) {
        p.falling += dt
        if (p.falling >= FALL_TIME) die()
        return
      }

      // Working a tablet does not root you to the spot - the graves keep
      // going, so you need to be able to back off mid-equation.
      const frozen = ui.invOpen || ui.loot
      if (!frozen) {
        let dx = 0
        let dy = 0
        if (game.keys.has('KeyW')) dy -= 1
        if (game.keys.has('KeyS')) dy += 1
        if (game.keys.has('KeyA')) dx -= 1
        if (game.keys.has('KeyD')) dx += 1

        const moving = dx !== 0 || dy !== 0
        const sprinting = game.keys.has('ShiftLeft') || game.keys.has('ShiftRight')
        const groundSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED

        if (moving) {
          const len = Math.hypot(dx, dy)
          dx /= len
          dy /= len
          p.facing = { x: dx, y: dy }
        }

        // Speed is fixed at take-off, so you cannot start a sprint mid-air.
        if (!p.airborne && game.keys.has('Space')) {
          p.airborne = true
          p.jumpT = 0
          p.airSpeed = moving ? groundSpeed : WALK_SPEED
        }

        const speed = p.airborne ? p.airSpeed : groundSpeed
        if (moving) {
          // Airborne, the blocks you built are cleared rather than bumped into.
          const next = stepMove(
            game.world, game.blocks, p, dx * speed * dt, dy * speed * dt, p.airborne,
          )
          p.x = next.x
          p.y = next.y
        }
      }

      if (p.airborne) {
        p.jumpT += dt
        if (p.jumpT >= JUMP_TIME) {
          p.airborne = false
          p.jumpT = 0
          // You may have come down on top of a block you hopped over.
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

      for (const g of [...game.ground]) {
        if (Math.hypot(g.x + 0.5 - p.x, g.y + 0.5 - p.y) < PICKUP_RANGE) pickUp(g)
      }

      // Standing at a console brings its keypad up; walking off puts it away.
      const near = game.consoles.find(
        (c) => !c.done && Math.hypot(c.x + 0.5 - p.x, c.y + 0.5 - p.y) <= CONSOLE_RANGE,
      )
      const nearId = near ? near.id : null
      if (nearId !== ui.consoleId) {
        ui.consoleId = nearId
        ui.note = ''
        bump()
      }

      // Buttons fire on the way in, not every frame you stand there.
      const onBlock = BUTTONS.find(
        (b) => Math.hypot(b.x + 0.5 - p.x, b.y + 0.5 - p.y) <= PAD_RANGE,
      )
      const onId = onBlock ? onBlock.id : null
      if (onId !== game.onButton) {
        game.onButton = onId
        if (onBlock) pressButton(onBlock)
        bump()
      }

      if (game.chest.there && !game.chest.opened &&
          Math.hypot(CHEST.x + 0.5 - p.x, CHEST.y + 0.5 - p.y) <= CHEST_RANGE) {
        openChest()
      }
    }

    function updateGraves(dt) {
      const p = game.player
      if (!game.roomEntered && inRect(MAIN_ROOM, p.x, p.y)) {
        game.roomEntered = true
        bump()
      }
      if (!game.roomEntered || game.gravesOff) return

      game.roomClock += dt
      game.spawnTimer += dt
      const every = spawnInterval(game.roomClock)
      if (game.spawnTimer >= every) {
        game.spawnTimer -= every
        const grave = TOMBSTONES[Math.floor(Math.random() * TOMBSTONES.length)]
        spawnZombie(grave)
      }
    }

    function updateZombies(dt) {
      const p = game.player
      for (const z of game.zombies) {
        if (z.cooldown > 0) z.cooldown -= dt
        const dx = p.x - z.x
        const dy = p.y - z.y
        const dist = Math.hypot(dx, dy)
        if (dist > ZOMBIE_REACH) {
          const next = stepMove(
            game.world, game.blocks, z,
            (dx / dist) * ZOMBIE_SPEED * dt, (dy / dist) * ZOMBIE_SPEED * dt,
            false, ZOMBIE_R,
          )
          z.x = next.x
          z.y = next.y
        } else if (z.cooldown <= 0) {
          z.cooldown = ZOMBIE_HIT_COOLDOWN
          hurtPlayer(ZOMBIE_DAMAGE)
        }
      }
      game.zombies = game.zombies.filter((z) => !z.dead)
    }

    function updateDoor(dt) {
      const d = game.door
      if (d.done || !consoleById('gate')?.done) return
      d.open = Math.min(1, d.open + dt / DOOR_TIME)
      if (d.open >= 1) {
        d.done = true
        openDoor(game.world)
      }
    }

    function updateGargoyle(dt) {
      const g = game.gargoyle
      const p = game.player
      if (g.dead) return
      if (!g.awake) {
        if (inRect(BOSS_ROOM, p.x, p.y)) {
          g.awake = true
          bump()
        }
        return
      }

      const phase = gargoylePhase(g.solved)
      const toPlayer = Math.atan2(p.y - g.y, p.x - g.x)

      if (phase === 'true') {
        // Too far off his front and he plants himself and turns instead.
        const turned = turnToward(g.facing, toPlayer, dt)
        g.facing = turned.facing
        if (turned.canMove) {
          const next = stepMove(
            game.world, game.blocks, g,
            Math.cos(g.facing) * GARGOYLE_SPEED * dt,
            Math.sin(g.facing) * GARGOYLE_SPEED * dt,
            false, GARGOYLE_SIZE / 2,
          )
          g.x = next.x
          g.y = next.y
        }

        g.biteTimer -= dt
        const dist = Math.hypot(p.x - g.x, p.y - g.y)
        if (g.biteTimer <= 0 && dist <= BITE_REACH &&
            Math.abs(angleDiff(toPlayer, g.facing)) <= BITE_ARC) {
          g.biteTimer = BITE_COOLDOWN
          g.bite = 0.3
          hurtPlayer(BITE_DAMAGE)
        }
      } else {
        g.facing = toPlayer // stone, but his head still tracks you
      }
      if (g.bite > 0) g.bite -= dt

      g.spitTimer += dt
      if (g.spitTimer >= SPIT_EVERY) {
        g.spitTimer -= SPIT_EVERY
        spit()
      }
    }

    /** Acid arcs over everything and only matters where it lands. */
    function spit() {
      const g = game.gargoyle
      const p = game.player
      const aim = Math.atan2(p.y - g.y, p.x - g.x) + (Math.random() * 2 - 1) * SPIT_SPREAD
      const range = Math.hypot(p.x - g.x, p.y - g.y) * (0.85 + Math.random() * 0.3)
      game.shots.push({
        x: g.x,
        y: g.y,
        vx: Math.cos(aim) * SPIT_SPEED,
        vy: Math.sin(aim) * SPIT_SPEED,
        left: range / SPIT_SPEED,
      })

      g.spitCount += 1
      if (g.spitCount % PETRIFY_EVERY === 0) {
        for (const t of petrifyTargets(game.world, game.blocks, p)) {
          game.blocks.set(key(t.x, t.y), 'stone')
        }
      }
      if (g.spitCount % SUMMON_EVERY === 0) {
        for (const at of summonRing(g)) spawnZombie({ x: at.x - 0.5, y: at.y - 0.5 })
      }
    }

    function updateAcid(dt) {
      const p = game.player
      for (const s of game.shots) {
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.left -= dt
        if (s.left <= 0) {
          s.landed = true
          game.puddles.push({ x: s.x, y: s.y, t: PUDDLE_LIFE })
          if (inPuddle(s, p.x, p.y)) hurtPlayer(ACID_IMPACT_DAMAGE)
          // His own acid does not care whose side you are on.
          for (const z of game.zombies) {
            if (z.hp > 0 && inPuddle(s, z.x, z.y)) {
              z.hp -= ACID_IMPACT_DAMAGE
              say(z.x, z.y, `-${ACID_IMPACT_DAMAGE}`, 'acid')
              if (z.hp <= 0) z.dead = true
            }
          }
        }
      }
      game.shots = game.shots.filter((s) => !s.landed)

      let standing = false
      for (const q of game.puddles) {
        q.t -= dt
        if (q.t > 0 && inPuddle(q, p.x, p.y)) standing = true
      }
      game.puddles = game.puddles.filter((q) => q.t > 0)

      // Zombies burn on the same clock the player does.
      for (const z of game.zombies) {
        if (z.hp <= 0) continue
        if (game.puddles.some((q) => inPuddle(q, z.x, z.y))) {
          z.acidTick += dt
          while (z.acidTick >= ACID_TICK && z.hp > 0) {
            z.acidTick -= ACID_TICK
            z.hp -= ACID_TICK_DAMAGE
            say(z.x, z.y, `-${ACID_TICK_DAMAGE}`, 'acid')
            if (z.hp <= 0) z.dead = true
          }
        } else {
          z.acidTick = 0
        }
      }
      game.zombies = game.zombies.filter((z) => !z.dead)

      // Burning in acid ignores the usual grace period - it is a steady drip.
      if (standing) {
        p.acidTick += dt
        while (p.acidTick >= ACID_TICK) {
          p.acidTick -= ACID_TICK
          hurtPlayer(ACID_TICK_DAMAGE, true)
        }
      } else {
        p.acidTick = 0
      }
    }

    function updateMining(dt) {
      if (game.mining && game.mouse.down && !ui.invOpen && !ui.consoleId) {
        game.mining.t += dt
        if (game.mining.t >= MINE_SECONDS) {
          const { tx, ty } = game.mining
          const kind = game.blocks.get(key(tx, ty)) || 'cobblestone'
          game.blocks.delete(key(tx, ty))
          const copy = stack(kind, 1)
          if (!addToSlots(inv.hotbar, copy)) addToSlots(inv.main, copy)
          game.mining = null
          bump()
        }
      } else if (game.mining && !game.mouse.down) {
        game.mining = null
      }
    }

    function update(dt) {
      updatePlayer(dt)
      updateGraves(dt)
      updateZombies(dt)
      updateDoor(dt)
      updateGargoyle(dt)
      updateAcid(dt)
      updateBolts(dt)
      updateMining(dt)
      if (game.swing > 0) game.swing = Math.max(0, game.swing - dt)
      game.floats = game.floats.filter((f) => (f.t -= dt) > 0)
    }

    // ------------------------------------------------------------ drawing

    const shade = (x, y) => Math.abs((x * 73856093) ^ (y * 19349663)) % 7
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
            ctx.fillStyle = '#0d0f14'
            ctx.fillRect(px, py, BLOCK, BLOCK)
            if (y > 0 && game.world[y - 1][x] !== VOID) {
              ctx.fillStyle = '#1d222b'
              ctx.fillRect(px, py, BLOCK, 8)
            }
            continue
          }
          if (t === WALL) {
            // The gate is drawn separately, as two sliding halves.
            if (x === DOOR.x && y >= DOOR.y0 && y <= DOOR.y1) continue
            ctx.fillStyle = '#2f333b'
            ctx.fillRect(px, py, BLOCK, BLOCK)
            ctx.fillStyle = '#3c414b'
            ctx.fillRect(px + 3, py + 3, BLOCK - 6, BLOCK - 6)
            continue
          }
          ctx.fillStyle = shade(x, y) < 2 ? '#666b75' : '#5f646d'
          ctx.fillRect(px, py, BLOCK, BLOCK)
          ctx.fillStyle = 'rgba(0,0,0,0.16)'
          ctx.fillRect(px, py + BLOCK - 2, BLOCK, 2)
          ctx.fillRect(px + BLOCK - 2, py, 2, BLOCK)
        }
      }
    }

    /** Two halves that slide apart like a double door. */
    function drawDoor() {
      const d = game.door
      if (d.done) return
      const topH = (DOOR_SPLIT - DOOR.y0 + 1) * BLOCK
      const botH = (DOOR.y1 - DOOR_SPLIT) * BLOCK
      const px = sx(DOOR.x)
      const topY = sy(DOOR.y0) - d.open * topH
      const botY = sy(DOOR_SPLIT + 1) + d.open * botH
      const panel = (y, h) => {
        ctx.fillStyle = '#3a3f4a'
        ctx.fillRect(px, y, BLOCK, h)
        ctx.fillStyle = '#4c5361'
        ctx.fillRect(px + 4, y + 4, BLOCK - 8, h - 8)
        ctx.fillStyle = '#2a2e36'
        for (let i = 0; i < h; i += BLOCK) ctx.fillRect(px + 6, y + i + 6, BLOCK - 12, 4)
      }
      panel(topY, topH)
      panel(botY, botH)
    }

    function drawBlocks() {
      for (const [k, kind] of game.blocks) {
        const [x, y] = k.split(',').map(Number)
        const px = sx(x)
        const py = sy(y)
        if (px < -BLOCK || px > VIEW_W || py < -BLOCK || py > VIEW_H) continue
        const dark = kind === 'stone' ? '#7a7e87' : '#61656e'
        const mid = kind === 'stone' ? '#8d919a' : '#7b7f88'
        const light = kind === 'stone' ? '#9ea2ab' : '#9aa0aa'
        ctx.fillStyle = mid
        ctx.fillRect(px, py, BLOCK, BLOCK)
        ctx.fillStyle = light
        ctx.fillRect(px + 4, py + 4, 14, 12)
        ctx.fillRect(px + 22, py + 20, 13, 13)
        ctx.fillStyle = dark
        ctx.fillRect(px + 22, py + 5, 12, 11)
        ctx.fillRect(px + 5, py + 20, 12, 14)
        ctx.strokeStyle = '#3a3d45'
        ctx.lineWidth = 2
        ctx.strokeRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2)
      }
    }

    function drawSigns() {
      for (const s of SIGNS) {
        const px = sx(s.x)
        const py = sy(s.y)
        if (px < -BLOCK || px > VIEW_W) continue
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.beginPath()
        ctx.ellipse(px + BLOCK / 2, py + BLOCK - 7, 13, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#5a3a1e'
        ctx.fillRect(px + BLOCK / 2 - 3, py + 18, 6, BLOCK - 24)
        ctx.fillStyle = '#8a5a2b'
        ctx.fillRect(px + 5, py + 6, BLOCK - 10, 18)
        ctx.fillStyle = '#a9713a'
        ctx.fillRect(px + 7, py + 8, BLOCK - 14, 14)
        ctx.fillStyle = '#4a2d13'
        for (let i = 0; i < 3; i++) ctx.fillRect(px + 10, py + 11 + i * 4, BLOCK - 20, 2)
      }
    }

    function drawTombstones() {
      for (const t of TOMBSTONES) {
        const px = sx(t.x)
        const py = sy(t.y)
        if (px < -BLOCK || px > VIEW_W || py < -BLOCK || py > VIEW_H) continue
        ctx.globalAlpha = game.gravesOff ? 0.4 : 1
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(px + BLOCK / 2, py + BLOCK - 6, 14, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#4a4f58'
        ctx.fillRect(px + 8, py + 12, 24, BLOCK - 18)
        ctx.beginPath()
        ctx.arc(px + BLOCK / 2, py + 12, 12, Math.PI, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = game.gravesOff ? '#2f333b' : '#6b7280'
        ctx.fillRect(px + 12, py + 14, 16, 4)
        ctx.fillRect(px + 12, py + 21, 16, 4)
        ctx.globalAlpha = 1
      }
    }

    /** Each tablet is painted its own colour, so its blocks are obvious. */
    const SIGN_TONES = {
      plain: { post: '#5a3a1e', base: '#8a5a2b', top: '#a9713a', ink: '#f2f4f8' },
      red: { post: '#5e1f1f', base: '#8f2f2f', top: '#c95151', ink: '#ffe8e8' },
      blue: { post: '#1f2f5e', base: '#2f4a8f', top: '#5a7ec9', ink: '#e8f0ff' },
    }

    function drawConsoles() {
      for (const c of game.consoles) {
        const px = sx(c.x)
        const py = sy(c.y)
        if (px < -BLOCK * 2 || px > VIEW_W) continue
        const tone = SIGN_TONES[c.tone] || SIGN_TONES.plain

        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(px + BLOCK / 2, py + BLOCK - 5, 16, 6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = tone.post
        ctx.fillRect(px + BLOCK / 2 - 4, py + 20, 8, BLOCK - 24)
        ctx.fillStyle = tone.base
        ctx.fillRect(px - 6, py - 2, BLOCK + 12, 26)
        ctx.fillStyle = tone.top
        ctx.fillRect(px - 3, py + 1, BLOCK + 6, 20)

        // Solved is a green frame rather than a repaint, so the tablet keeps
        // the colour that tells you which blocks feed it.
        if (c.done) {
          ctx.strokeStyle = '#4fdc7a'
          ctx.lineWidth = 3
          ctx.strokeRect(px - 6, py - 2, BLOCK + 12, 26)
        }
        ctx.fillStyle = c.done ? '#4fdc7a' : tone.ink
        ctx.font = 'bold 13px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(c.done ? 'SOLVED' : 'x = ?', px + BLOCK / 2, py + 15)
        ctx.textAlign = 'left'
      }
    }

    const TONES = {
      plain: { base: '#6f747e', top: '#9aa0aa', ink: '#f2f4f8' },
      red: { base: '#8f2f2f', top: '#c95151', ink: '#ffe8e8' },
      blue: { base: '#2f4a8f', top: '#5a7ec9', ink: '#e8f0ff' },
    }

    /** The operation and digit blocks, scattered about the floor. */
    function drawButtons() {
      for (const b of BUTTONS) {
        const px = sx(b.x)
        const py = sy(b.y)
        if (px < -BLOCK || px > VIEW_W || py < -BLOCK || py > VIEW_H) continue
        const tone = TONES[b.tone] || TONES.plain
        const on = game.onButton === b.id
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(px + 4, py + 8, BLOCK - 8, BLOCK - 8)
        ctx.fillStyle = tone.base
        ctx.fillRect(px + 4, py + 4, BLOCK - 8, BLOCK - 8)
        ctx.fillStyle = tone.top
        ctx.fillRect(px + 7, py + 7, BLOCK - 14, BLOCK - 14)
        if (on) {
          ctx.strokeStyle = '#ffcd75'
          ctx.lineWidth = 3
          ctx.strokeRect(px + 2, py + 2, BLOCK - 4, BLOCK - 4)
        }
        ctx.fillStyle = tone.ink
        ctx.font = 'bold 20px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(b.symbol, px + BLOCK / 2, py + BLOCK / 2 + 1)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
      }
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
        if (g.item.kind === 'sword') {
          ctx.save()
          ctx.translate(px + BLOCK / 2, py + BLOCK / 2)
          ctx.rotate(-Math.PI / 4)
          ctx.fillStyle = '#b9c0c8'
          ctx.fillRect(-3, -16, 6, 22)
          ctx.fillStyle = '#6b4a2a'
          ctx.fillRect(-7, 6, 14, 4)
          ctx.fillRect(-2, 10, 4, 7)
          ctx.restore()
        } else {
          ctx.fillStyle = '#7b7f88'
          ctx.fillRect(px + 9, py + 9, 22, 22)
          ctx.fillStyle = '#9aa0aa'
          ctx.fillRect(px + 12, py + 12, 9, 8)
          ctx.fillStyle = '#f2f4f8'
          ctx.font = 'bold 12px monospace'
          ctx.fillText(String(g.item.count), px + 26, py + 12)
        }
      }
    }

    function drawPuddles() {
      for (const q of game.puddles) {
        const px = sx(q.x)
        const py = sy(q.y)
        if (px < -BLOCK * 2 || px > VIEW_W + BLOCK) continue
        // Fade out over the last couple of seconds so it reads as drying up.
        ctx.globalAlpha = Math.min(1, q.t / 2) * 0.85
        ctx.fillStyle = '#4fdc7a'
        ctx.beginPath()
        ctx.ellipse(px, py, PUDDLE_RADIUS * BLOCK, PUDDLE_RADIUS * BLOCK * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#a9f7bf'
        ctx.beginPath()
        ctx.ellipse(px - 5, py - 4, 7, 4, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      for (const s of game.shots) {
        ctx.fillStyle = '#7dfba0'
        ctx.beginPath()
        ctx.arc(sx(s.x), sy(s.y), 8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    /** Cobblestone in flight, tumbling. */
    function drawBolts() {
      for (const b of game.bolts) {
        const px = sx(b.x)
        const py = sy(b.y)
        if (px < -BLOCK || px > VIEW_W || py < -BLOCK || py > VIEW_H) continue
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(b.spin)
        ctx.fillStyle = '#7b7f88'
        ctx.fillRect(-11, -11, 22, 22)
        ctx.fillStyle = '#9aa0aa'
        ctx.fillRect(-8, -8, 8, 7)
        ctx.fillStyle = '#61656e'
        ctx.fillRect(2, 1, 7, 7)
        ctx.strokeStyle = '#3a3d45'
        ctx.lineWidth = 2
        ctx.strokeRect(-11, -11, 22, 22)
        ctx.restore()
      }
    }

    function drawZombies() {
      for (const z of game.zombies) {
        const px = sx(z.x)
        const py = sy(z.y)
        if (px < -BLOCK || px > VIEW_W + BLOCK || py < -BLOCK || py > VIEW_H + BLOCK) continue
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(px, py + 12, 12, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#3f6b3f'
        ctx.fillRect(px - 11, py - 6, 22, 18)
        ctx.fillStyle = '#6f9a5e'
        ctx.beginPath()
        ctx.arc(px, py - 7, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#22331f'
        ctx.fillRect(px - 6, py - 10, 4, 4)
        ctx.fillRect(px + 2, py - 10, 4, 4)
        // health bar
        ctx.fillStyle = '#1a1c22'
        ctx.fillRect(px - 13, py - 24, 26, 5)
        ctx.fillStyle = '#ff5a5f'
        ctx.fillRect(px - 12, py - 23, 24 * (z.hp / ZOMBIE_HP), 3)
      }
    }

    function drawGargoyle() {
      const g = game.gargoyle
      if (g.dead) return
      const px = sx(g.x)
      const py = sy(g.y)
      if (px < -300 || px > VIEW_W + 300) return
      const half = (GARGOYLE_SIZE * BLOCK) / 2
      const phase = gargoylePhase(g.solved)

      ctx.save()
      ctx.translate(px, py)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.ellipse(0, half - 8, half, half * 0.35, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.rotate(g.facing + Math.PI / 2) // sprite is drawn facing "down"

      if (phase === 'true') {
        // Wings out, black hide, green flecks.
        ctx.fillStyle = '#15181d'
        ctx.beginPath()
        ctx.moveTo(-half * 0.6, -half * 0.3)
        ctx.lineTo(-half * 1.5, half * 0.35)
        ctx.lineTo(-half * 0.5, half * 0.5)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(half * 0.6, -half * 0.3)
        ctx.lineTo(half * 1.5, half * 0.35)
        ctx.lineTo(half * 0.5, half * 0.5)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#101317'
        ctx.fillRect(-half * 0.75, -half * 0.85, half * 1.5, half * 1.7)
        ctx.fillStyle = '#4fdc7a'
        for (let i = 0; i < 14; i++) {
          const a = (i * 2.399) % (Math.PI * 2)
          ctx.beginPath()
          ctx.arc(Math.cos(a) * half * 0.5, Math.sin(a) * half * 0.6, 4, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        ctx.fillStyle = '#7d818b'
        ctx.fillRect(-half * 0.8, -half * 0.9, half * 1.6, half * 1.8)
        ctx.fillStyle = '#8f939d'
        ctx.fillRect(-half * 0.6, -half * 0.7, half * 1.2, half * 1.4)
        if (phase === 'cracked') {
          ctx.strokeStyle = '#2b2f36'
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(-half * 0.5, -half * 0.6)
          ctx.lineTo(-half * 0.1, 0)
          ctx.lineTo(-half * 0.35, half * 0.5)
          ctx.moveTo(half * 0.4, -half * 0.4)
          ctx.lineTo(half * 0.15, half * 0.2)
          ctx.stroke()
        }
      }

      // Eyes on the front edge, so which way he faces is never in doubt.
      ctx.fillStyle = phase === 'true' ? '#7dfba0' : '#ffcd75'
      ctx.beginPath()
      ctx.arc(-half * 0.3, half * 0.55, 6, 0, Math.PI * 2)
      ctx.arc(half * 0.3, half * 0.55, 6, 0, Math.PI * 2)
      ctx.fill()
      if (g.bite > 0) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.arc(0, half * 0.7, half * 0.8, 0.4, Math.PI - 0.4)
        ctx.stroke()
      }
      ctx.restore()
    }

    function drawChest() {
      if (!game.chest.there) return
      const px = sx(CHEST.x)
      const py = sy(CHEST.y)
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
      if (!game.chest.opened) {
        ctx.fillStyle = '#f2f4f8'
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('walk up to open', px + BLOCK / 2, py - 6)
        ctx.textAlign = 'left'
      }
    }

    function drawPlayer() {
      const p = game.player
      const px = sx(p.x)
      const py = sy(p.y)
      const lift = p.airborne ? Math.sin((Math.PI * p.jumpT) / JUMP_TIME) * JUMP_LIFT : 0
      const shrink = p.falling > 0 ? 1 - p.falling / FALL_TIME : 1

      ctx.fillStyle = 'rgba(0,0,0,0.32)'
      ctx.beginPath()
      ctx.ellipse(px, py + 12, 13 - lift * 0.2, 6 - lift * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.translate(px, py - lift)
      ctx.scale(shrink, shrink)
      // Flash while the grace period runs, so a hit is unmistakable.
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

    function drawGhost() {
      if (!isPlaceable(held()) || ui.invOpen) return
      const tx = Math.floor(game.mouse.x)
      const ty = Math.floor(game.mouse.y)
      const ok = canPlace(game.world, game.blocks, game.player, tx, ty)
      const px = sx(tx)
      const py = sy(ty)
      ctx.strokeStyle = ok ? '#7fdcff' : 'rgba(127,220,255,0.25)'
      ctx.lineWidth = 3
      ctx.strokeRect(px + 2, py + 2, BLOCK - 4, BLOCK - 4)
      if (ok) {
        ctx.fillStyle = 'rgba(127,220,255,0.16)'
        ctx.fillRect(px + 2, py + 2, BLOCK - 4, BLOCK - 4)
      }
    }

    function drawMining() {
      if (!game.mining) return
      const { tx, ty, t } = game.mining
      const px = sx(tx)
      const py = sy(ty)
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(px + 2, py + BLOCK - 12, BLOCK - 4, 8)
      ctx.fillStyle = '#ffcd75'
      ctx.fillRect(px + 3, py + BLOCK - 11, (BLOCK - 6) * (t / MINE_SECONDS), 6)
      ctx.fillStyle = '#f2f4f8'
      ctx.font = 'bold 11px monospace'
      ctx.fillText(`${Math.ceil(MINE_SECONDS - t)}s`, px + 12, py + 16)
    }

    function drawFloats() {
      ctx.font = 'bold 16px monospace'
      for (const f of game.floats) {
        ctx.globalAlpha = Math.min(1, f.t)
        ctx.fillStyle =
          f.tone === 'hurt' ? '#ff5a5f'
            : f.tone === 'note' ? '#7fdcff'
              : f.tone === 'acid' ? '#4fdc7a'
                : '#ffcd75'
        ctx.fillText(f.text, sx(f.x) + 14, sy(f.y) - (0.9 - f.t) * 30)
      }
      ctx.globalAlpha = 1
    }

    function draw() {
      game.camera.x = Math.max(
        0, Math.min(WORLD_W * BLOCK - VIEW_W, game.player.x * BLOCK - VIEW_W / 2),
      )
      game.camera.y = Math.max(
        0, Math.min(WORLD_H * BLOCK - VIEW_H, game.player.y * BLOCK - VIEW_H / 2),
      )
      ctx.fillStyle = '#0d0f14'
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      drawTiles()
      drawBlocks()
      drawDoor()
      drawSigns()
      drawTombstones()
      drawButtons()
      drawConsoles()
      drawGroundItems()
      drawPuddles()
      drawChest()
      drawGargoyle()
      drawZombies()
      drawBolts()
      drawGhost()
      drawPlayer()
      drawMining()
      drawFloats()
    }

    // ------------------------------------------------------------ loop

    freshRun()

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
      // Walking out counts as surviving, so the bag you leave with is the bag
      // you come back with next time.
      stashRef.current?.(cloneInventory(inv))
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('contextmenu', onContext)
    }
  }, [])

  // ---------------------------------------------------------------- HUD

  const inv = invRef.current
  const ui = uiRef.current
  const game = gameRef.current
  const sign = SIGNS.find((s) => s.id === ui.signId)
  const activeConsole = game && ui.consoleId
    ? game.consoles.find((c) => c.id === ui.consoleId)
    : null
  // Anything half-built, so you can see it while you are still fetching it.
  const staged = CONSOLES
    .map((c) => [c.id, ui.pads[c.id], c.tone])
    .filter(([, pad]) => pad && (pad.op || pad.digits))
  const gargoyle = game?.gargoyle
  const bossBar = gargoyle && !gargoyle.dead && gargoylePhase(gargoyle.solved) === 'true'

  /** Solving a console opens the gate, or cracks the gargoyle open. */
  function consoleSolved(c) {
    c.done = true
    if (c.id === 'gate') {
      // Deactivating the graves has to take the zombies already out of them
      // with it, or the room stays just as busy as it was.
      game.gravesOff = true
      game.zombies = []
      game.floats.push({
        x: game.player.x, y: game.player.y, t: 1.4,
        text: 'The graves fall still', tone: 'note',
      })
    } else {
      game.gargoyle.solved += 1
      if (gargoylePhase(game.gargoyle.solved) === 'true') {
        // The stone comes off and everything else in the room drops with it.
        // He can summon more from here on, but the slate starts clean.
        game.zombies = []
        game.floats.push({
          x: game.gargoyle.x, y: game.gargoyle.y - 3, t: 1.6,
          text: 'The stone falls away', tone: 'note',
        })
      }
    }
    ui.consoleId = null
    ui.note = ''
  }

  function padSetEq(updater) {
    const c = activeConsole
    if (!c) return
    c.eq = typeof updater === 'function' ? updater(c.eq) : updater
    checkConsole(c)
    bump()
  }

  function checkConsole(c) {
    const value = solvedValue(c.eq)
    if (value === null) return
    if (isCorrect(value, c.answer)) consoleSolved(c)
    else ui.note = `x = ${ratText(value)} is wrong. Reset and try again.`
  }

  function padEnter() {
    const c = activeConsole
    if (!c) return
    const pad = ui.pads[c.id]
    if (!pad.op) {
      ui.note = 'Step on an operation block first'
      return bump()
    }
    const value = parseOperand(pad.digits)
    if (!value) {
      ui.note = 'Step on the number blocks to build a number'
      return bump()
    }
    if (pad.op === 'div' && value.coef.n === 0) {
      ui.note = 'You cannot divide by zero'
      return bump()
    }
    c.eq = applyOperation(c.eq, pad.op, value)
    pad.digits = ''
    ui.note = ''
    checkConsole(c)
    bump()
  }

  /** Swap whatever is in two slots. Both drag and click end up here. */
  function swapSlots(from, to) {
    if (!from || !to) return
    if (from.where === to.where && from.i === to.i) return
    const a = inv[from.where]
    const b = inv[to.where]
    const moved = a[from.i]
    a[from.i] = b[to.i]
    b[to.i] = moved
  }

  /** Click one slot then another, for anyone who would rather not drag. */
  const slotClick = (where, i) => () => {
    const pick = ui.pick
    if (!pick) {
      if (inv[where][i]) ui.pick = { where, i }
    } else if (pick.where === where && pick.i === i) {
      ui.pick = null
    } else {
      swapSlots(pick, { where, i })
      ui.pick = null
    }
    bump()
  }

  const at = (spot, where, i) => !!spot && spot.where === where && spot.i === i

  /** Everything a slot in the inventory needs to be dragged onto or out of. */
  const slotProps = (where, i) => ({
    held: at(ui.pick, where, i) || at(dragRef.current, where, i),
    over: at(ui.over, where, i),
    draggable: !!inv[where][i],
    onDragStart: (e) => {
      dragRef.current = { where, i }
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', `${where}:${i}`) // Firefox needs data
    },
    onDragEnd: () => {
      dragRef.current = null
      ui.over = null
      bump()
    },
    onDragOver: (e) => {
      if (dragRef.current) e.preventDefault() // required, or the drop never fires
    },
    onDragEnter: () => {
      if (!dragRef.current) return
      ui.over = { where, i }
      bump()
    },
    onDragLeave: () => {
      if (!at(ui.over, where, i)) return
      ui.over = null
      bump()
    },
    onDrop: (e) => {
      e.preventDefault()
      swapSlots(dragRef.current, { where, i })
      dragRef.current = null
      ui.over = null
      ui.pick = null
      bump()
    },
    onClick: slotClick(where, i),
  })

  return (
    <div className="screen screen--game">
      <BackButton onBack={onBack} />
      <h2 className="heading">Stone Temple</h2>

      <div className="temple-stage">
        {bossBar && (
          <div className="boss-bar">
            <span className="boss-name">The Gargoyle</span>
            <span className="boss-track">
              <span
                className="boss-fill"
                style={{ width: `${(gargoyle.hp / GARGOYLE_HP) * 100}%` }}
              />
            </span>
          </div>
        )}

        {sign && (
          <button
            type="button"
            className="sign-banner"
            onClick={() => {
              ui.signId = null
              bump()
            }}
          >
            {sign.text}
          </button>
        )}

        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="temple-canvas" />

        {staged.length > 0 && (
          <div className="staged">
            {staged.map(([id, pad, tone]) => (
              <span className={'staged-chip staged-chip--' + tone} key={id}>
                <span className="pad-op">{pad.op ? opSymbol(pad.op) : '?'}</span>
                <span className="pad-digits">{pad.digits || '—'}</span>
              </span>
            ))}
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
        WASD to move · SPACE to jump · LEFT SHIFT to sprint · E for inventory ·
        left click to swing or mine · right click to place
      </p>

      {/* The stone tablet at a console: the equation, then the keypad. */}
      {activeConsole && (
        <div className={'panel console-panel console-panel--' + activeConsole.tone}>
          <p className="op-hint">
            {activeConsole.id === 'gate'
              ? 'The gate tablet. Solve it and the doors open.'
              : `The ${activeConsole.tone} tablet. Solve it and his stone cracks.`}
          </p>

          <EquationView eq={activeConsole.eq} setEq={padSetEq} className="equation--console" />

          <div className="pad">
            <div className="pad-readout">
              <span className="pad-op">
                {ui.pads[activeConsole.id].op
                  ? opSymbol(ui.pads[activeConsole.id].op)
                  : '?'}
              </span>
              <span className="pad-digits">
                {ui.pads[activeConsole.id].digits || '—'}
              </span>
            </div>

            <p className="op-hint">
              The {activeConsole.tone === 'plain' ? '' : activeConsole.tone + ' '}
              blocks around the room are the buttons. Stand on one to pick it up.
            </p>

            <div className="pad-actions">
              <button type="button" className="pixel-btn pad-enter" onClick={padEnter}>
                Enter
              </button>
              <button
                type="button"
                className="pixel-btn pixel-btn--alt"
                onClick={() => {
                  ui.pads[activeConsole.id].digits = ''
                  ui.note = ''
                  bump()
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="pixel-btn pixel-btn--alt"
                onClick={() => {
                  activeConsole.eq = activeConsole.base
                  ui.pads[activeConsole.id] = { op: null, digits: '' }
                  ui.note = ''
                  bump()
                }}
              >
                Reset
              </button>
            </div>
          </div>
          {ui.note && <p className="op-note">{ui.note}</p>}
        </div>
      )}

      {ui.loot && (
        <div className="inv-overlay">
          <div className="panel loot-panel">
            <h3 className="heading">Treasure</h3>
            <ul className="loot-list">
              <li>
                <span className="emerald-dot" /> {ui.loot.emeralds} emeralds
              </li>
              <li>{ui.loot.stone} stone blocks</li>
              {ui.loot.staff && <li>The Staff of Stone</li>}
            </ul>
            {!ui.loot.staff && (
              <p className="op-note">
                The staff of stone can only ever be found once.
              </p>
            )}
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
        <div
          className="inv-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              ui.invOpen = false
              ui.pick = null
              bump()
            }
          }}
        >
          <div className="inv-panel">
            <div className="inv-top">
              <div className="inv-armor">
                {inv.armor.map((item, i) => (
                  <Slot key={i} item={item} label="Armor" {...slotProps('armor', i)} />
                ))}
              </div>

              <div className="inv-portrait" aria-hidden="true">
                <div className="portrait-head">
                  <span className="portrait-hair" />
                  <span className="portrait-eye portrait-eye--l" />
                  <span className="portrait-eye portrait-eye--r" />
                </div>
                <div className="portrait-body" />
              </div>

              <div className="inv-acorn">
                <Slot item={inv.acorn[0]} label="Acorn" {...slotProps('acorn', 0)} />
              </div>

              <div className="inv-craft-area">
                <span className="inv-label">Crafting</span>
                <div className="inv-craft">
                  {inv.craft.map((item, i) => (
                    <Slot key={i} item={item} label="Crafting" {...slotProps('craft', i)} />
                  ))}
                </div>
              </div>
            </div>

            <div className="inv-grid">
              {inv.main.map((item, i) => (
                <Slot key={i} item={item} {...slotProps('main', i)} />
              ))}
            </div>

            <div className="inv-grid inv-grid--hotbar">
              {inv.hotbar.map((item, i) => (
                <Slot
                  key={i}
                  item={item}
                  {...slotProps('hotbar', i)}
                  selected={i === inv.selected}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
