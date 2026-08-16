/**
 * The equation as the student handles it: terms that drag, signs that can be
 * clicked to work them out. The unit and the temple both show equations this
 * way, so it lives here rather than inside either one.
 */
import { Fragment, useState } from 'react'
import {
  canCombineFactors, canCombineGroups, canDrag, combineFactors, combineGroups,
  moveGroup, rIsOne,
} from './equation.js'

/** A rational, stacked as a real fraction when it has a denominator. */
export function Frac({ value, className = 'eq-num' }) {
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
export function FactorView({ factor }) {
  const { coef, power } = factor

  // A negative power drops x under the line: 4/3 x^-1 is drawn as 4 over 3x.
  if (power < 0) {
    return (
      <span className="eq-num frac-wrap">
        {coef.n < 0 && <span className="frac-sign">-</span>}
        <span className="frac">
          <span className="frac-top">{Math.abs(coef.n)}</span>
          <span className="frac-bot">
            {coef.d !== 1 && coef.d}
            <span className="eq-x">x</span>
            {power !== -1 && <sup className="eq-pow">{-power}</sup>}
          </span>
        </span>
      </span>
    )
  }

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

function SideView({
  side, sideKey, onGroupOp, onFactorOp, drag, setDrag, onMove, renderFactor,
}) {
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
                {renderFactor ? renderFactor(factor) : <FactorView factor={factor} />}
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

/**
 * Both sides of an equation, live. `setEq` takes an updater, like useState.
 *
 * `renderFactor` swaps out how each number is drawn without touching any of
 * the dragging or the clickable signs, which is how the word problems show
 * chocolate and baseballs instead of numerals and still work the same way.
 */
export default function EquationView({ eq, setEq, className = '', renderFactor }) {
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

  return (
    <div className={'equation ' + className}>
      <SideView side={eq.left} sideKey="left" renderFactor={renderFactor} {...shared} />
      <span className="eq-equals">=</span>
      <SideView side={eq.right} sideKey="right" renderFactor={renderFactor} {...shared} />
    </div>
  )
}
