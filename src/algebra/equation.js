/**
 * The equation model for the algebra units.
 *
 * A side is a list of GROUPS joined by + / -. A group is a list of FACTORS
 * joined by * / /, so "3x * 5" is one group of two factors. Keeping multiplied
 * factors inside the group gives correct precedence for free: a + or - between
 * two groups can only be carried out once both have collapsed to one factor.
 *
 * Numbers are exact rationals, never floats, so a division shows as a tidy
 * simplified fraction instead of 6.999999. A factor also carries a map of
 * LETTER -> POWER, so one factor can be `ce` or `a/c` as readily as `3x^2`.
 * That map is what keeps the model from dead-ending: any two factors can
 * always be multiplied or divided, because the powers simply add or subtract.
 *
 * A factor can instead be a PAREN, a bracketed sum held whole until it is
 * multiplied out or until nothing is left holding it together.
 *
 * Everything here is pure, so the whole model is testable without a DOM.
 */

let seq = 0
const uid = (prefix) => `${prefix}${++seq}`

// ---------------------------------------------------------------- rationals

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a))

/** Build a rational in lowest terms with the sign kept on the numerator. */
export function rat(n, d = 1) {
  if (d === 0) return null
  if (d < 0) {
    n = -n
    d = -d
  }
  const g = gcd(Math.abs(n), d) || 1
  return { n: n / g, d: d / g }
}

export const num = (n) => rat(n, 1)

/** 1.5 -> 3/2. Decimals only ever enter through typed input. */
export function ratFromDecimal(x) {
  if (Number.isInteger(x)) return rat(x, 1)
  const decimals = (String(x).split('.')[1] || '').length
  const scale = 10 ** decimals
  return rat(Math.round(x * scale), scale)
}

export const rAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d)
export const rMul = (a, b) => rat(a.n * b.n, a.d * b.d)
export const rDiv = (a, b) => (b.n === 0 ? null : rat(a.n * b.d, a.d * b.n))
export const rNeg = (r) => rat(-r.n, r.d)
export const rAbs = (r) => rat(Math.abs(r.n), r.d)
export const rIsZero = (r) => r.n === 0
export const rIsOne = (r) => r.n === 1 && r.d === 1
export const rSign = (r) => Math.sign(r.n)
export const rEq = (a, b) => a.n === b.n && a.d === b.d
/** "3", "-3", or "3/4" - already simplified by construction. */
export const ratText = (r) => (r.d === 1 ? String(r.n) : `${r.n}/${r.d}`)

// ---------------------------------------------------------------- symbols

/**
 * Every letter the game can put on screen, in the order they read inside a
 * term - so the factor built from {e:1, c:1} always shows as `ce`, never `ec`,
 * and two students who reach the same answer by different routes see the same
 * thing on screen.
 */
export const SYMBOLS = ['x', 'y', 'z', 'a', 'b', 'c', 'd', 'e']
const SYMBOL_ORDER = new Map(SYMBOLS.map((s, i) => [s, i]))

/** Drop zero powers, so {x: 0} and {} are the same thing everywhere. */
export function cleanPowers(powers) {
  const out = {}
  for (const s of SYMBOLS) if (powers[s]) out[s] = powers[s]
  return out
}

/** The letters actually present, in reading order. */
export const powerSymbols = (powers) =>
  SYMBOLS.filter((s) => powers[s])

/**
 * A stable string for a set of powers, so like terms can be looked up and
 * compared. `3x^2` and `-7x^2` share the key `x^2`; `ce` and `ec` share
 * `c^1 e^1`.
 */
export const powersKey = (powers) =>
  powerSymbols(powers).map((s) => `${s}^${powers[s]}`).join(' ')

// ---------------------------------------------------------------- structure

/** coef is a rational; powers maps letters to their exponents. */
export function makeTerm(coef, powers = {}) {
  return { id: uid('f'), coef, powers: cleanPowers(powers) }
}

/**
 * The single-letter shorthand the earlier units are written in: power 0 is a
 * plain number, 1 is x, 2 is x^2, and a negative power puts x underneath.
 */
export function makeFactor(coef, power = 0, sym = 'x') {
  return makeTerm(coef, power ? { [sym]: power } : {})
}

/** A bracketed sum, held whole until it is multiplied out or opened up. */
export function makeParen(side) {
  return { id: uid('p'), paren: side }
}

export const isParen = (f) => !!f.paren

export function makeGroup(sign, factors, ops = []) {
  return { id: uid('g'), sign, factors, ops }
}

export const constGroup = (n, sign = '+') => makeGroup(sign, [makeFactor(num(n), 0)])
export const varGroup = (n, sign = '+') => makeGroup(sign, [makeFactor(num(n), 1)])
export const symGroup = (n, sym, sign = '+') =>
  makeGroup(sign, [makeTerm(num(n), { [sym]: 1 })])

/** The signed value of a single-factor group, e.g. "- 7" -> -7 */
const signedCoef = (g) => (g.sign === '-' ? rNeg(g.factors[0].coef) : g.factors[0].coef)

const flip = (sign) => (sign === '+' ? '-' : '+')

/** A fresh copy, so a factor reused across several groups keeps a unique id. */
const recopy = (f) => (isParen(f) ? makeParen(f.paren) : { ...f, id: uid('f') })

// ---------------------------------------------------------------- text

const symText = (sym, power) => (Math.abs(power) === 1 ? sym : `${sym}^${Math.abs(power)}`)

/**
 * A factor split into what sits above the line and what sits below it.
 * Positive powers go on top, negative ones underneath, so `a/c` is one factor
 * drawn as a fraction rather than two things waiting to be divided.
 */
export function factorParts(f) {
  const top = []
  const bot = []
  for (const s of powerSymbols(f.powers)) (f.powers[s] > 0 ? top : bot).push(s)
  return {
    negative: f.coef.n < 0,
    topNum: Math.abs(f.coef.n),
    botNum: f.coef.d,
    top,
    bot,
    // A lone number needs its digit; `x` does not need the 1 in front of it.
    stacked: f.coef.d !== 1 || bot.length > 0,
  }
}

export function factorText(f) {
  if (isParen(f)) return `(${sideText(f.paren)})`
  const p = factorParts(f)
  const sign = p.negative ? '-' : ''
  const half = (n, syms) => {
    const body = syms.map((s) => symText(s, f.powers[s])).join('')
    if (!body) return String(n)
    return n === 1 ? body : `${n}${body}`
  }
  const top = half(p.topNum, p.top)
  if (!p.stacked) return sign + top
  const bot = half(p.botNum, p.bot)
  return `${sign}${top}/${bot.length > 1 ? `(${bot})` : bot}`
}

export function groupText(g, isFirst) {
  const body = g.factors
    .map(factorText)
    .reduce((acc, t, i) => (i === 0 ? t : `${acc} ${g.ops[i - 1]} ${t}`), '')
  if (isFirst) return g.sign === '-' ? `-${body}` : body
  return `${g.sign} ${body}`
}

export const sideText = (side) => side.map((g, i) => groupText(g, i === 0)).join(' ')
export const equationText = (eq) => `${sideText(eq.left)} = ${sideText(eq.right)}`

// ---------------------------------------------------------------- factors

/** Can the * or / at ops[i] be carried out? */
export function canCombineFactors(g, i) {
  const a = g.factors[i]
  const b = g.factors[i + 1]
  if (!a || !b) return false
  // Two brackets multiplied together is not something these units ask for.
  if (isParen(a) && isParen(b)) return false
  // A bracket can be divided into but never divided BY - `3/(a+b)` has
  // nowhere to go.
  if (isParen(b)) return g.ops[i] === '*'
  if (g.ops[i] === '*') return true // powers just add, so x * y is fine
  if (g.ops[i] === '/') return isParen(a) || !rIsZero(b.coef) // never divide by zero
  return false
}

/**
 * A group carries its sign separately from its coefficient, so once it has
 * collapsed to a single factor a negative coefficient has to be folded into
 * that sign - otherwise "-3x" divided by "-3" reads as "- -1x" instead of "x".
 *
 * A bracket keeps its own signs inside, so it is left alone.
 */
function normalizeGroup(g) {
  if (g.factors.length !== 1) return g
  const f = g.factors[0]
  if (isParen(f) || rSign(f.coef) >= 0) return g
  return { ...g, sign: flip(g.sign), factors: [makeTerm(rAbs(f.coef), f.powers)] }
}

/** Push `* k` or `/ k` onto every term inside a bracket. */
function pushIntoParen(p, op, factor, front = false) {
  return makeParen(
    p.paren.map((g) => ({
      ...g,
      factors: front ? [recopy(factor), ...g.factors] : [...g.factors, recopy(factor)],
      ops: front ? [op, ...g.ops] : [...g.ops, op],
    })),
  )
}

export function combineFactors(g, i) {
  if (!canCombineFactors(g, i)) return g
  const a = g.factors[i]
  const b = g.factors[i + 1]
  const op = g.ops[i]

  let merged
  if (isParen(a)) merged = pushIntoParen(a, op, b)
  else if (isParen(b)) merged = pushIntoParen(b, '*', a, true)
  else {
    const mul = op === '*'
    const coef = mul ? rMul(a.coef, b.coef) : rDiv(a.coef, b.coef)
    const powers = {}
    for (const s of SYMBOLS) {
      const k = (a.powers[s] || 0) + (mul ? 1 : -1) * (b.powers[s] || 0)
      if (k) powers[s] = k
    }
    merged = makeTerm(coef, powers)
  }

  return normalizeGroup({
    ...g,
    factors: [...g.factors.slice(0, i), merged, ...g.factors.slice(i + 2)],
    ops: [...g.ops.slice(0, i), ...g.ops.slice(i + 1)],
  })
}

/**
 * A bracket with nothing left holding it together opens by itself: once the
 * `/c` beside `(a + b)` has cancelled, there is no bracket left to draw, so
 * `(a + b) + d` becomes `a + b + d`. A minus in front flips every sign inside.
 */
export function openParens(side) {
  let changed = false
  const out = []
  for (const g of side) {
    if (g.factors.length === 1 && isParen(g.factors[0])) {
      changed = true
      for (const h of g.factors[0].paren) {
        out.push({ ...h, id: uid('g'), sign: g.sign === '-' ? flip(h.sign) : h.sign })
      }
    } else out.push(g)
  }
  return changed ? out : side
}

// ---------------------------------------------------------------- groups

/**
 * Can the + or - in front of group i be carried out against group i-1?
 * Both must be a single plain factor (so pending * and / happen first) and
 * must be like terms - "3x + 7" stays put, which is the point of the exercise.
 */
export function canCombineGroups(side, i) {
  if (i <= 0 || i >= side.length) return false
  const a = side[i - 1]
  const b = side[i]
  if (a.factors.length !== 1 || b.factors.length !== 1) return false
  if (isParen(a.factors[0]) || isParen(b.factors[0])) return false
  return powersKey(a.factors[0].powers) === powersKey(b.factors[0].powers)
}

export function combineGroups(side, i) {
  if (!canCombineGroups(side, i)) return side
  const value = rAdd(signedCoef(side[i - 1]), signedCoef(side[i]))
  const { powers } = side[i - 1].factors[0]
  const rest = [...side.slice(0, i - 1), ...side.slice(i + 1)]
  // Terms that cancel disappear, unless they were all that was left
  if (rIsZero(value)) return rest.length ? rest : [constGroup(0)]
  const merged = makeGroup(rSign(value) < 0 ? '-' : '+', [makeTerm(rAbs(value), powers)])
  return [...side.slice(0, i - 1), merged, ...side.slice(i + 1)]
}

// ---------------------------------------------------------------- dragging

/** Move a group within its side. Signs travel with their group. */
export function moveGroup(side, from, to) {
  if (from === to) return side
  if (from < 0 || from >= side.length || to < 0 || to >= side.length) return side
  const next = [...side]
  const [g] = next.splice(from, 1)
  next.splice(to, 0, g)
  return next
}

/** A lone term has nowhere to go, so "49" can't be dragged until it has company. */
export const canDrag = (side) => side.length > 1

// ---------------------------------------------------------------- substituting

/** Every place on a side where `sym` appears on its own first power. */
export function substitutionSpots(side, sym) {
  const spots = []
  side.forEach((g, gi) => {
    if (g.factors.length !== 1) return
    const f = g.factors[0]
    if (!isParen(f) && f.powers[sym] === 1) spots.push({ group: gi, factor: 0 })
  })
  return spots
}

/**
 * Put an expression in place of one letter. Whatever was multiplying the
 * letter stays in front as its own factor, so replacing x in `7x` with
 * `3y + 5` reads as `7 * 3y + 7 * 5` - the multiplying out is left for the
 * student, which is the whole point of the step.
 */
export function substitute(side, gi, sym, expr) {
  const g = side[gi]
  if (!g || g.factors.length !== 1) return side
  const f = g.factors[0]
  if (isParen(f) || f.powers[sym] !== 1) return side

  const rest = makeTerm(f.coef, { ...f.powers, [sym]: 0 })
  // `x` itself, with nothing multiplying it, needs no factor left in front.
  const bare = rIsOne(rest.coef) && powersKey(rest.powers) === ''

  const built = expr.map((h) => {
    const inner = h.factors.map(recopy)
    // A minus inside the expression rides on the number rather than on the
    // group, so substituting -2 shows as `3 * -2` and not `- 3 * 2`.
    if (!bare && h.sign === '-' && !isParen(inner[0])) {
      inner[0] = makeTerm(rNeg(inner[0].coef), inner[0].powers)
    }
    return {
      id: uid('g'),
      sign: bare ? (g.sign === '-' ? flip(h.sign) : h.sign) : g.sign,
      factors: bare ? inner : [recopy(rest), ...inner],
      ops: bare ? [...h.ops] : ['*', ...h.ops],
    }
  })

  return [...side.slice(0, gi), ...built, ...side.slice(gi + 1)]
}

// ---------------------------------------------------------------- operations

/**
 * + and - append a new group. * and / attach to EVERY group, so multiplying
 * "3x + 7" by 5 shows as "3x * 5 + 7 * 5", not "5 * (3x + 7)".
 */
export function applyToSide(side, kind, operand) {
  if (kind === 'add' || kind === 'sub') {
    let { coef } = operand
    let sign = kind === 'add' ? '+' : '-'
    if (rSign(coef) < 0) {
      coef = rAbs(coef)
      sign = sign === '+' ? '-' : '+' // "+ -3" reads as "- 3"
    }
    return [...side, makeGroup(sign, [makeTerm(coef, operand.powers)])]
  }
  const op = kind === 'mul' ? '*' : '/'
  return side.map((g) => ({
    ...g,
    factors: [...g.factors, makeTerm(operand.coef, operand.powers)],
    ops: [...g.ops, op],
  }))
}

export const applyOperation = (eq, kind, operand) => ({
  left: applyToSide(eq.left, kind, operand),
  right: applyToSide(eq.right, kind, operand),
})

// ---------------------------------------------------------------- parsing

function parseNumber(s) {
  if (/^\d+(\.\d+)?$/.test(s)) return ratFromDecimal(parseFloat(s))
  const m = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const bottom = ratFromDecimal(parseFloat(m[2]))
  if (rIsZero(bottom)) return null
  return rDiv(ratFromDecimal(parseFloat(m[1])), bottom)
}

/**
 * One term, read strictly left to right: "7", "-3", "x", "2x", "1.5", "3/4",
 * "x^2", "2x^3", "ce", "c*e", "a/c", and a divisor written after the letter
 * rather than before it: "x/2", "3x/2", "28y/27".
 *
 * Left to right is what makes "3x/2" and "3/2x" the same thing - three halves
 * of x, not three x's over something else.
 */
export function parseOperand(text) {
  let t = String(text).trim().replace(/\s+/g, '').toLowerCase()
  if (!t) return null

  let negative = false
  if (t[0] === '+') t = t.slice(1)
  else if (t[0] === '-') {
    negative = true
    t = t.slice(1)
  }

  let coef = num(1)
  const powers = {}
  let op = '*'
  let read = false

  while (t) {
    let m
    if ((m = t.match(/^[*/]/))) {
      op = m[0]
      t = t.slice(1)
      continue
    }
    if ((m = t.match(/^\d+(?:\.\d+)?/))) {
      const v = ratFromDecimal(parseFloat(m[0]))
      if (op === '*') coef = rMul(coef, v)
      else {
        if (rIsZero(v)) return null
        coef = rDiv(coef, v)
      }
      t = t.slice(m[0].length)
      op = '*'
      read = true
      continue
    }
    if ((m = t.match(/^([a-z])(?:\^(\d+))?/))) {
      if (!SYMBOL_ORDER.has(m[1])) return null
      const p = m[2] ? parseInt(m[2], 10) : 1
      powers[m[1]] = (powers[m[1]] || 0) + (op === '*' ? p : -p)
      t = t.slice(m[0].length)
      op = '*'
      read = true
      continue
    }
    return null
  }

  if (!read) return null
  return { coef: negative ? rNeg(coef) : coef, powers: cleanPowers(powers) }
}

export function parseSide(text) {
  const t = String(text).trim().replace(/\s+/g, '')
  if (!t) return null
  const tokens = t.match(/[+-]?[^+-]+/g)
  if (!tokens) return null
  const groups = []
  for (const token of tokens) {
    let sign = '+'
    let body = token
    if (body[0] === '+') body = body.slice(1)
    else if (body[0] === '-') {
      sign = '-'
      body = body.slice(1)
    }
    const f = parseOperand(body)
    if (!f) return null
    let { coef } = f
    if (rSign(coef) < 0) {
      coef = rAbs(coef)
      sign = sign === '+' ? '-' : '+'
    }
    groups.push(makeGroup(sign, [makeTerm(coef, f.powers)]))
  }
  return groups
}

/** Parse a whole typed equation, e.g. "4x - 7 = 20". Used by sandbox mode. */
export function parseEquation(text) {
  const parts = String(text).split('=')
  if (parts.length !== 2) return null
  const left = parseSide(parts[0])
  const right = parseSide(parts[1])
  if (!left || !right) return null
  return { left, right }
}

// ---------------------------------------------------------------- solving

/**
 * A side boiled down to `powers key -> term`, with like terms added up. This
 * is what makes an answer order-blind: `ce - cd - a` and `-a + ce - cd` reduce
 * to exactly the same map, so both are marked right.
 *
 * null if anything is still bracketed or still waiting to be multiplied out.
 */
export function canonical(side) {
  const out = new Map()
  for (const g of side) {
    if (g.factors.length !== 1) return null
    const f = g.factors[0]
    if (isParen(f)) return null
    const key = powersKey(f.powers)
    const coef = g.sign === '-' ? rNeg(f.coef) : f.coef
    const seen = out.get(key)
    out.set(key, { powers: f.powers, coef: seen ? rAdd(seen.coef, coef) : coef })
  }
  for (const [k, v] of out) if (rIsZero(v.coef)) out.delete(k)
  return out
}

export function canonEq(a, b) {
  if (!a || !b || a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (!w || !rEq(v.coef, w.coef)) return false
  }
  return true
}

/** The canonical form of an answer written out longhand, e.g. "8 - 10y". */
export function expr(text) {
  const side = parseSide(text)
  return side ? canonical(side) : null
}

/**
 * True when there is nothing left on this side that could still be clicked:
 * every group is one plain factor, and no two of them are like terms.
 * "-6 + 5" is not finished, even though it is perfectly readable.
 */
export function isCollapsed(side) {
  const seen = new Set()
  for (const g of side) {
    if (g.factors.length !== 1 || isParen(g.factors[0])) return false
    const key = powersKey(g.factors[0].powers)
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

const isBareSym = (side, sym) =>
  side.length === 1 &&
  side[0].factors.length === 1 &&
  side[0].sign === '+' &&
  !isParen(side[0].factors[0]) &&
  rIsOne(side[0].factors[0].coef) &&
  powersKey(side[0].factors[0].powers) === `${sym}^1`

/**
 * What `sym` works out to once the equation reads "sym = ...", as a canonical
 * map, or null. The other side has to be finished and must not mention `sym`
 * itself, so "x = 2x - 8" does not count as solved.
 */
export function solvedExpr(eq, sym = 'x') {
  for (const [bare, value] of [['left', 'right'], ['right', 'left']]) {
    if (!isBareSym(eq[bare], sym)) continue
    if (!isCollapsed(eq[value])) continue
    const c = canonical(eq[value])
    if (!c) continue
    if ([...c.values()].some((v) => v.powers[sym])) continue
    return c
  }
  return null
}

/**
 * The groups on the far side of a solved "sym = ...", ready to be dropped into
 * another equation in place of that letter. null while it is not solved.
 */
export function solutionSide(eq, sym = 'x') {
  for (const [bare, value] of [['left', 'right'], ['right', 'left']]) {
    if (isBareSym(eq[bare], sym) && isCollapsed(eq[value])) return eq[value]
  }
  return null
}

/** The value of x once the equation reads "x = n" (either way round), else null. */
export function solvedValue(eq) {
  const c = solvedExpr(eq, 'x')
  if (!c) return null
  if (c.size === 0) return num(0) // everything cancelled: x = 0
  if (c.size !== 1) return null
  const [only] = [...c.values()]
  return powersKey(only.powers) === '' ? only.coef : null
}

// ---------------------------------------------------------------- puzzles

/** The fixed opening puzzle. */
export const firstEquation = () => ({
  eq: { left: [varGroup(3), constGroup(7)], right: [constGroup(49)] },
  answer: num(14),
})

/**
 * ax + b = c, where the coefficient may be negative and/or a fraction, and
 * the constant may be added or subtracted.
 */
export function randomEquation(rand = Math.random) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const denom = rand() < 0.35 ? pick([2, 3, 4]) : 1
  const magnitude = 2 + Math.floor(rand() * 8) // 2..9
  const aNegative = rand() < 0.4
  const a = rat(aNegative ? -magnitude : magnitude, denom)

  const x = num(1 + Math.floor(rand() * 12)) // 1..12
  const bMagnitude = 1 + Math.floor(rand() * 20)
  const bSign = rand() < 0.5 ? '-' : '+'
  const b = bSign === '-' ? num(-bMagnitude) : num(bMagnitude)
  const c = rAdd(rMul(a, x), b)

  return {
    eq: {
      left: [
        makeGroup(rSign(a) < 0 ? '-' : '+', [makeFactor(rAbs(a), 1)]),
        makeGroup(bSign, [makeFactor(num(bMagnitude), 0)]),
      ],
      right: [makeGroup(rSign(c) < 0 ? '-' : '+', [makeFactor(rAbs(c), 0)])],
    },
    answer: x,
  }
}

/**
 * ax + b = c for the temple, where a, b and the answer are all single digits.
 * The temple's keypad only has 1 to 9, so every number you have to *type* -
 * b to take off, then a to divide by - has to be reachable on it.
 */
export function keypadEquation(rand = Math.random) {
  const a = 2 + Math.floor(rand() * 8) // 2..9
  const b = 1 + Math.floor(rand() * 9) // 1..9
  const x = 1 + Math.floor(rand() * 9) // 1..9
  return {
    eq: { left: [varGroup(a), constGroup(b)], right: [constGroup(a * x + b)] },
    answer: num(x),
  }
}

/** The opening puzzle followed by three generated ones. */
export function makePuzzles(rand = Math.random) {
  return [firstEquation(), randomEquation(rand), randomEquation(rand), randomEquation(rand)]
}

/**
 * The bonus problem that closes "Solve that Equation!": 4/(3x) + 9 = 37, with
 * x underneath. A power of -1 is what puts it there. Take 9 off both sides for
 * 4/(3x) = 28, multiply both sides by x to bring it up as 4/3 = 28x, then
 * divide by 28.
 */
export const bonusEquation = () => ({
  eq: {
    left: [makeGroup('+', [makeFactor(rat(4, 3), -1)]), constGroup(9)],
    right: [constGroup(37)],
  },
  answer: rat(1, 21),
})

// ---------------------------------------------------------------- word problems

/**
 * A word problem carries the units its numbers stand for, so the visualiser
 * can draw them. `perUnit` is how many pieces make one whole item, and `piece`
 * picks which counter gets drawn.
 *
 * The first problem hands the equation over. After that `sandbox` is set, so
 * the student writes the equation themselves before solving it; `answer` is
 * only kept here to document what the problem works out to.
 */
export const WORD_PROBLEMS = [
  {
    id: 'benny',
    text:
      "Benny got some Hershey's Bars for Christmas. Each Hershey Bar is split " +
      'into 4 chocolate pieces. After Christmas, he ate 7 chocolate pieces. At ' +
      'the end, he had 20 chocolate pieces left. How many chocolate bars did he ' +
      'start with?',
    perUnit: 4, // 4 pieces to a bar
    piece: 'chocolate',
    equation: () => ({ left: [varGroup(4), constGroup(7, '-')], right: [constGroup(20)] }),
    answer: rat(27, 4),
  },
  {
    id: 'chase',
    text:
      'Chase is playing for his baseball team. Dan scored 3 points, Ben scored ' +
      '2 points, and Lance scored 7 points. However, according to Chase, his ' +
      "score along with Ben's score is equal to Dan's and Lance's score " +
      'combined. However, the referee said that Chase scored half of the points ' +
      'he thought he scored. How many points did Chase actually score?',
    perUnit: 3, // baseballs stack three at a time
    piece: 'ball',
    sandbox: true,
    // x is what Chase really scored, so he thought he scored 2x: 2x + 2 = 3 + 7
    answer: num(4),
  },
  {
    id: 'michael',
    text:
      "Michael's machine makes lots and lots of rocks. Each second, he makes " +
      'some rocks. However, when running his machine for a minute it breaks ' +
      'down and he only gets half the rocks each second. And when he first ' +
      'built his machine, he lost 100 rocks to build. He got 440 rocks after 5 ' +
      'minutes. In the first minute, how many rocks did he get per second?',
    perUnit: 3, // rocks stack three at a time
    piece: 'rock',
    sandbox: true,
    // 60 seconds at x, then 240 seconds at x/2, less the 100 it cost to build:
    // 60x + 120x - 100 = 440, so 180x = 540 and x = 3.
    answer: num(3),
  },
]

// ---------------------------------------------------------------- counters

/**
 * A count laid out as stacks of `perUnit` counters, for the picture version of
 * an equation. Whole counters come first, then whatever fraction is left over
 * as one part-filled counter on the end.
 *
 * The stacks belong to the number, not to the line: each one is drawn as a
 * column, so a row of them never depends on where the text happens to wrap.
 */
export function counterStacks(value, perUnit) {
  const whole = Math.floor(value.n / value.d)
  const rest = value.n - whole * value.d
  const parts = Array(whole).fill(1)
  if (rest > 0) parts.push(rest / value.d)

  const stacks = []
  for (let i = 0; i < parts.length; i += perUnit) stacks.push(parts.slice(i, i + perUnit))
  return stacks
}

// ---------------------------------------------------------------- stages

/**
 * "Solve that Equation!" in order: four equations, the three word problems,
 * then the bonus. Every stage carries the answer it is supposed to reach, so
 * working that ends somewhere else can be turned away instead of quietly
 * counting as a pass.
 */
export function makeStages(rand = Math.random) {
  const puzzles = makePuzzles(rand)
  const bonus = bonusEquation()
  return [
    ...puzzles.map((p, i) => ({
      kind: 'equation',
      label: `Equation ${i + 1} of ${puzzles.length}`,
      eq: p.eq,
      answer: p.answer,
    })),
    ...WORD_PROBLEMS.map((p, i) => ({
      kind: p.sandbox ? 'sandbox' : 'word',
      label: `Word problem ${i + 1} of ${WORD_PROBLEMS.length}`,
      problem: p,
      eq: p.equation ? p.equation() : null,
      answer: p.answer,
    })),
    { kind: 'bonus', label: 'Bonus problem', eq: bonus.eq, answer: bonus.answer },
  ]
}

/**
 * Reaching "x = something" is not the same as being finished: in a sandbox
 * problem a wrong equation solves perfectly well to the wrong number.
 */
export const isCorrect = (solved, answer) => solved !== null && !!answer && rEq(solved, answer)
