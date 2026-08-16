import { useEffect, useMemo, useState } from 'react'
import BackButton from '../BackButton.jsx'
import EquationBoard from './EquationBoard.jsx'
import {
  counterStacks, factorText, isCorrect, makeStages, parseEquation, ratText,
  solvedValue,
} from './equation.js'

/** Only a safety net against a typed 9999x - every real problem is far under. */
const MAX_COUNTERS = 1000

// ---------------------------------------------------------------- counters

/**
 * The picture is there to be read *instead* of the numbers, so nothing in it
 * falls back to a numeral. A count that is not whole is drawn as whole
 * counters plus one part-filled counter, and a term with x underneath is drawn
 * as one picture stacked over another.
 */

/** One counter, filled all the way across or only part of the way. */
function Piece({ piece, part = 1 }) {
  const cls = 'choc-piece choc-piece--' + piece
  if (part >= 1) return <span className={cls} />
  return (
    <span className={cls + ' choc-piece--part'}>
      <span
        className={'choc-fill choc-fill--' + piece}
        style={{ width: `${Math.max(0, part) * 100}%` }}
      />
    </span>
  )
}

/** `value` counters - whole ones, then the leftover - in stacks of `perUnit`. */
function Pieces({ value, perUnit, piece }) {
  const stacks = counterStacks(value, perUnit)
  const total = stacks.reduce((n, row) => n + row.length, 0)

  // Zero is an empty counter rather than the digit 0.
  if (total === 0) return <Piece piece={piece} part={0} />
  // Only a typo like 9999x can reach this, and it would lock the page up.
  if (total > MAX_COUNTERS) {
    return (
      <span className="choc-run">
        <span className={'choc-bar choc-bar--' + piece}>
          <Piece piece={piece} />
        </span>
        <span className="choc-many">× {total}</span>
      </span>
    )
  }

  return (
    <span className="choc-run">
      {stacks.map((row, i) => (
        <span className={'choc-bar choc-bar--' + piece} key={i}>
          {row.map((part, j) => (
            <Piece piece={piece} part={part} key={j} />
          ))}
        </span>
      ))}
    </span>
  )
}

/**
 * One factor as a picture. A negative power stacks it over its denominator.
 *
 * Counting 440 rocks by eye is nobody's idea of a good time, so hovering a
 * term says what number it is.
 */
export function FactorCounters({ factor, perUnit, piece }) {
  const { coef } = factor
  // Word problems are all in x, so that is the only power a picture can carry.
  const power = factor.powers.x || 0
  // The number this picture stands for, for the hover.
  const label = factorText(factor)

  if (power < 0) {
    return (
      <span className="choc-frac" data-value={label} title={label}>
        <span className="choc-frac-top">
          <Pieces value={{ n: Math.abs(coef.n), d: 1 }} perUnit={perUnit} piece={piece} />
        </span>
        <span className="choc-frac-bot">
          {coef.d !== 1 && (
            <Pieces value={{ n: coef.d, d: 1 }} perUnit={perUnit} piece={piece} />
          )}
          <span className="eq-x">x</span>
          {power !== -1 && <sup className="eq-pow">{-power}</sup>}
        </span>
      </span>
    )
  }

  return (
    <span className="choc-term" data-value={label} title={label}>
      <Pieces value={{ n: Math.abs(coef.n), d: coef.d }} perUnit={perUnit} piece={piece} />
      {power > 0 && <span className="eq-x">x</span>}
      {power > 1 && <sup className="eq-pow">{power}</sup>}
    </span>
  )
}

// ---------------------------------------------------------------- board

function Solved({ value, onNext, nextLabel, onReset, canReset }) {
  return (
    <div className="panel">
      <p className="body-text">
        Solved! <span className="eq-x">x</span> ={' '}
        {value.d === 1 ? value.n : `${value.n}/${value.d}`}
      </p>
      <div className="menu">
        <button type="button" className="pixel-btn" onClick={onNext}>
          {nextLabel}
        </button>
        {canReset && (
          <button type="button" className="pixel-btn pixel-btn--alt" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Working that lands on the wrong number. There is no way past this but to go
 * back and try again - especially in a sandbox problem, where a wrong equation
 * solves perfectly well to a wrong answer.
 */
function WrongAnswer({ value, sandbox, onReset }) {
  return (
    <div className="panel wrong-panel">
      <p className="body-text">
        <span className="eq-x">x</span> = {ratText(value)} is not the right answer.
        Try again.
      </p>
      <p className="op-note">
        {sandbox
          ? 'Check the equation you wrote, then work it through once more.'
          : 'Check each step, then work it through once more.'}
      </p>
      <div className="menu">
        <button type="button" className="pixel-btn pixel-btn--alt" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- unit

export default function SolveThatEquation({ onBack, onComplete }) {
  const stages = useMemo(() => makeStages(), [])

  const [index, setIndex] = useState(0)
  const stage = stages[index]
  // `base` is what Reset goes back to. For sandbox stages that is the last
  // equation the student built, so resetting undoes their working, not their
  // equation.
  const [base, setBase] = useState(stages[0].eq)
  const [eq, setEq] = useState(stages[0].eq)
  const [typed, setTyped] = useState('')
  const [typeNote, setTypeNote] = useState('')

  const solved = eq ? solvedValue(eq) : null
  const correct = isCorrect(solved, stage.answer)
  const isLast = index === stages.length - 1
  const unlocked = stage.kind === 'bonus' && correct

  // Clearing the bonus problem is what earns the temple.
  useEffect(() => {
    if (unlocked) onComplete?.('stone')
  }, [unlocked, onComplete])

  function goNext() {
    const next = stages[index + 1]
    setIndex(index + 1)
    setBase(next.eq)
    setEq(next.eq)
    setTyped('')
    setTypeNote('')
  }

  function useTypedEquation() {
    const parsed = parseEquation(typed)
    if (!parsed) {
      setTypeNote('Try something like  2x + 1 = 11.  x/2 and 3x/2 work too.')
      return
    }
    // A new equation becomes the thing Reset returns to.
    setBase(parsed)
    setEq(parsed)
    setTypeNote('')
  }

  const problem = stage.problem
  const perUnit = problem ? problem.perUnit : 4
  const piece = problem ? problem.piece : 'chocolate'

  // A word problem is only ever shown as a picture; a plain equation is only
  // ever shown as numbers. Neither one offers a way to switch.
  const pictorial = !!problem
  const boardProps = {
    renderFactor: pictorial
      ? (factor) => <FactorCounters factor={factor} perUnit={perUnit} piece={piece} />
      : undefined,
    className: pictorial ? 'equation--counters' : '',
  }

  return (
    <div className="screen screen--list">
      <BackButton onBack={onBack} />

      <h2 className="heading">Solve that Equation!</h2>
      <p className="subtitle">{stage.label}</p>

      {problem && (
        <div className="panel word-panel">
          <p className="word-text">{problem.text}</p>
          {stage.kind === 'sandbox' && (
            <>
              <p className="op-hint">
                Write the equation yourself, then work it the same way as before.
              </p>
              <div className="op-row">
                <input
                  className="op-input op-input--wide"
                  value={typed}
                  // Only a reminder of the format. Solves to 5, which is
                  // deliberately nobody's answer.
                  placeholder="2x + 1 = 11"
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && useTypedEquation()}
                />
                <button type="button" className="pixel-btn" onClick={useTypedEquation}>
                  {eq ? 'Change it' : 'Use it'}
                </button>
              </div>
              {typeNote && <p className="op-note">{typeNote}</p>}
            </>
          )}
        </div>
      )}

      {eq && solved === null && (
        <EquationBoard
          eq={eq}
          setEq={setEq}
          canReset
          onReset={() => setEq(base)}
          {...boardProps}
        />
      )}

      {eq && solved !== null && !correct && (
        <WrongAnswer
          value={solved}
          sandbox={stage.kind === 'sandbox'}
          onReset={() => setEq(base)}
        />
      )}

      {eq && correct && (
        <>
          {unlocked && (
            <div className="panel unlock-panel">
              <span className="badge blink">TEMPLE UNLOCKED</span>
              <p className="body-text">
                The Stone Temple is open. Find it under Temples on the home screen.
              </p>
            </div>
          )}
          <Solved
            value={solved}
            nextLabel={isLast ? 'Finish unit' : 'Next'}
            onNext={isLast ? onBack : goNext}
            canReset
            onReset={() => setEq(base)}
          />
        </>
      )}
    </div>
  )
}
