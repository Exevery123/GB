/**
 * The equation as the student handles it: terms that drag, signs that can be
 * clicked to work them out. Every unit and the temple all show equations this
 * way, so it lives here rather than inside any one of them.
 *
 * A side can hold brackets, and a bracket holds a side, so SideView calls
 * itself. Rather than pass a path down through the nesting, each level is
 * handed a `mutate` that knows how to write back to its own slice of the
 * equation - the top level writes to eq.left or eq.right, and a bracket writes
 * into the factor that holds it.
 */
import { Fragment, useState } from 'react'
import {
  canCombineFactors, canCombineGroups, canDrag, combineFactors, combineGroups,
  factorParts, isParen, moveGroup, openParens, substitutionSpots,
} from './equation.js'

/** The drag type that marks a solved equation being dropped onto a letter. */
export const SUBST_TYPE = 'text/mathcraft-subst'

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

/**
 * One letter with its power. Each letter carries its own colour, and the power
 * sits inside the letter's span so it is coloured to match.
 */
export function SymView({ sym, power }) {
  return (
    <span className={'eq-x eq-sym--' + sym}>
      {sym}
      {Math.abs(power) !== 1 && <sup className="eq-pow">{Math.abs(power)}</sup>}
    </span>
  )
}

/**
 * Half of a factor - everything above the line, or everything below it. The
 * leading 1 is dropped when there are letters to carry the term, so a factor
 * reads as `x` and `ce` rather than `1x` and `1ce`.
 */
function Half({ n, syms, powers }) {
  return (
    <>
      {(n !== 1 || syms.length === 0) && <span className="eq-num">{n}</span>}
      {syms.map((s) => (
        <SymView key={s} sym={s} power={powers[s]} />
      ))}
    </>
  )
}

/**
 * A plain factor: numbers stay grey, letters take their own colour, powers go
 * up. Anything with a denominator - a fraction, or a letter with a negative
 * power - is drawn stacked, so `a/c` is one thing on the page rather than two.
 */
export function FactorView({ factor }) {
  const p = factorParts(factor)
  const { powers } = factor

  if (!p.stacked) {
    return (
      <>
        {p.negative && <span className="eq-num">-</span>}
        <Half n={p.topNum} syms={p.top} powers={powers} />
      </>
    )
  }

  return (
    <span className="eq-num frac-wrap">
      {p.negative && <span className="frac-sign">-</span>}
      <span className="frac">
        <span className="frac-top">
          <Half n={p.topNum} syms={p.top} powers={powers} />
        </span>
        <span className="frac-bot">
          <Half n={p.botNum} syms={p.bot} powers={powers} />
        </span>
      </span>
    </span>
  )
}

/**
 * The same thing to look at, with nothing to click - for an equation that has
 * been finished with, or one being carried around to drop somewhere else.
 */
export function StaticSide({ side }) {
  return (
    <span className="eq-side">
      {side.map((group, i) => (
        <Fragment key={group.id}>
          {i > 0 && <span className="eq-op eq-op--flat">{group.sign}</span>}
          <span className="eq-group">
            {i === 0 && group.sign === '-' && <span className="eq-num">-</span>}
            {group.factors.map((factor, j) => (
              <Fragment key={factor.id}>
                {j > 0 && <span className="eq-op eq-op--flat">{group.ops[j - 1]}</span>}
                {isParen(factor) ? (
                  <span className="eq-paren">
                    <span className="eq-bracket">(</span>
                    <StaticSide side={factor.paren} />
                    <span className="eq-bracket">)</span>
                  </span>
                ) : (
                  <FactorView factor={factor} />
                )}
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

export function StaticEquation({ eq, className = '' }) {
  return (
    <div className={'equation equation--static ' + className}>
      <StaticSide side={eq.left} />
      <span className="eq-equals">=</span>
      <StaticSide side={eq.right} />
    </div>
  )
}

function SideView({ side, scope, mutate, drag, setDrag, renderFactor, subst }) {
  const draggable = canDrag(side)
  // Which terms a solved equation could be dropped onto. Only the outermost
  // side offers them: substitution is never asked for inside a bracket.
  const spots = subst ? substitutionSpots(side, subst.sym) : []

  return (
    <span className="eq-side">
      {side.map((group, i) => {
        const isSpot = spots.some((s) => s.group === i)
        return (
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
                onClick={() => mutate((s) => combineGroups(s, i))}
              >
                {group.sign}
              </button>
            )}
            <span
              className={
                'eq-group' +
                (draggable ? ' eq-group--draggable' : '') +
                (isSpot ? ' eq-group--spot' : '') +
                (drag && drag.scope === scope && drag.index === i ? ' eq-group--dragging' : '')
              }
              draggable={draggable}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i)) // Firefox needs data
                setDrag({ scope, index: i })
              }}
              onDragEnd={() => setDrag(null)}
              onDragOver={(e) => {
                // Reordering wins when a term is in flight; otherwise this may
                // be a solved equation looking for a letter to land on.
                if (drag) {
                  if (drag.scope === scope && drag.index !== i) e.preventDefault()
                } else if (isSpot && e.dataTransfer.types.includes(SUBST_TYPE)) {
                  e.dataTransfer.dropEffect = 'copy'
                  e.preventDefault()
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (drag) {
                  if (drag.scope === scope) mutate((s) => moveGroup(s, drag.index, i))
                  setDrag(null)
                } else if (isSpot) subst.onDrop(i)
              }}
            >
              {i === 0 && group.sign === '-' && <span className="eq-num">-</span>}
              {group.factors.map((factor, j) => (
                <Fragment key={factor.id}>
                  {j > 0 && (
                    <button
                      type="button"
                      className={
                        'eq-op' + (canCombineFactors(group, j - 1) ? ' eq-op--live' : '')
                      }
                      title={
                        canCombineFactors(group, j - 1)
                          ? 'Click to work this out'
                          : 'This cannot be worked out'
                      }
                      onClick={() =>
                        mutate((s) =>
                          s.map((g, k) => (k === i ? combineFactors(g, j - 1) : g)),
                        )
                      }
                    >
                      {group.ops[j - 1]}
                    </button>
                  )}
                  {isParen(factor) ? (
                    <span className="eq-paren">
                      <span className="eq-bracket">(</span>
                      <SideView
                        side={factor.paren}
                        scope={`${scope}.${i}.${j}`}
                        // Write back into this bracket's own factor.
                        mutate={(fn) =>
                          mutate((s) =>
                            s.map((g, k) =>
                              k !== i
                                ? g
                                : {
                                    ...g,
                                    factors: g.factors.map((f, m) =>
                                      m !== j ? f : { ...f, paren: fn(f.paren) },
                                    ),
                                  },
                            ),
                          )
                        }
                        drag={drag}
                        setDrag={setDrag}
                        renderFactor={renderFactor}
                      />
                      <span className="eq-bracket">)</span>
                    </span>
                  ) : renderFactor ? (
                    renderFactor(factor)
                  ) : (
                    <FactorView factor={factor} />
                  )}
                </Fragment>
              ))}
            </span>
          </Fragment>
        )
      })}
    </span>
  )
}

/**
 * Both sides of an equation, live. `setEq` takes an updater, like useState.
 *
 * `renderFactor` swaps out how each number is drawn without touching any of
 * the dragging or the clickable signs, which is how the word problems show
 * chocolate and baseballs instead of numerals and still work the same way.
 *
 * `subst` turns on substitution: `{ sym, onDrop(sideKey, groupIndex) }`, where
 * every term holding that letter becomes a place a solved equation can land.
 */
export default function EquationView({ eq, setEq, className = '', renderFactor, subst }) {
  const [drag, setDrag] = useState(null)

  // A bracket left holding nothing opens itself, so that is checked after
  // every edit rather than being something the student has to ask for.
  const sideProps = (sideKey) => ({
    side: eq[sideKey],
    scope: sideKey,
    mutate: (fn) =>
      setEq((prev) => ({ ...prev, [sideKey]: openParens(fn(prev[sideKey])) })),
    drag,
    setDrag,
    renderFactor,
    subst: subst && { sym: subst.sym, onDrop: (i) => subst.onDrop(sideKey, i) },
  })

  return (
    <div className={'equation ' + className}>
      <SideView {...sideProps('left')} />
      <span className="eq-equals">=</span>
      <SideView {...sideProps('right')} />
    </div>
  )
}
