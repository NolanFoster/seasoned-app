import React, { useState, useEffect } from 'react'

const KITCHEN_PHRASES = [
  'Selecting ingredients…',
  'Balancing flavours…',
  'Writing the method…',
  'Seasoning to taste…',
  'Plating up…',
]

export default function GeneratingCard({ dishName }) {
  const [phraseIndex, setPhraseIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIndex(i => (i + 1) % KITCHEN_PHRASES.length)
    }, 3500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="generating-card">
      <div className="generating-visual">
        <span className="generating-bubble" />
        <span className="generating-bubble" />
        <span className="generating-bubble" />
        <span className="generating-bubble" />
        <span className="generating-bubble" />
      </div>
      <div className="generating-dish-name">{dishName}</div>
      <p className="generating-phrase" key={phraseIndex}>
        {KITCHEN_PHRASES[phraseIndex]}
      </p>
      <p className="generating-hint">AI recipes take about 15 seconds</p>
    </div>
  )
}
