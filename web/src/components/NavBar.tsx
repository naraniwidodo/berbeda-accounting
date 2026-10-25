import { NavLink } from 'react-router-dom'
import logo from '/berbeda-logo.png'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/company', label: 'Company Profile' },
  { to: '/clients', label: 'Clients' },
  { to: '/journal', label: 'Journal Entries' },
  { to: '/pnl', label: 'P&L' },
  { to: '/balance-sheet', label: 'Balance Sheet' },
]

export default function NavBar() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <NavLink to="/" className="brand" aria-label="Berbeda — home">
          <img className="nav-logo" src={logo} alt="Berbeda" />
        </NavLink>
        <div className="nav-links">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
