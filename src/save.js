/**
 * The save file. One object in localStorage holds everything that outlives a
 * session: which temples are open, emeralds, whether the staff of stone has
 * ever been claimed, and whether the temple has been cleared before.
 *
 * Dev mode is the odd one out. While it is on nothing else is written to disk,
 * but the flag itself is, so the mode survives a reload - otherwise you would
 * drop out of it every time the page refreshed.
 */

export const SAVE_KEY = 'mathcraft.save'

export const EMPTY = {
  unlocked: [], // temple ids
  emeralds: 0,
  staff: false, // the staff of stone is a once-ever reward
  cleared: false, // the Stone Temple has been beaten at least once
  inventory: null, // what you walked out of the temple carrying
  dev: false,
}

/** The shape of a bag: how many slots each part of it has. */
export const SLOT_COUNTS = { hotbar: 9, main: 27, armor: 4, craft: 4, acorn: 1 }
export const MAX_STACK = 64

function normalizeStack(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.kind !== 'string' || !raw.kind) return null
  if (!Number.isFinite(raw.count)) return null
  const count = Math.min(MAX_STACK, Math.floor(raw.count))
  return count > 0 ? { kind: raw.kind, count } : null
}

/** A stored bag, forced back into the right shape whatever was on disk. */
export function normalizeInventory(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const [name, size] of Object.entries(SLOT_COUNTS)) {
    const src = Array.isArray(raw[name]) ? raw[name] : []
    out[name] = Array.from({ length: size }, (_, i) => normalizeStack(src[i]))
  }
  return out
}

export const CODES = {
  reset: 'resetprog',
  dev: 'dev1234',
  undev: 'undev1234',
}

/** Anything could be in storage, so take only what is the right shape. */
export function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    unlocked: Array.isArray(r.unlocked) ? r.unlocked.filter((u) => typeof u === 'string') : [],
    emeralds: Number.isFinite(r.emeralds) && r.emeralds >= 0 ? Math.floor(r.emeralds) : 0,
    staff: r.staff === true,
    cleared: r.cleared === true,
    inventory: normalizeInventory(r.inventory),
    dev: r.dev === true,
  }
}

function readStored() {
  if (typeof window === 'undefined') return { ...EMPTY }
  try {
    return normalize(JSON.parse(window.localStorage.getItem(SAVE_KEY) || '{}'))
  } catch {
    return { ...EMPTY }
  }
}

export const loadSave = readStored

/** Write straight through, whatever mode we are in. Only codes use this. */
export function hardWrite(save) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(normalize(save)))
  } catch {
    /* private mode, or a full quota - not worth breaking the game over */
  }
}

/**
 * The normal write. In dev mode the stored file is left exactly as it was,
 * apart from the dev flag, so nothing done in dev mode sticks.
 */
export function persist(save) {
  if (typeof window === 'undefined') return
  if (save.dev) {
    hardWrite({ ...readStored(), dev: true })
    return
  }
  hardWrite(save)
}

/**
 * The code box on the home screen. Returns the save it leaves behind, whether
 * that has to be forced to disk, and what to tell the player. An unrecognised
 * code changes nothing.
 */
export function applyCode(text, save) {
  const code = String(text || '').trim().toLowerCase()
  if (code === CODES.reset) {
    // Wiping progress is explicit enough to go through even in dev mode.
    return { save: { ...EMPTY, dev: save.dev }, wipe: true, message: 'All progress reset.' }
  }
  if (code === CODES.dev) {
    return {
      save: { ...save, dev: true },
      wipe: true,
      message: 'Dev mode on. Nothing will be saved.',
    }
  }
  if (code === CODES.undev) {
    return { save: { ...save, dev: false }, wipe: true, message: 'Dev mode off. Saving again.' }
  }
  return { save, wipe: false, message: code ? 'Unknown code.' : null }
}

/**
 * What the treasure chest is worth. The staff of stone is a once-ever reward,
 * so every clear after the first pays out a good deal less.
 */
export function chestReward(save) {
  const first = !save.staff
  return { emeralds: first ? 15 : 3, stone: first ? 64 : 16, staff: first }
}

export function grantReward(save, reward) {
  return {
    ...save,
    emeralds: save.emeralds + reward.emeralds,
    staff: save.staff || reward.staff,
    cleared: true,
  }
}
