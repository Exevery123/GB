/**
 * "More Variables" - the unit where a second letter turns up and an answer
 * stops being a number.
 *
 * Every stage names the letter it wants isolated and the expression that
 * counts as isolating it. Answers are compared in canonical form, so the order
 * the terms end up in never matters: `ce - cd - a` and `-a + ce - cd` are the
 * same answer.
 */
import {
  constGroup, expr, makeGroup, makeParen, makeTerm, num, rat, symGroup,
} from './equation.js'

const term = (coef, powers, sign = '+') => makeGroup(sign, [makeTerm(coef, powers)])

// ------------------------------------------------------------ the equations

/** 3x/4 - 5 = 1, which is an ordinary one-letter solve until it isn't. */
const opener = () => ({
  left: [term(rat(3, 4), { x: 1 }), constGroup(5, '-')],
  right: [constGroup(1)],
})

/** What the opener turns into once 10y drops in: x + 10y = 8. */
const interrupted = () => ({
  left: [symGroup(1, 'x'), term(num(10), { y: 1 })],
  right: [constGroup(8)],
})

/** y/5 - 7 + 15x^2 = 13 */
const inTermsOfX = () => ({
  left: [term(rat(1, 5), { y: 1 }), constGroup(7, '-'), term(num(15), { x: 2 })],
  right: [constGroup(13)],
})

/**
 * (a + b)/c + d = e. The bracket is a real one: multiply both sides by c and
 * the c's cancel off it, and once nothing is left holding the bracket together
 * it opens by itself.
 */
const letters = () => ({
  left: [
    makeGroup('+', [makeParen([symGroup(1, 'a'), symGroup(1, 'b')]), makeTerm(num(1), { c: 1 })], ['/']),
    symGroup(1, 'd'),
  ],
  right: [symGroup(1, 'e')],
})

/** 3x/7 + 4y/9 = 11, the one there are no buttons for. */
const byHand = () => ({
  left: [term(rat(3, 7), { x: 1 }), term(rat(4, 9), { y: 1 })],
  right: [constGroup(11)],
})

// ------------------------------------------------------------ the bonus chain

/** 4x - 12y - 3 = 17, which comes out as x = 3y + 5. */
const chainOne = () => ({
  left: [term(num(4), { x: 1 }), term(num(12), { y: 1 }, '-'), constGroup(3, '-')],
  right: [constGroup(17)],
})

/** 7x = 4y + 1, waiting for x to be replaced. */
const chainTwo = () => ({
  left: [term(num(7), { x: 1 })],
  right: [term(num(4), { y: 1 }), constGroup(1)],
})

/** x = 3y + 5 again, this time waiting for y. */
const chainThree = () => ({
  left: [symGroup(1, 'x')],
  right: [term(num(3), { y: 1 }), constGroup(5)],
})

// ------------------------------------------------------------ stages

export function moreVariableStages() {
  const total = 5
  return [
    {
      kind: 'interrupt',
      label: `Equation 1 of ${total}`,
      prompt: 'Solve for x.',
      eq: opener(),
      // Getting to x = 8 is where the second letter arrives.
      trigger: { target: 'x', answer: expr('8') },
      after: {
        eq: interrupted(),
        target: 'x',
        answer: expr('8 - 10y'),
        prompt: 'Make sure to isolate x.',
      },
    },
    {
      kind: 'solve',
      label: `Equation 2 of ${total}`,
      prompt: 'Find y in terms of x.',
      eq: inTermsOfX(),
      target: 'y',
      answer: expr('100 - 75x^2'),
    },
    {
      kind: 'solve',
      label: `Equation 3 of ${total}`,
      prompt: 'Find b in terms of a, c, d, and e.',
      eq: letters(),
      target: 'b',
      answer: expr('c*e - c*d - a'),
    },
    {
      kind: 'typed',
      label: `Equation 4 of ${total}`,
      prompt: 'Solve this one by hand. Find x in terms of y.',
      eq: byHand(),
      target: 'x',
      answer: expr('77/3 - 28y/27'),
      // Only a reminder of the format. Deliberately nowhere near the answer,
      // since this is the one stage with nothing to stop you guessing.
      placeholder: '4/3 + 5y/6',
    },
    {
      kind: 'chain',
      label: 'Bonus problem',
      steps: [
        {
          prompt: 'Solve x in terms of y.',
          eq: chainOne(),
          target: 'x',
          answer: expr('3y + 5'),
        },
        {
          prompt: 'Plug in your equation for x.',
          eq: chainTwo(),
          target: 'y',
          substitute: 'x',
          answer: expr('-2'),
        },
        {
          prompt: 'Plug in your equation for y.',
          eq: chainThree(),
          target: 'x',
          substitute: 'y',
          answer: expr('-1'),
        },
      ],
    },
  ]
}
