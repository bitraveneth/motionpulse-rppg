import { useEffect, useState } from 'react'
import { HomeHeroVisual } from './HomeHeroVisual'

type Slide = {
  id: string
  kicker: string
  title: string
  body: string
  kind: 'face' | 'pulse' | 'breath' | 'trust'
}

const SLIDES: Slide[] = [
  {
    id: 'roi',
    kicker: 'Face region',
    title: 'The camera locks onto the face',
    body: 'Forehead, cheeks, and lower face are the regions the pulse is read from. The mesh stays on the face, not the background.',
    kind: 'face',
  },
  {
    id: 'pulse',
    kicker: 'Heart rate',
    title: 'A pulse number from skin color',
    body: 'Tiny color changes in those regions become a waveform, then a beats-per-minute estimate. It updates while the clip plays.',
    kind: 'pulse',
  },
  {
    id: 'breath',
    kicker: 'Respiratory rate',
    title: 'Breath only when the rhythm is clear',
    body: 'A short clip can show breaths per minute when a slow rise and fall repeats. If motion covers it, the card stays blank.',
    kind: 'breath',
  },
  {
    id: 'trust',
    kicker: 'Signal trust',
    title: 'Motion tells you when to doubt the number',
    body: 'Stable, Mixed, or Unreliable comes from how much face movement lines up with the pulse. It is a quality flag, not a health grade.',
    kind: 'trust',
  },
]

function MiniWave({ color }: { color: string }) {
  const d =
    'M0 28 C 12 28 16 8 28 8 S 44 36 56 28 S 76 6 88 14 S 108 34 120 22 S 140 8 156 18'
  return (
    <svg viewBox="0 0 156 44" className="hero-mini-wave" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function SlideArt({ kind }: { kind: Slide['kind'] }) {
  if (kind === 'face') return <HomeHeroVisual />
  if (kind === 'pulse') {
    return (
      <div className="hero-demo-card">
        <p className="hero-demo-kicker">Heart rate</p>
        <p className="hero-demo-value">
          72<span>bpm</span>
        </p>
        <MiniWave color="#0f9f8f" />
        <p className="hero-demo-chip">Example · Stable</p>
      </div>
    )
  }
  if (kind === 'breath') {
    return (
      <div className="hero-demo-card">
        <p className="hero-demo-kicker">Respiratory rate</p>
        <p className="hero-demo-value">
          16<span>/min</span>
        </p>
        <MiniWave color="#1a7f9a" />
        <p className="hero-demo-chip">Example · clear spacing</p>
      </div>
    )
  }
  return (
    <div className="hero-demo-card">
      <p className="hero-demo-kicker">Signal</p>
      <p className="hero-demo-value hero-demo-word">Stable</p>
      <p className="hero-demo-chip">Low motion overlap</p>
      <ul className="hero-demo-dots" aria-hidden>
        <li />
        <li />
        <li />
        <li />
      </ul>
    </div>
  )
}

/** Large home hero: face ROI, then pulse, breath, and trust. */
export function HomeHeroSlider() {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index]!

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % SLIDES.length)
    }, 5200)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="home-hero-slider" aria-roledescription="carousel">
      <div className="home-hero-slide">
        <SlideArt kind={slide.kind} />
        <div className="home-hero-caption">
          <p className="home-hero-kicker">{slide.kicker}</p>
          <p className="home-hero-slide-title">{slide.title}</p>
          <p className="home-hero-slide-body">{slide.body}</p>
        </div>
      </div>
      <div className="home-hero-slider-bar">
        <button
          type="button"
          className="hero-arrow"
          aria-label="Previous demo"
          onClick={() => setIndex((n) => (n + SLIDES.length - 1) % SLIDES.length)}
        >
          ‹
        </button>
        <div className="hero-dots" role="tablist" aria-label="Demo slides">
          {SLIDES.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={item.kicker}
              className={`hero-dot ${i === index ? 'is-active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="hero-arrow"
          aria-label="Next demo"
          onClick={() => setIndex((n) => (n + 1) % SLIDES.length)}
        >
          ›
        </button>
      </div>
    </div>
  )
}
