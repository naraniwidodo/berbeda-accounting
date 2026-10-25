import Slideshow, { type Slide } from '../components/Slideshow'

/**
 * Photos for the profile slideshow.
 *
 * To add more, drop the file in `public/company/` and add a line here —
 * `position` keeps the subject in frame when the shot is portrait.
 */
const SLIDES: Slide[] = [
  {
    src: '/company/studio-01.jpg',
    alt: 'Ber.be.da with the musician Ari Lesmana, holding hand-painted high-top sneakers',
    caption: 'Ber.be.da with Ari Lesmana, an Indonesian musician (1M+ followers)',
    position: 'center 24%',
  },
  {
    src: '/company/studio-02.jpg',
    alt: 'Ber.be.da with the musician Jason Ranti, around a table with a hand-made photo board',
    caption: 'Ber.be.da with Jason Ranti, an Indonesian musician (700K+ followers)',
    // landscape: cropping it to 3:4 would cut two people out of the frame
    fit: 'contain',
  },
]

const REACH = [
  { k: 'Instagram', v: '4K+' },
  { k: 'TikTok', v: '9K+' },
]

const PARTNERS = ['IQOS', 'Nusantara United FC']

export default function CompanyProfile() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>Company Profile</h1>
        <p>Who paints the work behind every entry in this book.</p>
      </div>

      <div className="profile">
        <div className="profile-text">
          <p className="lede">
            <strong>Ber.be.da</strong>, under PT Goran Kreativitas Indonesia, provides painting
            services, mostly on fashion items.
          </p>

          <p>
            We paint people’s stories to life. We are committed to “recycling” worn-out fashion
            items through painting, and to empowering local painters from Bantul, Indonesia, at
            the same time.
          </p>

          <div className="reach">
            {REACH.map((r) => (
              <div className="reach-item" key={r.k}>
                <span className="reach-v">{r.v}</span>
                <span className="reach-k">{r.k}</span>
              </div>
            ))}
          </div>

          <div className="profile-block">
            <h2>Right now</h2>
            <p>
              We are part of the <strong>TSAI City Accelerator at Yale University</strong> this
              year.
            </p>
          </div>

          <div className="profile-block">
            <h2>Collaborations</h2>
            <p>
              Before that we had already established collaborations with institutions and public
              figures, including:
            </p>
            <div className="chips">
              {PARTNERS.map((p) => (
                <span className="chip" key={p}>
                  {p}
                </span>
              ))}
              <span className="chip muted">and others</span>
            </div>
          </div>
        </div>

        <div className="profile-media">
          <Slideshow slides={SLIDES} interval={5000} />
        </div>
      </div>
    </main>
  )
}
