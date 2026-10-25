import { useState } from 'react'
import { addClient, editClient, removeClient, useClients, type Client } from '../lib/clients'

const today = () => new Date().toISOString().slice(0, 10)

interface Draft {
  sku: string
  client_name: string
  project: string
  dp_date: string
  note: string
}

const empty = (): Draft => ({ sku: '', client_name: '', project: '', dp_date: today(), note: '' })

export default function ClientRegistration() {
  const { clients, loading, error } = useClients()
  const [draft, setDraft] = useState<Draft>(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [flash, setFlash] = useState('')

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const canSave = draft.sku.trim().length >= 2 && draft.client_name.trim().length > 0

  function startEdit(c: Client) {
    setEditing(c.sku)
    setDraft({
      sku: c.sku,
      client_name: c.client_name,
      project: c.project,
      dp_date: c.dp_date ?? '',
      note: c.note ?? '',
    })
    setProblem('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setDraft(empty())
    setProblem('')
  }

  async function save() {
    if (!canSave || busy) return
    setBusy(true)
    setProblem('')
    const body = {
      client_name: draft.client_name.trim(),
      project: draft.project.trim(),
      dp_date: draft.dp_date || null,
      note: draft.note.trim() || null,
    }
    try {
      if (editing) {
        await editClient(editing, body)
        setFlash(`${editing} updated`)
      } else {
        const { client } = await addClient({ sku: draft.sku.trim().toUpperCase(), ...body })
        setFlash(`${client.sku} registered`)
      }
      setEditing(null)
      setDraft(empty())
      window.setTimeout(() => setFlash(''), 3000)
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(sku: string) {
    setProblem('')
    try {
      await removeClient(sku)
      setFlash(`${sku} removed`)
      window.setTimeout(() => setFlash(''), 3000)
    } catch (e) {
      setProblem((e as Error).message)
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Client Registration</h1>
        <p>
          Before doing any journal entries, especially when you journal a client&rsquo;s
          transaction, make sure that all clients are registered here.
        </p>
      </div>

      <div className="note" style={{ marginTop: 0, marginBottom: 18 }}>
        A project registered here becomes a choice in the Journal Entries dropdown. That is
        what lets a <strong>final settlement</strong> find the deposit it belongs to — the two
        entries point at the same project, so the app can clear the right one.
      </div>

      <div className="card">
        <div className="card-head">
          <h3>{editing ? `Edit ${editing}` : 'Register a project'}</h3>
          {flash && (
            <span className="pill good">
              <span className="dot" />
              {flash}
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sku">
                SKU {editing && <span className="hint">· cannot be changed</span>}
              </label>
              <input
                id="sku"
                type="text"
                value={draft.sku}
                placeholder="SKU0126"
                readOnly={!!editing}
                style={editing ? { background: 'var(--shell)', color: 'var(--text-soft)' } : undefined}
                onChange={(e) => set('sku', e.target.value.toUpperCase())}
              />
            </div>

            <div className="field">
              <label htmlFor="client">Client name</label>
              <input
                id="client"
                type="text"
                value={draft.client_name}
                placeholder="Who the work is for"
                onChange={(e) => set('client_name', e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="dp">
                Down payment date <span className="hint">· optional</span>
              </label>
              <input
                id="dp"
                type="date"
                value={draft.dp_date}
                onChange={(e) => set('dp_date', e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="project">
                Project <span className="hint">· what is being painted</span>
              </label>
              <input
                id="project"
                type="text"
                value={draft.project}
                placeholder="Air Force 1 pair, tribal pattern"
                onChange={(e) => set('project', e.target.value)}
              />
            </div>

            <div className="field full">
              <label htmlFor="cnote">
                Note <span className="hint">· optional</span>
              </label>
              <input
                id="cnote"
                type="text"
                value={draft.note}
                placeholder="Anything worth remembering about this job"
                onChange={(e) => set('note', e.target.value)}
              />
            </div>
          </div>

          {problem && (
            <div
              className="note"
              style={{
                borderLeftColor: 'var(--rust)',
                background: 'rgba(188,63,23,.07)',
                color: 'var(--rust)',
              }}
            >
              {problem}
            </div>
          )}

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn" disabled={!canSave || busy} onClick={save}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Register project'}
            </button>
            {editing && (
              <button className="btn ghost" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Registered projects</h3>
          <span className="sub">
            {loading ? 'loading…' : `${clients.length} ${clients.length === 1 ? 'project' : 'projects'}`}
          </span>
        </div>

        {error ? (
          <div className="empty">
            <strong>The accounting API is not answering</strong>
            {error}
          </div>
        ) : clients.length === 0 ? (
          <div className="empty">
            <strong>No projects registered yet</strong>
            Register one above, then it will be selectable on the Journal Entries page.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Client</th>
                  <th>Project</th>
                  <th>DP date</th>
                  <th className="num">Open deposit</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.sku}>
                    <td style={{ fontWeight: 600 }}>{c.sku}</td>
                    <td>{c.client_name}</td>
                    <td style={{ color: 'var(--text-soft)' }}>{c.project || '—'}</td>
                    <td>{c.dp_date || '—'}</td>
                    <td className="num" style={c.open_prepayment ? { color: 'var(--rust)' } : undefined}>
                      {c.open_prepayment ? c.open_prepayment.toLocaleString('en-US') : '—'}
                    </td>
                    <td style={{ color: 'var(--text-soft)', fontSize: 13 }}>{c.note || ''}</td>
                    <td>
                      <div className="actions">
                        <button className="btn ghost sm" onClick={() => startEdit(c)}>
                          Edit
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={c.has_entries}
                          title={
                            c.has_entries
                              ? 'Entries are posted against this project, so it stays'
                              : 'Remove this project'
                          }
                          onClick={() => void remove(c.sku)}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
