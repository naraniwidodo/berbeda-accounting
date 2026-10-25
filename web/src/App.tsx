import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import Footer from './components/Footer'
import Chat from './components/Chat'
import Home from './pages/Home'
import CompanyProfile from './pages/CompanyProfile'
import ClientRegistration from './pages/ClientRegistration'
import JournalEntries from './pages/JournalEntries'
import ProfitLoss from './pages/ProfitLoss'
import BalanceSheetPage from './pages/BalanceSheet'

export default function App() {
  return (
    <div className="shell">
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/company" element={<CompanyProfile />} />
        <Route path="/clients" element={<ClientRegistration />} />
        <Route path="/journal" element={<JournalEntries />} />
        <Route path="/pnl" element={<ProfitLoss />} />
        <Route path="/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Footer />
      <Chat />
    </div>
  )
}
