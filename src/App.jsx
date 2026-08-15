import { useState } from 'react'
import './App.css'
import BackButton from './BackButton.jsx'
import SolveThatEquation from './algebra/SolveThatEquation.jsx'

/** Units that have real content, keyed by their name on the Algebra screen. */
const UNIT_SCREENS = {
  'Solve that Equation!': SolveThatEquation,
}

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

function HomeScreen({ onNavigate }) {
  return (
    <div className="screen">
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
      </div>
    </div>
  )
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

function UnitScreen({ title, onBack }) {
  // Units with real content render their own screen; the rest fall back to
  // the empty placeholder.
  const Built = UNIT_SCREENS[title]
  if (Built) return <Built onBack={onBack} />

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
  const current = history[history.length - 1]

  const navigate = (screen, title) =>
    setHistory((prev) => [...prev, { screen, title }])
  // Never pop the last entry, so home is always the floor of the stack.
  const back = () =>
    setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))

  switch (current.screen) {
    case SCREENS.COURSES:
      return <CourseListScreen onNavigate={navigate} onBack={back} />
    case SCREENS.ALGEBRA:
      return <AlgebraScreen onNavigate={navigate} onBack={back} />
    case SCREENS.UNIT:
      return <UnitScreen title={current.title} onBack={back} />
    case SCREENS.ADVENTURE:
      return <AdventureScreen onBack={back} />
    case SCREENS.HOME:
    default:
      return <HomeScreen onNavigate={navigate} />
  }
}
