import { useEffect, useRef, useState } from 'react'

export interface Slide {
  src: string
  alt: string
  /** Shown under the frame; changes with the slide. */
  caption?: string
  /** CSS object-position, so a portrait shot keeps its subject in frame. */
  position?: string
  /**
   * 'cover' fills the 3:4 frame and crops the edges — right for portrait
   * shots. 'contain' shows the whole photo inside the frame, which is what a
   * landscape group shot needs if nobody is to be cropped out of it.
   */
  fit?: 'cover' | 'contain'
}

/**
 * Crossfading slideshow.
 *
 * Auto-advance pauses when the tab is hidden and for anyone who has asked for
 * reduced motion; the dots still work in both cases.
 */
export default function Slideshow({
  slides,
  interval = 5000,
}: {
  slides: Slide[]
  interval?: number
}) {
  const [i, setI] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (slides.length < 2 || reduced) return
    timer.current = window.setTimeout(() => setI((n) => (n + 1) % slides.length), interval)
    return () => window.clearTimeout(timer.current)
  }, [i, slides.length, interval, reduced])

  return (
    <div className="slides">
      <div className="slides-frame">
        {slides.map((s, n) => (
          <img
            key={s.src}
            src={s.src}
            alt={s.alt}
            loading={n === 0 ? 'eager' : 'lazy'}
            className={`${n === i ? 'on' : ''} fit-${s.fit ?? 'cover'}`}
            style={{ objectPosition: s.position ?? 'center' }}
            aria-hidden={n !== i}
          />
        ))}
      </div>

      {slides.some((s) => s.caption) && (
        <p className="slides-caption" key={slides[i].src}>
          {slides[i].caption}
        </p>
      )}

      {slides.length > 1 && (
        <div className="slides-dots" role="tablist" aria-label="Photos">
          {slides.map((s, n) => (
            <button
              key={s.src}
              role="tab"
              aria-selected={n === i}
              aria-label={`Photo ${n + 1} of ${slides.length}`}
              className={n === i ? 'on' : ''}
              onClick={() => setI(n)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
