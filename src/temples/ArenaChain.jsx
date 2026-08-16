/**
 * The three slabs in the arena, and the chain that runs across them.
 *
 * The first sets the question and takes the final answer. The second is where
 * you plug the expression you worked out back into a second equation and solve
 * it for y. The third is blank until y exists, and then it is where y goes back
 * into your own expression to finish x off.
 *
 * None of them will do the algebra. The middle two hand you the board and the
 * terms; which term to move and what to do to both sides is still yours.
 */
import { useState } from 'react'
import EquationBoard from '../algebra/EquationBoard.jsx'
import { StaticSide, SUBST_TYPE } from '../algebra/EquationView.jsx'
import { partsOn } from './sandTemple.js'
import { Frac } from '../algebra/EquationView.jsx'

const Sym = ({ sym }) => <span className={'eq-x eq-sym--' + sym}>{sym}</span>

/** An empty socket on a slab, or the letter that has been set into it. */
function Socket({ letter }) {
  return letter ? <Sym sym={letter} /> : <span className="sand-socket">?</span>
}

function SlotTerm({ coef, letter }) {
  const numerator = (
    <>
      {coef.n !== 1 && <span className="eq-num">{coef.n}</span>}
      <Socket letter={letter} />
    </>
  )
  if (coef.d === 1) return numerator
  return (
    <span className="eq-num frac-wrap">
      <span className="frac">
        <span className="frac-top">{numerator}</span>
        <span className="frac-bot">{coef.d}</span>
      </span>
    </span>
  )
}

/** One of the generated equations, with its sockets empty or filled. */
export function SlabEquation({ spec, letters }) {
  const side = (which) => (
    <span className="eq-side">
      {partsOn(spec, which).map((p, i) => (
        <span className="eq-part" key={p.id}>
          {i > 0 && <span className="eq-op eq-op--flat">{p.sign}</span>}
          <span className="eq-group">
            {i === 0 && p.sign === '-' && <span className="eq-num">-</span>}
            {p.kind === 'const' ? (
              <Frac value={p.coef} />
            ) : (
              <SlotTerm coef={p.coef} letter={letters ? letters[p.slot] : null} />
            )}
          </span>
        </span>
      ))}
    </span>
  )
  return (
    <div className="equation equation--static equation--slab">
      {side('left')}
      <span className="eq-equals">=</span>
      {side('right')}
    </div>
  )
}

/** A finished line, held above the board because the next step needs it. */
export function Carried({ sym, side, live }) {
  return (
    <div
      className={'equation equation--static chain-float' + (live ? ' chain-float--live' : '')}
      draggable={live}
      title={live ? 'Drag this onto the letter it replaces' : undefined}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData(SUBST_TYPE, sym)
        e.dataTransfer.setData('text/plain', sym) // Firefox needs plain text too
      }}
    >
      <Sym sym={sym} />
      <span className="eq-equals">=</span>
      <StaticSide side={side} />
    </div>
  )
}

// ---------------------------------------------------------------- slab one

/**
 * Sets the question, and is the only thing in the arena that will hear an
 * answer. It does not say whether you were close, only whether you were right,
 * and being wrong is expensive.
 */
export function SlabOne({ puzzle, seated, carrying, onSeat, onAnswer, note }) {
  const [text, setText] = useState('')

  if (!seated) {
    return (
      <div className="panel slab-panel">
        <SlabEquation spec={puzzle.first} letters={null} />
        <p className="op-hint">
          Two sockets, and one tablet with both letters on it.
        </p>
        {carrying ? (
          <div className="menu">
            <button type="button" className="pixel-btn" onClick={onSeat}>
              Set the tablet in
            </button>
          </div>
        ) : (
          <p className="op-note">The eye was holding something. Go and get it.</p>
        )}
      </div>
    )
  }

  return (
    <div className="panel slab-panel">
      <SlabEquation spec={puzzle.first} letters={puzzle.letters} />
      <p className="body-text">
        Find <Sym sym="x" /> in terms of <Sym sym="y" />.
      </p>
      <p className="op-note">
        The slab will not work it out for you. Do it on paper, then use the
        other two.
      </p>

      <p className="sphinx-line">What is the ACTUAL value of x?</p>
      <div className="op-row">
        <input
          className="op-input op-input--wide"
          value={text}
          aria-label="The value of x"
          placeholder="a number"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAnswer(text)}
        />
      </div>
      <div className="op-row op-row--wide">
        <button type="button" className="pixel-btn" onClick={() => onAnswer(text)}>
          Answer
        </button>
      </div>
      {note && <p className="op-note">{note}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- slab two

/** Plug your expression for x into the second equation, then solve for y. */
export function SlabTwo({ puzzle, seated, xSide, eq, setEq, plugged, onPlug, onReset, solved }) {
  if (!seated) {
    return (
      <div className="panel slab-panel">
        <SlabEquation spec={puzzle.second} letters={null} />
        <p className="op-note">Nothing to put in it yet.</p>
      </div>
    )
  }
  if (solved) {
    return (
      <div className="panel slab-panel">
        <Carried sym="y" side={solved} />
        <p className="body-text">
          That is <Sym sym="y" />. The third slab wants it.
        </p>
      </div>
    )
  }

  return (
    <div className="panel slab-panel">
      <Carried sym="x" side={xSide} live={!plugged} />
      <EquationBoard
        eq={eq}
        setEq={setEq}
        canReset
        onReset={onReset}
        subst={plugged ? null : { sym: 'x', onDrop: onPlug }}
        hint={
          plugged
            ? 'Now get y on its own. Drag terms to reorder them, and click a sign to work it out.'
            : 'Drag the line above onto the x below it.'
        }
      />
    </div>
  )
}

// -------------------------------------------------------------- slab three

/** Blank until y exists. Then y goes into your own expression to finish x. */
export function SlabThree({ ySide, eq, setEq, plugged, onPlug, onReset, solved }) {
  if (!ySide) {
    return (
      <div className="panel slab-panel">
        <div className="equation equation--static equation--slab">
          <span className="sand-socket">blank</span>
        </div>
        <p className="op-note">Nothing is carved on this one.</p>
      </div>
    )
  }
  if (solved) {
    return (
      <div className="panel slab-panel">
        <Carried sym="x" side={solved} />
        <p className="body-text">
          That is <Sym sym="x" />. Take it to the first slab.
        </p>
      </div>
    )
  }

  return (
    <div className="panel slab-panel">
      <Carried sym="y" side={ySide} live={!plugged} />
      <EquationBoard
        eq={eq}
        setEq={setEq}
        canReset
        onReset={onReset}
        subst={plugged ? null : { sym: 'y', onDrop: onPlug }}
        hint={
          plugged
            ? 'Now work x out. Click a sign to do the arithmetic.'
            : 'Drag the value of y onto the y in your own equation.'
        }
      />
    </div>
  )
}
