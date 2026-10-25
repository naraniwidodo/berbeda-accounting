/** Instagram glyph, drawn in currentColor so it stays all black. */
function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden focusable="false">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.4" fill="none"
            stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.3" cy="6.7" r="1.25" fill="currentColor" />
    </svg>
  )
}

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p className="footer-note">
          Berbeda keeps its books here — every entry posts from a template, and the
          statements are only ever a view of those entries.
        </p>
        <a
          className="footer-ig"
          href="https://instagram.com/ber.be.da"
          target="_blank"
          rel="noopener noreferrer"
        >
          <InstagramMark />
          <span>@ber.be.da</span>
        </a>
      </div>
    </footer>
  )
}
