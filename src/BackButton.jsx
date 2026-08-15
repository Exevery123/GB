export default function BackButton({ onBack }) {
  return (
    <button type="button" className="back-btn" onClick={onBack}>
      {'< BACK'}
    </button>
  )
}
