/**
 * An equation plus the controls that act on it: pick an operation, type what
 * to do it with, and it happens to both sides at once. Shared by every unit
 * and by the temple consoles.
 */
import { useState } from 'react'
import EquationView from './EquationView.jsx'
import { applyOperation, parseOperand } from './equation.js'

const OPERATIONS = [
  { kind: 'add', symbol: '+', label: 'Add' },
  { kind: 'sub', symbol: '−', label: 'Subtract' },
  { kind: 'mul', symbol: '×', label: 'Multiply' },
  { kind: 'div', symbol: '÷', label: 'Divide' },
]

const DEFAULT_HINT =
  'Do the same thing to both sides. Drag terms to reorder them, and click a ' +
  'sign to work it out.'

export default function EquationBoard({
  eq, setEq, onReset, canReset, renderFactor, className, subst,
  hint = DEFAULT_HINT, placeholder = 'number',
}) {
  const [pending, setPending] = useState(null)
  const [operand, setOperand] = useState('')
  const [note, setNote] = useState('')

  function apply() {
    if (!pending) return setNote('Pick +, −, × or ÷ first')
    const value = parseOperand(operand)
    if (!value) return setNote(`Type a number or a letter, like 7 (or 3/4, or c)`)
    if (pending === 'div' && value.coef.n === 0) return setNote('You cannot divide by zero')
    setEq((prev) => applyOperation(prev, pending, value))
    setOperand('')
    setPending(null)
    setNote('')
  }

  return (
    <>
      <EquationView
        eq={eq}
        setEq={setEq}
        renderFactor={renderFactor}
        className={className}
        subst={subst}
      />

      <div className="panel op-panel">
        <p className="op-hint">{hint}</p>
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
            placeholder={pending ? placeholder : 'pick one'}
            onChange={(e) => setOperand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </div>
        <div className="op-row op-row--wide">
          <button type="button" className="pixel-btn op-apply" onClick={apply}>
            Do it to both sides
          </button>
          {canReset && (
            <button type="button" className="pixel-btn pixel-btn--alt op-reset" onClick={onReset}>
              Reset
            </button>
          )}
        </div>
        {note && <p className="op-note">{note}</p>}
      </div>
    </>
  )
}
