/**
 * The equation model for "Solve that Equation!".
 *
 * A side is a list of GROUPS joined by + / -. A group is a list of FACTORS
 * joined by * / /, so "3x * 5" is one group of two factors. Keeping multiplied
 * factors inside the group gives correct precedence for free: a + or - between
 * two groups can only be carried out once both have collapsed to one factor.
 *
 * Numbers are exact rationals, never floats, so a division shows as a tidy
 * simplified fraction instead of 6.999999. A factor also carries a POWER, so
 * x * x becomes x^2 and x^2 / x becomes x.
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

// ---------------------------------------------------------------- structure

/** coef is a rational; power 0 is a plain number, 1 is x, 2 is x^2, ... */
export function makeFactor(coef, power = 0) {
  return { id: uid('f'), coef, power }
}

export function makeGroup(sign, factors, ops = []) {
  return { id: uid('g'), sign, factors, ops }
}

export const constGroup = (n, sign = '+') => makeGroup(sign, [makeFactor(num(n), 0)])
export const varGroup = (n, sign = '+') => makeGroup(sign, [makeFactor(num(n), 1)])

/** The signed value of a single-factor group, e.g. "- 7" -> -7 */
const signedCoef = (g) => (g.sign === '-' ? rNeg(g.factors[0].coef) : g.factors[0].coef)

// ---------------------------------------------------------------- text

export function powerText(p) {
  if (p === 0) return ''
  return p === 1 ? 'x' : `x^${p}`
}

export function factorText(f) {
  const base = powerText(f.power)
  if (!base) return ratText(f.coef)
  if (rIsOne(f.coef)) return base
  if (f.coef.n === -1 && f.coef.d === 1) return `-${base}`
  return `${ratText(f.coef)}${base}`
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
  if (g.ops[i] === '*') return true // powers just add, so x * x is fine
  if (g.ops[i] === '/') return !rIsZero(b.coef) // never divide by zero
  return false
}

const flip = (sign) => (sign === '+' ? '-' : '+')

/**
 * A group carries its sign separately from its coefficient, so once it has
 * collapsed to a single factor a negative coefficient has to be folded into
 * that sign - otherwise "-3x" divided by "-3" reads as "- -1x" instead of "x".
 */
function normalizeGroup(g) {
  if (g.factors.length !== 1) return g
  const f = g.factors[0]
  if (rSign(f.coef) >= 0) return g
  return { ...g, sign: flip(g.sign), factors: [makeFactor(rAbs(f.coef), f.power)] }
}

export function combineFactors(g, i) {
  if (!canCombineFactors(g, i)) return g
  const a = g.factors[i]
  const b = g.factors[i + 1]
  const mul = g.ops[i] === '*'
  const coef = mul ? rMul(a.coef, b.coef) : rDiv(a.coef, b.coef)
  const power = mul ? a.power + b.power : a.power - b.power
  return normalizeGroup({
    ...g,
    factors: [...g.factors.slice(0, i), makeFactor(coef, power), ...g.factors.slice(i + 2)],
    ops: [...g.ops.slice(0, i), ...g.ops.slice(i + 1)],
  })
}

// ---------------------------------------------------------------- groups

/**
 * Can the + or - in front of group i be carried out against group i-1?
 * Both must be a single factor (so pending * and / happen first) and must be
 * like terms - "3x + 7" stays put, which is the point of the exercise.
 */
export function canCombineGroups(side, i) {
  if (i <= 0 || i >= side.length) return false
  const a = side[i - 1]
  const b = side[i]
  if (a.factors.length !== 1 || b.factors.length !== 1) return false
  return a.factors[0].power === b.factors[0].power
}

export function combineGroups(side, i) {
  if (!canCombineGroups(side, i)) return side
  const value = rAdd(signedCoef(side[i - 1]), signedCoef(side[i]))
  const { power } = side[i - 1].factors[0]
  const rest = [...side.slice(0, i - 1), ...side.slice(i + 1)]
  // Terms that cancel disappear, unless they were all that was left
  if (rIsZero(value)) return rest.length ? rest : [constGroup(0)]
  const merged = makeGroup(rSign(value) < 0 ? '-' : '+', [makeFactor(rAbs(value), power)])
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

// ---------------------------------------------------------------- operations

/**
 * + and - append a new group. * and / attach to EVERY group, so multiplying
 * "3x + 7" by 5 shows as "3x * 5 + 7 * 5", not "5 * (3x + 7)".
 */
export function applyToSide(side, kind, operand) {
  if (kind === 'add' || kind === 'sub') {
    let { coef, power } = operand
    let sign = kind === 'add' ? '+' : '-'
    if (rSign(coef) < 0) {
      coef = rAbs(coef)
      sign = sign === '+' ? '-' : '+' // "+ -3" reads as "- 3"
    }
    return [...side, makeGroup(sign, [makeFactor(coef, power)])]
  }
  const op = kind === 'mul' ? '*' : '/'
  return side.map((g) => ({
    ...g,
    factors: [...g.factors, makeFactor(operand.coef, operand.power)],
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

/** Accepts "7", "-3", "x", "2x", "1.5", "3/4", "3/4x", "x^2", "2x^3". */
export function parseOperand(text) {
  let t = String(text).trim().replace(/\s+/g, '')
  if (!t) return null
  let negative = false
  if (t[0] === '+') t = t.slice(1)
  else if (t[0] === '-') {
    negative = true
    t = t.slice(1)
  }
  let power = 0
  let numPart = t
  const xi = t.indexOf('x')
  if (xi >= 0) {
    numPart = t.slice(0, xi)
    const rest = t.slice(xi + 1)
    power = 1
    if (rest.startsWith('^')) {
      const pv = rest.slice(1)
      if (!/^\d+$/.test(pv)) return null
      power = parseInt(pv, 10)
    } else if (rest !== '') return null
  }
  let coef
  if (numPart === '') {
    if (xi < 0) return null
    coef = num(1)
  } else {
    coef = parseNumber(numPart)
    if (!coef) return null
  }
  return { coef: negative ? rNeg(coef) : coef, power }
}

function parseSide(text) {
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
    groups.push(makeGroup(sign, [makeFactor(coef, f.power)]))
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

const isBareX = (side) =>
  side.length === 1 &&
  side[0].factors.length === 1 &&
  side[0].sign === '+' &&
  side[0].factors[0].power === 1 &&
  rIsOne(side[0].factors[0].coef)

const loneConst = (side) =>
  side.length === 1 && side[0].factors.length === 1 && side[0].factors[0].power === 0
    ? signedCoef(side[0])
    : null

/** The value of x once the equation reads "x = n" (either way round), else null. */
export function solvedValue(eq) {
  if (isBareX(eq.left)) {
    const v = loneConst(eq.right)
    if (v !== null) return v
  }
  if (isBareX(eq.right)) {
    const v = loneConst(eq.left)
    if (v !== null) return v
  }
  return null
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

/** The opening puzzle followed by three generated ones. */
export function makePuzzles(rand = Math.random) {
  return [firstEquation(), randomEquation(rand), randomEquation(rand), randomEquation(rand)]
}

// ---------------------------------------------------------------- word problems

/**
 * A word problem carries the units its numbers stand for, so the visualiser
 * can draw them. `perUnit` is how many pieces make one whole item.
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
    given: true, // the equation is handed to the student for this first one
    equation: () => ({ left: [varGroup(4), constGroup(7, '-')], right: [constGroup(20)] }),
  },
]
