import { Fragment, useMemo, useState } from 'react'
import BackButton from '../BackButton.jsx'
import {
  applyOperation, canCombineFactors, canCombineGroups, canDrag, combineFactors,
  combineGroups, makePuzzles, moveGroup, parseEquation, parseOperand, ratText,
  rIsOne, rSign, solvedValue, WORD_PROBLEMS,
} from './equation.js'

const OPERATIONS = [
  { kind: 'add', symbol: '+', label: 'Add' },
  { kind: 'sub', symbol: '−', label: 'Subtract' },
  { kind: 'mul', symbol: '×', label: 'Multiply' },
  { kind: 'div', symbol: '÷', label: 'Divide' },
]

/** A rational, stacked as a real fraction when it has a denominator. */
function Frac({ value, className = 'eq-num' }) {
  if (value.d === 1) return <span className={className}>{value.n}</span>
  return (
    <span className={className + ' frac-wrap'}>
      {value.n < 0 && <span className="frac-sign">-</span>}
      <span className="frac">
        <span className="frac-top">{Math.abs(value.n)}</span>
        <span className="frac-bot">{value.d}</span>
      </span>
    </span>
  )
}

/** A factor: numbers stay grey, the x is red and bold, powers superscript. */
function FactorView({ factor }) {
  const { coef, power } = factor
  if (power === 0) return <Frac value={coef} />
  const negativeOne = coef.n === -1 && coef.d === 1
  return (
    <>
      {negativeOne && <span className="eq-num">-</span>}
      {!rIsOne(coef) && !negativeOne && <Frac value={coef} />}
      <span className="eq-x">x</span>
      {power !== 1 && <sup className="eq-pow">{power}</sup>}
    </>
  )
}

function SideView({ side, sideKey, onGroupOp, onFactorOp, drag, setDrag, onMove }) {
  const draggable = canDrag(side)
  return (
    <span className="eq-side">
      {side.map((group, i) => (
        <Fragment key={group.id}>
          {i > 0 && (
            <button
              type="button"
              className={'eq-op' + (canCombineGroups(side, i) ? ' eq-op--live' : '')}
              title={
                canCombineGroups(side, i)
                  ? 'Click to work this out'
                  : 'These terms cannot be combined'
              }
              onClick={() => onGroupOp(sideKey, i)}
            >
              {group.sign}
            </button>
          )}
          <span
            className={
              'eq-group' +
              (draggable ? ' eq-group--draggable' : '') +
              (drag && drag.side === sideKey && drag.index === i ? ' eq-group--dragging' : '')
            }
            draggable={draggable}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(i)) // Firefox needs data
              setDrag({ side: sideKey, index: i })
            }}
            onDragEnd={() => setDrag(null)}
            onDragOver={(e) => {
              if (drag && drag.side === sideKey && drag.index !== i) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (drag && drag.side === sideKey) onMove(sideKey, drag.index, i)
              setDrag(null)
            }}
          >
            {i === 0 && group.sign === '-' && <span className="eq-num">-</span>}
            {group.factors.map((factor, j) => (
              <Fragment key={factor.id}>
                {j > 0 && (
                  <button
                    type="button"
                    className={'eq-op' + (canCombineFactors(group, j - 1) ? ' eq-op--live' : '')}
                    title={
                      canCombineFactors(group, j - 1)
                        ? 'Click to work this out'
                        : 'This cannot be worked out'
                    }
                    onClick={() => onFactorOp(sideKey, i, j - 1)}
                  >
                    {group.ops[j - 1]}
                  </button>
                )}
                <FactorView factor={factor} />
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------- chocolate

/** One bar, drawn as `pieces` chocolate squares. */
function Bar({ pieces }) {
  return (
    <span className="choc-bar">
      {Array.from({ length: pieces }, (_, i) => (
        <span className="choc-piece" key={i} />
      ))}
    </span>
  )
}

/** A whole number of pieces, split into full bars plus whatever is left over. */
function Pieces({ count, perUnit }) {
  const full = Math.floor(count / perUnit)
  const rest = count % perUnit
  return (
    <span className="choc-run">
      {Array.from({ length: full }, (_, i) => (
        <Bar pieces={perUnit} key={i} />
      ))}
      {rest > 0 && <Bar pieces={rest} key="rest" />}
      {count === 0 && <span className="eq-num">0</span>}
    </span>
  )
}

/** A term as chocolate. Anything not a whole count falls back to plain text. */
function GroupChocolate({ group, perUnit }) {
  if (group.factors.length !== 1) {
    return <span className="eq-num">{group.factors.map((f) => ratText(f.coef)).join(' … ')}</span>
  }
  const { coef, power } = group.factors[0]
  if (coef.d !== 1 || power > 1) {
    return <span className="eq-num">{ratText(coef)}</span>
  }
  return (
    <span className="choc-term">
      <Pieces count={Math.abs(coef.n)} perUnit={perUnit} />
      {power === 1 && <span className="eq-x">x</span>}
    </span>
  )
}

function ChocolateEquation({ eq, perUnit }) {
  const renderSide = (side) =>
    side.map((group, i) => (
      <Fragment key={group.id}>
        {i > 0 && <span className="choc-op">{group.sign}</span>}
        {i === 0 && group.sign === '-' && <span className="choc-op">-</span>}
        <GroupChocolate group={group} perUnit={perUnit} />
      </Fragment>
    ))
  return (
    <div className="choc-board">
      <div className="choc-side">{renderSide(eq.left)}</div>
      <div className="choc-equals">=</div>
      <div className="choc-side">{renderSide(eq.right)}</div>
    </div>
  )
}

// ---------------------------------------------------------------- board

/** The equation plus its operation controls - shared by every stage. */
function EquationBoard({ eq, setEq }) {
  const [pending, setPending] = useState(null)
  const [operand, setOperand] = useState('')
  const [note, setNote] = useState('')
  const [drag, setDrag] = useState(null)

  const shared = {
    drag,
    setDrag,
    onGroupOp: (sideKey, i) =>
      setEq((prev) => ({ ...prev, [sideKey]: combineGroups(prev[sideKey], i) })),
    onFactorOp: (sideKey, gi, fi) =>
      setEq((prev) => ({
        ...prev,
        [sideKey]: prev[sideKey].map((g, k) => (k === gi ? combineFactors(g, fi) : g)),
      })),
    onMove: (sideKey, from, to) =>
      setEq((prev) => ({ ...prev, [sideKey]: moveGroup(prev[sideKey], from, to) })),
  }

  function apply() {
    if (!pending) return setNote('Pick +, −, × or ÷ first')
    const value = parseOperand(operand)
    if (!value) return setNote('Type a number, like 7 (or 3/4, or x)')
    if (pending === 'div' && value.coef.n === 0) return setNote('You cannot divide by zero')
    setEq((prev) => applyOperation(prev, pending, value))
    setOperand('')
    setPending(null)
    setNote('')
  }

  return (
    <>
      <div className="equation">
        <SideView side={eq.left} sideKey="left" {...shared} />
        <span className="eq-equals">=</span>
        <SideView side={eq.right} sideKey="right" {...shared} />
      </div>

      <div className="panel op-panel">
        <p className="op-hint">
          Do the same thing to both sides. Drag terms to reorder them, and click a
          sign to work it out.
        </p>
        <div className="op-row">
          {OPERATIONS.map((op) => (
            <button
              type="button"
              key={op.kind}
              className={'op-btn' + (pending === op.kind ? ' op-btn--on' : '')}
              title={op.label}
              onClick={() => {
                setPending(op.kind)
                setNote('')
              }}
            >
              {op.symbol}
            </button>
          ))}
          <input
            className="op-input"
            value={operand}
            placeholder={pending ? 'number' : 'pick one'}
            onChange={(e) => setOperand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </div>
        <button type="button" className="pixel-btn op-apply" onClick={apply}>
          Do it to both sides
        </button>
        {note && <p className="op-note">{note}</p>}
      </div>
    </>
  )
}

function Solved({ value, onNext, nextLabel }) {
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
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- unit

export default function SolveThatEquation({ onBack }) {
  const stages = useMemo(() => {
    const puzzles = makePuzzles()
    return [
      ...puzzles.map((p, i) => ({
        kind: 'equation',
        label: `Equation ${i + 1} of ${puzzles.length}`,
        eq: p.eq,
      })),
      { kind: 'word', label: 'Word problem', problem: WORD_PROBLEMS[0] },
      { kind: 'sandbox', label: 'Sandbox' },
    ]
  }, [])

  const [index, setIndex] = useState(0)
  const stage = stages[index]
  const [eq, setEq] = useState(stages[0].eq)
  const [showChocolate, setShowChocolate] = useState(false)
  const [typed, setTyped] = useState('')
  const [typeNote, setTypeNote] = useState('')

  const solved = eq ? solvedValue(eq) : null
  const isLast = index === stages.length - 1

  function goNext() {
    const next = index + 1
    setIndex(next)
    // Sandbox starts empty: the student writes the equation themselves
    setEq(stages[next].kind === 'sandbox' ? null : stages[next].eq ?? stages[next].problem.equation())
    setShowChocolate(false)
    setTyped('')
    setTypeNote('')
  }

  function useTypedEquation() {
    const parsed = parseEquation(typed)
    if (!parsed) {
      setTypeNote('Try something like  4x - 7 = 20')
      return
    }
    setEq(parsed)
    setTypeNote('')
    setShowChocolate(true) // the numbers become chocolate straight away
  }

  const perUnit = stage.kind === 'word' ? stage.problem.perUnit : 4

  return (
    <div className="screen screen--list">
      <BackButton onBack={onBack} />

      <h2 className="heading">Solve that Equation!</h2>
      <p className="subtitle">{stage.label}</p>

      {stage.kind === 'word' && (
        <div className="panel word-panel">
          <p className="word-text">{stage.problem.text}</p>
          <button
            type="button"
            className="pixel-btn pixel-btn--alt"
            onClick={() => setShowChocolate((v) => !v)}
          >
            {showChocolate ? 'Hide chocolate' : 'Visualize'}
          </button>
        </div>
      )}

      {stage.kind === 'sandbox' && (
        <div className="panel word-panel">
          <p className="word-text">
            Sandbox. Write your own equation, then work it the same way. This is how
            the next word problems will be done - you build the equation yourself.
          </p>
          <div className="op-row">
            <input
              className="op-input op-input--wide"
              value={typed}
              placeholder="4x - 7 = 20"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && useTypedEquation()}
            />
            <button type="button" className="pixel-btn" onClick={useTypedEquation}>
              Use it
            </button>
          </div>
          {typeNote && <p className="op-note">{typeNote}</p>}
          {eq && (
            <button
              type="button"
              className="pixel-btn pixel-btn--alt"
              onClick={() => setShowChocolate((v) => !v)}
            >
              {showChocolate ? 'Hide chocolate' : 'Visualize'}
            </button>
          )}
        </div>
      )}

      {eq && showChocolate && <ChocolateEquation eq={eq} perUnit={perUnit} />}

      {eq && solved === null && <EquationBoard eq={eq} setEq={setEq} />}

      {eq && solved !== null && (
        <Solved
          value={solved}
          nextLabel={isLast ? 'Finish unit' : 'Next'}
          onNext={isLast ? onBack : goNext}
        />
      )}
    </div>
  )
}
