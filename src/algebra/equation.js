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

/** The x part on its own. A negative power still reads as x, but underneath. */
export function powerText(p) {
  if (p === 0) return ''
  const k = Math.abs(p)
  return k === 1 ? 'x' : `x^${k}`
}

export function factorText(f) {
  // A negative power puts x on the bottom, so 4/3 x^-1 reads as 4/(3x).
  if (f.power < 0) {
    const base = powerText(f.power)
    const den = f.coef.d === 1 ? base : `${f.coef.d}${base}`
    const sign = f.coef.n < 0 ? '-' : ''
    return `${sign}${Math.abs(f.coef.n)}/${den.length > 1 ? `(${den})` : den}`
  }
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

/**
 * Accepts "7", "-3", "x", "2x", "1.5", "3/4", "3/4x", "x^2", "2x^3", and a
 * divisor written after the x rather than before it: "x/2", "3x/2", "x^2/3".
 *
 * A trailing divisor belongs to the coefficient, so "3x/2" and "3/2x" are the
 * same thing - three halves of x, not three x's over something else.
 */
export function parseOperand(text) {
  let t = String(text).trim().replace(/\s+/g, '')
  if (!t) return null
  let negative = false
  if (t[0] === '+') t = t.slice(1)
  else if (t[0] === '-') {
    negative = true
    t = t.slice(1)
  }

  const xi = t.indexOf('x')
  if (xi < 0) {
    const plain = parseNumber(t)
    if (!plain) return null
    return { coef: negative ? rNeg(plain) : plain, power: 0 }
  }

  // [number] x [^power] [/divisor]
  const numPart = t.slice(0, xi)
  let rest = t.slice(xi + 1)
  let power = 1

  if (rest.startsWith('^')) {
    const digits = rest.slice(1).match(/^\d+/)
    if (!digits) return null
    power = parseInt(digits[0], 10)
    rest = rest.slice(1 + digits[0].length)
  }

  let divisor = null
  if (rest.startsWith('/')) {
    divisor = parseNumber(rest.slice(1))
    if (!divisor || rIsZero(divisor)) return null
    rest = ''
  }
  if (rest !== '') return null

  let coef = numPart === '' ? num(1) : parseNumber(numPart)
  if (!coef) return null
  if (divisor) {
    coef = rDiv(coef, divisor)
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
 * The bonus problem that closes the unit: 4/(3x) + 9 = 37, with x underneath.
 * A power of -1 is what puts it there. Take 9 off both sides for 4/(3x) = 28,
 * multiply both sides by x to bring it up as 4/3 = 28x, then divide by 28.
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
 * The unit in order: four equations, the three word problems, then the bonus.
 * Every stage carries the answer it is supposed to reach, so working that ends
 * somewhere else can be turned away instead of quietly counting as a pass.
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
