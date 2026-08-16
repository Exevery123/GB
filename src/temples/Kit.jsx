/**
 * The bits of a temple's screen that are the same in all of them: the bag, the
 * slots it is drawn in, the icons that go in the slots, and the row of hearts.
 *
 * These started out inside the Stone Temple. They live here now because the
 * Sand Temple wants exactly the same bag and exactly the same hearts, and two
 * copies of an inventory is two chances to get it wrong.
 */
import {
  ARMOR_SLOTS, CRAFT_SLOTS, HEART_COUNT, heartFill, HOTBAR_SLOTS,
  INVENTORY_SLOTS, ITEMS, stack,
} from './world.js'

export const BAGS = ['hotbar', 'main', 'armor', 'craft', 'acorn']

/** An empty bag, or the one you walked out of a temple with last time. */
export function makeInventory(saved) {
  const inv = {
    hotbar: Array(HOTBAR_SLOTS).fill(null),
    main: Array(INVENTORY_SLOTS).fill(null),
    armor: Array(ARMOR_SLOTS).fill(null),
    craft: Array(CRAFT_SLOTS).fill(null),
    // A one-slot array, so it drags and drops like every other slot.
    acorn: [null],
    selected: 0,
  }
  if (saved) {
    for (const bag of BAGS) {
      const src = saved[bag]
      if (!Array.isArray(src)) continue
      src.forEach((slot, i) => {
        if (i < inv[bag].length) inv[bag][i] = slot ? { ...slot } : null
      })
    }
  }
  // The acorn was in the bag before any of this started, and stays there.
  if (!inv.acorn[0]) inv.acorn[0] = stack('acorn', 1)
  return inv
}

export const cloneInventory = (inv) =>
  Object.fromEntries(BAGS.map((bag) => [bag, inv[bag].map((s) => (s ? { ...s } : null))]))

/** Put a bag back exactly as it was, in place - everything holds a reference. */
export function restoreInventory(inv, snapshot) {
  for (const bag of BAGS) {
    for (let i = 0; i < inv[bag].length; i++) {
      const slot = snapshot[bag]?.[i]
      inv[bag][i] = slot ? { ...slot } : null
    }
  }
  inv.selected = 0
}

// ---------------------------------------------------------------- item icons

function SwordIcon() {
  return (
    <svg viewBox="0 0 16 16" className="slot-icon" aria-hidden="true">
      <path d="M11 2h3v3l-6 6-3-3 6-6z" fill="#9aa3ad" />
      <path d="M11 2h3v3l-1.5 1.5-3-3L11 2z" fill="#c6ced6" />
      <path d="M4 9l3 3-1 1-3-3 1-1z" fill="#6b4a2a" />
      <path d="M2 11l3 3-1 1-3-3 1-1z" fill="#4a2f18" />
    </svg>
  )
}

function CobbleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="slot-icon" aria-hidden="true">
      <rect width="16" height="16" fill="#7b7f88" />
      <rect x="1" y="1" width="6" height="5" fill="#9aa0aa" />
      <rect x="9" y="2" width="5" height="4" fill="#666b74" />
      <rect x="2" y="8" width="4" height="6" fill="#666b74" />
      <rect x="8" y="8" width="6" height="3" fill="#9aa0aa" />
      <rect x="8" y="12" width="4" height="2" fill="#8a8f99" />
    </svg>
  )
}

function StoneIcon() {
  return (
    <svg viewBox="0 0 16 16" className="slot-icon" aria-hidden="true">
      <rect width="16" height="16" fill="#8d919a" />
      <rect x="2" y="3" width="5" height="3" fill="#7a7e87" />
      <rect x="10" y="7" width="4" height="4" fill="#7a7e87" />
      <rect x="4" y="11" width="5" height="2" fill="#9ea2ab" />
    </svg>
  )
}

function StaffIcon() {
  return (
    <svg viewBox="0 0 16 16" className="slot-icon" aria-hidden="true">
      <path d="M4 14l7-8 1 1-7 8-1-1z" fill="#6b4a2a" />
      <path d="M9 1l3 1 1 3-2 2-3-1-1-3 2-2z" fill="#8d919a" />
      <path d="M10 3l2 .7.4 2-1.4 1.3-2-.7-.4-2L10 3z" fill="#c6ced6" />
    </svg>
  )
}

function AcornIcon() {
  return (
    <svg viewBox="0 0 16 16" className="slot-icon" aria-hidden="true">
      <path d="M4 7c0 4 1.8 7 4 7s4-3 4-7H4z" fill="#c07b3a" />
      <path d="M3 4h10v3H3z" fill="#6b4423" />
      <rect x="7" y="1" width="2" height="3" fill="#6b4423" />
    </svg>
  )
}

export const ICONS = {
  sword: SwordIcon,
  cobblestone: CobbleIcon,
  stone: StoneIcon,
  staff: StaffIcon,
  acorn: AcornIcon,
}

export function Slot({ item, selected, held, over, label, ...rest }) {
  const Icon = item ? ICONS[item.kind] : null
  return (
    <button
      type="button"
      className={
        'slot' +
        (selected ? ' slot--on' : '') +
        (held ? ' slot--held' : '') +
        (over ? ' slot--over' : '')
      }
      title={item ? ITEMS[item.kind]?.name : label || 'Empty'}
      {...rest}
    >
      {Icon && <Icon />}
      {item && item.count > 1 && <span className="slot-count">{item.count}</span>}
    </button>
  )
}

// ---------------------------------------------------------------- the bag

/**
 * Everything a slot needs to be dragged onto, dragged out of, or clicked once
 * and then clicked somewhere else. `ui` holds `pick` (clicked and waiting) and
 * `over` (being dragged across); `dragRef` holds what is in flight.
 */
export function slotBinder({ inv, ui, dragRef, bump }) {
  const at = (spot, where, i) => !!spot && spot.where === where && spot.i === i

  /** Swap whatever is in two slots. Both drag and click end up here. */
  const swap = (from, to) => {
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
      swap(pick, { where, i })
      ui.pick = null
    }
    bump()
  }

  return (where, i) => ({
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
      swap(dragRef.current, { where, i })
      dragRef.current = null
      ui.over = null
      ui.pick = null
      bump()
    },
    onClick: slotClick(where, i),
  })
}

/** The whole bag, over the top of the game. */
export function InventoryPanel({ inv, slotProps, onClose }) {
  return (
    <div
      className="inv-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
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
  )
}

/** Ten hearts, emptying from the right, each one worth two health. */
export function Hearts({ health }) {
  return (
    <div className="hearts">
      {Array.from({ length: HEART_COUNT }, (_, i) => {
        const fill = heartFill(i, health)
        return (
          <span
            key={i}
            className={
              'heart' + (fill === 1 ? ' heart--full' : fill === 0.5 ? ' heart--half' : '')
            }
          />
        )
      })}
    </div>
  )
}
