import { useCallback, useRef, useState } from 'react'
import './App.css'
import BackButton from './BackButton.jsx'
import MoreVariables from './algebra/MoreVariables.jsx'
import SolveThatEquation from './algebra/SolveThatEquation.jsx'
import SandTemple from './temples/SandTemple.jsx'
import StoneTemple from './temples/StoneTemple.jsx'
import { applyCode, grantReward, hardWrite, loadSave, persist } from './save.js'

/** Units that have real content, keyed by their name on the Algebra screen. */
const UNIT_SCREENS = {
  'Solve that Equation!': SolveThatEquation,
  'More Variables': MoreVariables,
}

/**
 * Temples are earned, not listed: the Temples screen shows only the ones whose
 * id is in the unlocked set. The Stone Temple comes from the bonus problem at
 * the end of "Solve that Equation!", and the Sand Temple from the one at the
 * end of "More Variables".
 */
const TEMPLES = [
  { id: 'stone', name: 'Stone Temple', screen: StoneTemple },
  { id: 'sand', name: 'Sand Temple', screen: SandTemple },
]

/**
 * Screen ids. Navigation is a plain stack held in React state:
 * the last entry is the visible screen, and "back" pops one entry,
 * so you always return to the *previous* stage.
 */
const SCREENS = {
  HOME: 'home',
  COURSES: 'courses',
  ALGEBRA: 'algebra',
  ADVENTURE: 'adventure',
  UNIT: 'unit',
  TEMPLES: 'temples',
  TEMPLE: 'temple',
}

/**
 * The Algebra syllabus, in order. Each group is a run of units followed by
 * the test(s) that close it out; the last group ends with two tests rather
 * than a section test.
 */
const ALGEBRA_SECTIONS = [
  {
    units: [
      'Solve that Equation!',
      'More Variables',
      'Substitution and Elimination',
      'Inequalities',
    ],
    tests: ['Section 1 Test'],
  },
  {
    units: [
      'Powerful Powers',
      'Factoring',
      'Completing the Square',
      'The Quadratic Formula',
      'Imaginary Numbers',
    ],
    tests: ['Section 2 Test'],
  },
  {
    units: [
      'Graphing',
      'Slippery Slopes',
      'Parabolas',
      'Intersections',
      'Functions',
      'Inverses',
    ],
    tests: ['Section 3 Test'],
  },
  {
    units: [
      'Pythagorean Theorem',
      'Sine, Cosine, and Tangent',
      'Opposite Sine, Cosine, and Tangent',
      'The Unit Circle',
      'Fun Waves',
    ],
    tests: ['Section 4 Test'],
  },
  {
    units: ['Marblemania', 'Advanced Algebra'],
    tests: ['Bonus Test', 'Final Test'],
  },
]

/** The emerald purse, top right of the home screen. */
function Emeralds({ count }) {
  return (
    <div className="purse" title={`${count} emeralds`}>
      <svg viewBox="0 0 16 16" className="emerald-icon" aria-hidden="true">
        <path d="M8 1l5 4-5 10-5-10 5-4z" fill="#2fbf6b" />
        <path d="M8 1l5 4-5 3-5-3 5-4z" fill="#63e39a" />
        <path d="M8 8l5-3-5 10V8z" fill="#1e8f4e" />
      </svg>
      <span className="purse-count">{count}</span>
    </div>
  )
}

/** The code box. Nothing here is advertised - you either know a code or not. */
function CodeBox({ onCode, dev }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')

  function submit(e) {
    e.preventDefault()
    const message = onCode(text)
    setNote(message || '')
    setText('')
  }

  return (
    <form className="code-box" onSubmit={submit}>
      <input
        className="op-input code-input"
        value={text}
        placeholder="code"
        aria-label="Code"
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="pixel-btn code-go">
        Enter
      </button>
      {note && <p className="op-note code-note">{note}</p>}
      {dev && <p className="op-note code-note">DEV MODE - nothing is being saved</p>}
    </form>
  )
}

function HomeScreen({ onNavigate, save, onCode }) {
  return (
    <div className="screen">
      <Emeralds count={save.emeralds} />

      <h1 className="title">Mathcraft</h1>
      <p className="subtitle">Build your math skills, block by block</p>

      <div className="menu">
        <button
          type="button"
          className="pixel-btn"
          onClick={() => onNavigate(SCREENS.COURSES)}
        >
          Learn
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn--alt"
          onClick={() => onNavigate(SCREENS.ADVENTURE)}
        >
          Adventure
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn--temple"
          onClick={() => onNavigate(SCREENS.TEMPLES)}
        >
          Temples
        </button>
      </div>

      <CodeBox onCode={onCode} dev={save.dev} />
    </div>
  )
}

function TempleListScreen({ unlocked, onNavigate, onBack }) {
  const open = TEMPLES.filter((t) => unlocked.includes(t.id))
  return (
    <div className="screen">
      <BackButton onBack={onBack} />

      <h2 className="heading">Temples</h2>

      {open.length === 0 ? (
        <div className="panel">
          <p className="body-text">
            No temples unlocked yet. Finish a unit to earn one.
          </p>
        </div>
      ) : (
        <div className="menu">
          {open.map((t) => (
            <button
              type="button"
              className="pixel-btn pixel-btn--temple"
              key={t.id}
              onClick={() => onNavigate(SCREENS.TEMPLE, t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TempleScreen({ id, onBack, save, onReward, onStash }) {
  const temple = TEMPLES.find((t) => t.id === id)
  if (!temple) return <TempleListScreen unlocked={[]} onNavigate={() => {}} onBack={onBack} />
  const Screen = temple.screen
  return <Screen onBack={onBack} save={save} onReward={onReward} onStash={onStash} />
}

function CourseListScreen({ onNavigate, onBack }) {
  return (
    <div className="screen">
      <BackButton onBack={onBack} />

      <h2 className="heading">Courses</h2>

      <div className="menu">
        <button
          type="button"
          className="pixel-btn"
          onClick={() => onNavigate(SCREENS.ALGEBRA)}
        >
          Algebra
        </button>
      </div>
    </div>
  )
}

function AlgebraScreen({ onNavigate, onBack }) {
  return (
    <div className="screen screen--list">
      <BackButton onBack={onBack} />

      <h2 className="heading">Algebra</h2>

      <div className="unit-list">
        {ALGEBRA_SECTIONS.map((section, i) => (
          <div className="unit-group" key={i}>
            {section.units.map((unit) => (
              <button
                type="button"
                className="pixel-btn pixel-btn--unit"
                key={unit}
                onClick={() => onNavigate(SCREENS.UNIT, unit)}
              >
                {unit}
              </button>
            ))}
            {section.tests.map((test) => (
              <button
                type="button"
                className="pixel-btn pixel-btn--unit pixel-btn--test"
                key={test}
                onClick={() => onNavigate(SCREENS.UNIT, test)}
              >
                {test}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function UnitScreen({ title, onBack, onUnlock }) {
  // Units with real content render their own screen; the rest fall back to
  // the empty placeholder.
  const Built = UNIT_SCREENS[title]
  if (Built) return <Built onBack={onBack} onComplete={onUnlock} />

  return (
    <div className="screen">
      <BackButton onBack={onBack} />

      <h2 className="heading">{title}</h2>

      <div className="panel">
        <p className="body-text">Nothing in this unit yet</p>
      </div>
    </div>
  )
}

function AdventureScreen({ onBack }) {
  return (
    <div className="screen">
      <BackButton onBack={onBack} />

      <h2 className="heading">Adventure</h2>

      <span className="badge blink">COMING SOON</span>

      <div className="panel">
        <p className="body-text">
          Adventure mode is not built yet. There is nothing to play here.
        </p>
      </div>

      <div className="menu">
        <button type="button" className="pixel-btn" disabled>
          Start Adventure
        </button>
      </div>
    </div>
  )
}

export default function App() {
  // Each entry is { screen, title }; title carries which unit was opened.
  const [history, setHistory] = useState([{ screen: SCREENS.HOME }])
  const [save, setSave] = useState(loadSave)
  const unlocked = save.unlocked
  const current = history[history.length - 1]

  const navigate = (screen, title) =>
    setHistory((prev) => [...prev, { screen, title }])
  // Never pop the last entry, so home is always the floor of the stack.
  const back = () =>
    setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))

  // Stable, because units call it from an effect the moment they are finished.
  const unlock = useCallback((id) => {
    setSave((prev) => {
      if (prev.unlocked.includes(id)) return prev
      const next = { ...prev, unlocked: [...prev.unlocked, id] }
      persist(next)
      return next
    })
  }, [])

  /** The bag someone walked out of a temple with. */
  const stash = useCallback((inventory) => {
    setSave((prev) => {
      const next = { ...prev, inventory }
      persist(next)
      return next
    })
  }, [])

  const reward = useCallback((loot) => {
    setSave((prev) => {
      const next = grantReward(prev, loot)
      persist(next)
      return next
    })
  }, [])

  // The code handler is stable, so it reads the current save through a ref.
  const saveRef = useRef(save)
  saveRef.current = save

  /** The code box. Codes always write through, dev mode included. */
  const runCode = useCallback((text) => {
    const result = applyCode(text, saveRef.current)
    if (result.wipe) {
      hardWrite(result.save)
      setSave(result.save)
      // Wiping progress mid-game would leave a stale screen open.
      if (result.save.unlocked.length === 0) setHistory([{ screen: SCREENS.HOME }])
    }
    return result.message
  }, [])

  switch (current.screen) {
    case SCREENS.COURSES:
      return <CourseListScreen onNavigate={navigate} onBack={back} />
    case SCREENS.ALGEBRA:
      return <AlgebraScreen onNavigate={navigate} onBack={back} />
    case SCREENS.UNIT:
      return <UnitScreen title={current.title} onBack={back} onUnlock={unlock} />
    case SCREENS.ADVENTURE:
      return <AdventureScreen onBack={back} />
    case SCREENS.TEMPLES:
      return <TempleListScreen unlocked={unlocked} onNavigate={navigate} onBack={back} />
    case SCREENS.TEMPLE:
      return (
        <TempleScreen
          id={current.title}
          onBack={back}
          save={save}
          onReward={reward}
          onStash={stash}
        />
      )
    case SCREENS.HOME:
    default:
      return <HomeScreen onNavigate={navigate} save={save} onCode={runCode} />
  }
}
