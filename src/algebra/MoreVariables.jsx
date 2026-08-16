/**
 * "More Variables".
 *
 * Four kinds of stage, because the unit teaches four different things:
 *  - `solve`     the usual board, but isolating a named letter rather than x
 *  - `interrupt` an ordinary solve that a second letter lands in the middle of
 *  - `typed`     no buttons at all - work it out on paper and write it down
 *  - `chain`     solved equations stack up and get dropped into the next one
 */
import { useEffect, useMemo, useState } from 'react'
import BackButton from '../BackButton.jsx'
import EquationBoard from './EquationBoard.jsx'
import { StaticEquation, StaticSide, SUBST_TYPE } from './EquationView.jsx'
import {
  canonEq, canonical, parseSide, solutionSide, solvedExpr, substitute,
} from './equation.js'
import { moreVariableStages } from './moreVariables.js'

/** How long the 10y takes to fall. Matches the eq-drop animation in App.css. */
const DROP_MS = 1100

const Sym = ({ sym }) => <span className={'eq-x eq-sym--' + sym}>{sym}</span>

/** What the stage is asking for. Keyed on the text so a new one animates in. */
function Prompt({ text }) {
  return (
    <div className="panel prompt-panel" key={text}>
      <p className="body-text">{text}</p>
    </div>
  )
}

function Solved({ sym, side, onNext, nextLabel, onReset }) {
  return (
    <div className="panel">
      <p className="body-text">Solved!</p>
      <div className="equation equation--static">
        <Sym sym={sym} />
        <span className="eq-equals">=</span>
        <StaticSide side={side} />
      </div>
      <div className="menu">
        <button type="button" className="pixel-btn" onClick={onNext}>
          {nextLabel}
        </button>
        {onReset && (
          <button type="button" className="pixel-btn pixel-btn--alt" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Working that isolates the right letter but lands on the wrong expression.
 * There is no way past this but to go back and try again.
 */
function Wrong({ sym, side, onReset }) {
  return (
    <div className="panel wrong-panel">
      <p className="body-text">That is not the right answer.</p>
      <div className="equation equation--static">
        <Sym sym={sym} />
        <span className="eq-equals">=</span>
        <StaticSide side={side} />
      </div>
      <p className="op-note">Check each step, then work it through once more.</p>
      <div className="menu">
        <button type="button" className="pixel-btn pixel-btn--alt" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  )
}

/**
 * The board plus the three things that can be true about it: still working,
 * finished on the wrong answer, or finished on the right one. Every stage kind
 * that has a board goes through here.
 */
function Working({ eq, setEq, spec, onReset, onNext, nextLabel, subst, extra }) {
  const solved = subst ? null : solvedExpr(eq, spec.target)
  const side = solved ? solutionSide(eq, spec.target) : null
  const correct = solved && canonEq(solved, spec.answer)

  if (solved && correct) {
    return <Solved sym={spec.target} side={side} onNext={onNext} nextLabel={nextLabel} onReset={onReset} />
  }
  if (solved) return <Wrong sym={spec.target} side={side} onReset={onReset} />

  return (
    <EquationBoard eq={eq} setEq={setEq} canReset onReset={onReset} subst={subst} hint={extra} />
  )
}

const HINT =
  'Do the same thing to both sides. Drag terms to reorder them, and click a ' +
  'sign to work it out.'

// ---------------------------------------------------------------- solve

function SolveStage({ stage, onNext, nextLabel }) {
  const [eq, setEq] = useState(stage.eq)
  return (
    <>
      <Prompt text={stage.prompt} />
      <Working
        eq={eq}
        setEq={setEq}
        spec={stage}
        onReset={() => setEq(stage.eq)}
        onNext={onNext}
        nextLabel={nextLabel}
        extra={HINT}
      />
    </>
  )
}

// ---------------------------------------------------------------- interrupt

/**
 * 3x/4 - 5 = 1 solves to x = 8 like any other. The moment it does, a 10y falls
 * in from the top of the screen, lands between the x and the =, and the
 * question quietly becomes a harder one.
 */
function InterruptStage({ stage, onNext, nextLabel }) {
  const [phase, setPhase] = useState('first') // first | dropping | after
  const [eq, setEq] = useState(stage.eq)

  const reached =
    phase === 'first' &&
    canonEq(solvedExpr(eq, stage.trigger.target), stage.trigger.answer)

  // Starting the fall and landing it have to be separate: moving to `dropping`
  // makes `reached` false again, so a single effect would tear down its own
  // timer the moment it set it, and the term would hang in mid-air.
  useEffect(() => {
    if (reached) setPhase('dropping')
  }, [reached])

  useEffect(() => {
    if (phase !== 'dropping') return
    const timer = setTimeout(() => {
      setPhase('after')
      setEq(stage.after.eq)
    }, DROP_MS)
    return () => clearTimeout(timer)
  }, [phase, stage])

  if (phase === 'dropping') {
    return (
      <>
        <Prompt text={stage.prompt} />
        <div className="equation equation--static">
          <span className="eq-side">
            <span className="eq-group">
              <Sym sym="x" />
            </span>
            <span className="eq-group eq-drop">
              <span className="eq-op eq-op--flat">+</span>
              <span className="eq-num">10</span>
              <Sym sym="y" />
            </span>
          </span>
          <span className="eq-equals">=</span>
          <span className="eq-side">
            <span className="eq-group">
              <span className="eq-num">8</span>
            </span>
          </span>
        </div>
      </>
    )
  }

  const spec = phase === 'after' ? stage.after : stage
  return (
    <>
      <Prompt text={spec.prompt} />
      <Working
        eq={eq}
        setEq={setEq}
        spec={phase === 'after' ? stage.after : stage.trigger}
        onReset={() => setEq(spec.eq || stage.eq)}
        onNext={onNext}
        nextLabel={nextLabel}
        extra={HINT}
      />
    </>
  )
}

// ---------------------------------------------------------------- typed

/** No buttons. Work it out on paper and write the answer down. */
function TypedStage({ stage, onNext, nextLabel }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [side, setSide] = useState(null)

  function check() {
    // "x = 77/3 - 28y/27" and "77/3 - 28y/27" are both fine to write.
    const body = text.includes('=') ? text.split('=').pop() : text
    const parsed = parseSide(body)
    if (!parsed) {
      setNote(`Write it out like  ${stage.placeholder}`)
      return
    }
    if (!canonEq(canonical(parsed), stage.answer)) {
      setNote('Not quite. Work it through again on paper.')
      return
    }
    setNote('')
    setSide(parsed)
  }

  if (side) {
    return (
      <>
        <Prompt text={stage.prompt} />
        <StaticEquation eq={stage.eq} />
        <Solved sym={stage.target} side={side} onNext={onNext} nextLabel={nextLabel} />
      </>
    )
  }

  return (
    <>
      <Prompt text={stage.prompt} />
      <StaticEquation eq={stage.eq} />
      <div className="panel op-panel">
        <p className="op-hint">
          There are no buttons for this one. Work it out on paper, then write
          down what <Sym sym={stage.target} /> comes to.
        </p>
        <div className="op-row">
          <span className="eq-x eq-sym--x by-hand-lhs">{stage.target} =</span>
          <input
            className="op-input op-input--wide"
            value={text}
            placeholder={stage.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
        </div>
        <div className="op-row op-row--wide">
          <button type="button" className="pixel-btn" onClick={check}>
            Check it
          </button>
        </div>
        {note && <p className="op-note">{note}</p>}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- chain

/** A finished equation, kept on screen because the next step needs it. */
function ChainFloat({ sym, side, live }) {
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

/**
 * Solve, then carry the answer forward. Each finished equation floats up the
 * page and stays there, because the step below it is about to need it.
 */
function ChainStage({ stage, onNext, nextLabel }) {
  const [step, setStep] = useState(0)
  const [eq, setEq] = useState(stage.steps[0].eq)
  const [done, setDone] = useState([]) // { sym, side } per finished step
  const [plugged, setPlugged] = useState(!stage.steps[0].substitute)

  const current = stage.steps[step]
  const source = done.length ? done[done.length - 1] : null
  const waiting = !!current.substitute && !plugged
  const last = step === stage.steps.length - 1

  function reset() {
    setEq(current.eq)
    setPlugged(!current.substitute)
  }

  function advance() {
    const side = solutionSide(eq, current.target)
    if (last) return onNext()
    const next = stage.steps[step + 1]
    setDone((d) => [...d, { sym: current.target, side }])
    setStep(step + 1)
    setEq(next.eq)
    setPlugged(!next.substitute)
  }

  const subst = waiting && source
    ? {
        sym: current.substitute,
        onDrop: (sideKey, groupIndex) => {
          setEq((prev) => ({
            ...prev,
            [sideKey]: substitute(prev[sideKey], groupIndex, current.substitute, source.side),
          }))
          setPlugged(true)
        },
      }
    : null

  return (
    <>
      {done.map((d, i) => (
        <ChainFloat
          key={i}
          sym={d.sym}
          side={d.side}
          live={waiting && i === done.length - 1}
        />
      ))}

      <Prompt text={current.prompt} />

      <Working
        eq={eq}
        setEq={setEq}
        spec={current}
        subst={subst}
        onReset={reset}
        onNext={advance}
        nextLabel={last ? nextLabel : 'Next'}
        extra={
          waiting
            ? `Drag the equation above onto the ${current.substitute} below.`
            : HINT
        }
      />
    </>
  )
}

// ---------------------------------------------------------------- unit

const STAGE_KINDS = {
  solve: SolveStage,
  interrupt: InterruptStage,
  typed: TypedStage,
  chain: ChainStage,
}

export default function MoreVariables({ onBack, onComplete }) {
  const stages = useMemo(moreVariableStages, [])
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const stage = stages[index]
  const isLast = index === stages.length - 1
  const Stage = STAGE_KINDS[stage.kind]

  // Getting to the end of the bonus chain is what opens the Sand Temple.
  useEffect(() => {
    if (finished) onComplete?.('sand')
  }, [finished, onComplete])

  if (finished) {
    return (
      <div className="screen screen--list">
        <BackButton onBack={onBack} />
        <h2 className="heading">More Variables</h2>

        <div className="panel unlock-panel">
          <span className="badge blink">TEMPLE UNLOCKED</span>
          <p className="body-text">
            The Sand Temple is open. Find it under Temples on the home screen.
          </p>
        </div>

        <div className="menu">
          <button type="button" className="pixel-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen screen--list">
      <BackButton onBack={onBack} />

      <h2 className="heading">More Variables</h2>
      <p className="subtitle">{stage.label}</p>

      <Stage
        // A new stage is a fresh start, never the last one with new props.
        key={index}
        stage={stage}
        nextLabel={isLast ? 'Finish unit' : 'Next'}
        onNext={isLast ? () => setFinished(true) : () => setIndex(index + 1)}
      />
    </div>
  )
}
