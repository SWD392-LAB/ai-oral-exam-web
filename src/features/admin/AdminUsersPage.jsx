import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { adminApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import { formatDay } from '../../utils/format.js'
import './AdminUsers.css'

const SHOWN = 10
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Administrators create accounts (the user gets a link to set account name and password),
// change roles and deactivate accounts (F7). Exam records of deactivated accounts are kept.
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const { data: users, setData } = useLoad(() => adminApi.users(), [])
  const { later, clear } = useTimeouts()
  const [m, set] = useMergeState({
    open: false, closing: false, fEmail: '', fName: '', fRole: 'Lecturer', err: {}, sending: false, sent: false, sentTo: '',
    editing: null, editVal: '', confirm: null, confirmClosing: false, busy: false,
    just: null, arrive: null, totalFlip: 0, fr: 'all', fs: 'all', q: '', flip: 0, error: null,
  })
  const all = (users ?? []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const statusOf = (u) => (!u.active ? 'Deactivated' : !u.hasPassword && u.setupSentAt ? 'Setup link sent' : 'Active')
  const visibleIn = (st) => {
    const q = st.q.trim().toLowerCase()
    return all.filter((u) => (st.fr === 'all' || u.role === st.fr) && (st.fs === 'all' || statusOf(u) === st.fs)
      && (!q || `${u.fullName} ${u.accountName ?? ''} ${u.email}`.toLowerCase().includes(q))).slice(0, SHOWN)
  }
  const shownUsers = visibleIn(m)
  const filter = (patch) => {
    const next = { ...m, ...patch }
    const changed = visibleIn(m).map((u) => u.id).join() !== visibleIn(next).map((u) => u.id).join()
    set({ ...patch, ...(changed ? { flip: m.flip + 1, arrive: null } : {}) })
  }
  const replace = (u) => setData((list) => list.map((x) => (x.id === u.id ? u : x)))
  const create = async () => {
    if (m.sending) return
    const email = m.fEmail.trim(), name = m.fName.trim(), err = {}
    if (!email) err.email = 'Enter an email address.'
    else if (!EMAIL_RE.test(email)) err.email = 'Enter an email address like name@example.com.'
    else if (all.some((u) => u.email.toLowerCase() === email.toLowerCase())) err.email = 'An account already uses this email.'
    if (!name) err.name = 'Enter the full name.'
    if (err.email || err.name) { set({ err, sent: false }); return }
    set({ err: {}, sending: true, sent: false })
    try {
      const u = await atLeast(adminApi.createUser(name, email, m.fRole), 900)
      setData((list) => [...list, u])
      set((p) => ({ sending: false, sent: true, sentTo: email, fEmail: '', fName: '', fRole: 'Lecturer', totalFlip: p.totalFlip + 1, just: { id: u.id, f: 'new' }, arrive: u.id, fr: 'all', fs: 'all', q: '' }))
    } catch (e) {
      set({ sending: false, err: { email: e.message } })
    }
  }
  const closePanel = () => { set({ closing: true }); later(() => set({ open: false, closing: false, sent: false, err: {} }), 260) }
  const keep = () => { clear(); set({ confirmClosing: true, busy: false }); later(() => set({ confirm: null, confirmClosing: false }), 240) }
  const row = (u) => {
    const id = u.id
    const off = !u.active
    const editing = m.editing === id && !off
    const confirming = m.confirm === id
    const just = m.just && m.just.id === id ? m.just.f : null
    const pending = !off && !u.hasPassword && !!u.setupSentAt
    const sentDay = u.setupSentAt ? formatDay(u.setupSentAt) : ''
    let note = '', noteInk = 'var(--jade-ink)'
    if (off) { note = 'Exam records kept'; noteInk = 'var(--ink-3)' }
    else if (pending && just !== 'new') note = sentDay === 'Today' ? 'today' : sentDay
    const self = id === me?.id
    let cls = 'a-row'
    if (m.arrive === id) cls += ' au-arrive'
    else if (m.flip) cls += m.flip % 2 ? ' au-in-a' : ' au-in-b'
    return {
      id, display: 'table-row', cls,
      name: u.fullName, email: u.email,
      account: u.accountName || 'Not set yet',
      accInk: off ? 'var(--ink-3)' : u.accountName ? 'var(--night-indigo)' : 'var(--ink-3)',
      ink: off ? 'var(--ink-3)' : 'var(--night-indigo)',
      role: u.role, roleCls: just === 'role' ? 'a-rise' : '', roleJust: just === 'role',
      editing, notEditing: !editing, roleCellCls: editing ? 'au-editing' : '',
      editVal: editing ? m.editVal : u.role,
      editLabel: `New role for ${u.fullName}`,
      setEdit: (e) => set({ editVal: e.target.value }),
      saveOff: editing && m.editVal === u.role ? 'true' : 'false',
      save: async () => {
        if (m.editVal === u.role) return
        try { replace(await adminApi.changeRole(id, m.editVal)); set({ editing: null, just: { id, f: 'role' }, arrive: null }) } catch (e) { set({ error: e.message }) }
      },
      cancel: () => set({ editing: null }),
      edit: () => { if (m.editing === id) { set({ editing: null }); return } set({ editing: id, editVal: u.role, confirm: m.confirm === id ? null : m.confirm }) },
      isActive: !off && !pending, isOff: off, isPending: pending,
      status: statusOf(u),
      statusInk: off ? 'var(--ink-3)' : pending ? 'var(--ink-2)' : 'var(--night-indigo)',
      pendCls: just === 'new' ? 'a-pop' : '',
      metaNote: note ? ` · ${note}` : just === 'new' ? ' · just now' : '',
      statusCls: just === 'off' ? 'a-rise' : '',
      markCls: just === 'off' ? 'a-pop' : '',
      hasNote: !!note, note, noteInk,
      statusJust: just === 'new' || just === 'off',
      linked: u.googleLinked, notLinked: !u.googleLinked,
      canAct: !off && !self, isSelf: self,
      gSmCls: u.googleLinked ? 'au-show-sm' : '',
      editDisplay: editing ? 'flex' : 'none',
      roleDisplay: editing ? 'none' : 'inline-block',
      roleJustDisplay: !editing && just === 'role' ? 'flex' : 'none',
      activeDisplay: !off && !pending ? 'inline' : 'none',
      pendDisplay: pending ? 'inline-flex' : 'none',
      offDisplay: off ? 'inline-flex' : 'none',
      noteDisplay: note ? 'block' : 'none',
      statusJustDisplay: just === 'new' || just === 'off' ? 'block' : 'none',
      linkedDisplay: u.googleLinked ? 'inline-flex' : 'none',
      notLinkedDisplay: u.googleLinked ? 'none' : 'inline',
      selfDisplay: self ? 'inline-block' : 'none',
      actDisplay: !off && !self ? 'inline-flex' : 'none',
      roleBtnDisplay: editing ? 'none' : 'inline-block',
      busyDisplay: confirming && m.busy ? 'inline' : 'none',
      roleLabel: `Change role of ${u.fullName}`,
      deactLabel: `Deactivate ${u.fullName}`,
      confirming: confirming ? 'true' : 'false',
      ask: () => {
        if (m.confirm === id) { keep(); return }
        clear()
        set({ confirm: id, confirmClosing: false, busy: false, editing: m.editing === id ? null : m.editing })
      },
      confirmDisplay: confirming ? 'table-row' : 'none',
      confirmCls: confirming && m.confirmClosing ? 'au-close' : 'au-open',
      busy: confirming && m.busy,
      confirmText: confirming && m.busy ? 'Deactivating…' : 'Deactivate account',
      keep,
      confirm: async () => {
        if (m.busy) return
        set({ busy: true })
        try {
          const updated = await atLeast(adminApi.deactivate(id), 700)
          set({ confirmClosing: true })
          later(() => { replace(updated); set({ confirm: null, confirmClosing: false, busy: false, just: { id, f: 'off' }, arrive: null }) }, 240)
        } catch (e) {
          set({ busy: false, error: e.message })
        }
      },
    }
  }
  const filtered = m.fr !== 'all' || m.fs !== 'all' || m.q.trim() !== ''
  const open = m.open
  const total = all.length
  const v = {
    rows: shownUsers.map(row),
    total: total.toString(),
    totalCls: m.totalFlip ? (m.totalFlip % 2 ? 'a-tick-a' : 'a-tick-b') : '',
    panelOpen: open && !m.closing ? 'true' : 'false',
    panelShown: open,
    panelCls: m.closing ? 'au-close' : 'au-open',
    toggle: () => { if (open && !m.closing) closePanel(); else set({ open: true, closing: false }) },
    toggleText: open && !m.closing ? 'Close form' : 'Create user',
    toggleCls: open && !m.closing ? 'au-toggle-quiet' : 'a-full-sm',
    toggleDeg: open && !m.closing ? '45deg' : '0deg',
    toggleKind: open && !m.closing ? 'a-btn-quiet' : 'a-btn-primary',
    toggleBg: open && !m.closing ? 'transparent' : 'var(--night-indigo)',
    toggleInk: open && !m.closing ? 'var(--ink-2)' : 'var(--ivory)',
    toggleBorder: '0',
    togglePad: open && !m.closing ? '14px' : '20px',
    toggleShadow: open && !m.closing ? 'none' : '0 8px 18px -10px rgba(15,22,48,0.55)',
    close: closePanel,
    fEmail: m.fEmail, fName: m.fName, fRole: m.fRole,
    setEmail: (e) => set((p) => ({ fEmail: e.target.value, err: { ...p.err, email: '' } })),
    setName: (e) => set((p) => ({ fName: e.target.value, err: { ...p.err, name: '' } })),
    setRole: (e) => set({ fRole: e.target.value }),
    err: { email: m.err.email || '', name: m.err.name || '' },
    emailBad: m.err.email ? 'true' : 'false',
    nameBad: m.err.name ? 'true' : 'false',
    sending: m.sending, notSending: !m.sending,
    createText: m.sending ? 'Sending…' : 'Create and send setup link',
    create,
    sent: m.sent && !m.sending, sentTo: m.sentTo,
    fr: m.fr, fs: m.fs, q: m.q,
    setFr: (e) => filter({ fr: e.target.value }),
    setFs: (e) => filter({ fs: e.target.value }),
    setQ: (e) => filter({ q: e.target.value }),
    clear: () => { if (filtered) filter({ fr: 'all', fs: 'all', q: '' }) },
    clearOff: filtered ? 'false' : 'true',
    countText: filtered ? (shownUsers.length === 1 ? '1 user matches' : `${shownUsers.length} users match`) : `Showing ${shownUsers.length} of ${total} users`,
    emptyDisplay: users && shownUsers.length === 0 ? 'table-row' : 'none',
  }
  return (
    <div className="pg-adminusers" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <StaffTopBar current="users" />
      <main className="a-gutter" style={{ flex: "1", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "56px 40px 80px", display: "flex", flexDirection: "column", gap: "28px" }}>
        <div className="a-stack-sm a-rise" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h1 className="a-title" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "44px", lineHeight: "1.08", letterSpacing: "-0.012em", color: "var(--night-indigo)" }}>
              Users
            </h1>
            <p aria-live="polite" style={{ fontSize: "16.5px", color: "var(--ink-2)" }}>
              <span className={`a-num ${v.totalCls}`} style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                {v.total}
              </span>
              {' '}accounts. Every change here is written to the{' '}
              <Link className="a-link" to={paths.adminAudit} style={{ color: "var(--night-indigo)" }}>
                audit log
              </Link>
              .
            </p>
          </div>
          <button type="button" className={`a-btn ${v.toggleKind} ${v.toggleCls}`} aria-expanded={v.panelOpen} aria-controls="create-panel" onClick={v.toggle} style={{ height: "44px", padding: `0 ${v.togglePad}`, border: v.toggleBorder, borderRadius: "12px", background: v.toggleBg, color: v.toggleInk, fontSize: "15px", fontWeight: "500", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: v.toggleShadow }}>
            <svg className="au-turn" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", transform: `rotate(${v.toggleDeg})`, fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            {v.toggleText}
          </button>
        </div>
        {v.panelShown && (
          <>
            <section id="create-panel" className={v.panelCls} aria-labelledby="create-h" style={{ animationDelay: "60ms", display: "flex", flexDirection: "column", gap: "22px", padding: "30px 0 34px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <h2 id="create-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)" }}>
                  Create a user
                </h2>
              </div>
              <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr) 210px auto", gap: "16px", alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label htmlFor="new-email" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                    Email
                  </label>
                  <input id="new-email" type="email" className="a-field" value={v.fEmail} onChange={v.setEmail} aria-invalid={v.emailBad} aria-describedby="new-email-err" placeholder="name@example.com" autoComplete="off" style={{ width: "100%", height: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                  {v.err.email && (
                    <>
                      <p id="new-email-err" className="a-rise" role="alert" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--red-ink)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M12 4 2.8 19.5h18.4z" />
                          <path d="M12 10v4.5" />
                          <path d="M12 17.2v.01" />
                        </svg>
                        {v.err.email}
                      </p>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label htmlFor="new-name" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                    Full name
                  </label>
                  <input id="new-name" type="text" className="a-field" value={v.fName} onChange={v.setName} aria-invalid={v.nameBad} aria-describedby="new-name-err" placeholder="Pham Thu Ha" autoComplete="off" style={{ width: "100%", height: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                  {v.err.name && (
                    <>
                      <p id="new-name-err" className="a-rise" role="alert" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--red-ink)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M12 4 2.8 19.5h18.4z" />
                          <path d="M12 10v4.5" />
                          <path d="M12 17.2v.01" />
                        </svg>
                        {v.err.name}
                      </p>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label htmlFor="new-role" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                    Role
                  </label>
                  <div style={{ position: "relative" }}>
                    <select id="new-role" className="a-field" value={v.fRole} onChange={v.setRole} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                      <option value="Lecturer">
                        Lecturer
                      </option>
                      <option value="Student">
                        Student
                      </option>
                      <option value="Administrator">
                        Administrator
                      </option>
                    </select>
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "12px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span aria-hidden="true" className="a-hide-sm" style={{ fontSize: "14px", visibility: "hidden" }}>
                    Send
                  </span>
                  <button type="button" className="a-btn a-btn-primary" aria-disabled={v.sending} onClick={v.create} style={{ height: "44px", padding: "0 20px", border: "0", borderRadius: "12px", background: "var(--night-indigo)", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 8px 18px -10px rgba(15,22,48,0.55)" }}>
                    {v.sending && (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }}>
                          <path className="au-spin" d="M12 3a9 9 0 1 1-9 9" />
                        </svg>
                      </>
                    )}
                    {v.notSending && (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M21 3 10 14" />
                          <path d="m21 3-7 18-4-7-7-4z" />
                        </svg>
                      </>
                    )}
                    {v.createText}
                  </button>
                </div>
              </div>
              {v.sent && (
                <>
                  <div className="au-open" role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "14px 16px", borderRadius: "12px", background: "var(--jade-wash)", border: "1px solid rgba(44,107,107,0.22)" }}>
                    <p style={{ flex: "1 1 320px", display: "flex", alignItems: "flex-start", gap: "12px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--night-indigo)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "2px", fill: "none", stroke: "var(--jade-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
                      </svg>
                      <span>
                        <span style={{ fontWeight: "500" }}>
                          Setup link sent to{' '}{v.sentTo}.
                        </span>
                        {' '}It works once and expires.
                      </span>
                    </p>
                    <button type="button" className="a-btn a-btn-quiet" onClick={v.close} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--night-indigo)", fontSize: "15px", fontWeight: "500" }}>
                      Done
                    </button>
                  </div>
                </>
              )}
            </section>
          </>
        )}
        <div className="a-wrap-sm a-rise" style={{ animationDelay: "120ms", display: "flex", alignItems: "flex-end", gap: "16px", marginTop: "8px" }}>
          <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "200px" }}>
            <label htmlFor="f-role" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
              Role
            </label>
            <div style={{ position: "relative" }}>
              <select id="f-role" className="a-field" value={v.fr} onChange={v.setFr} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                <option value="all">
                  All roles
                </option>
                <option value="Student">
                  Student
                </option>
                <option value="Lecturer">
                  Lecturer
                </option>
                <option value="Administrator">
                  Administrator
                </option>
              </select>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "12px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "180px" }}>
            <label htmlFor="f-status" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
              Status
            </label>
            <div style={{ position: "relative" }}>
              <select id="f-status" className="a-field" value={v.fs} onChange={v.setFs} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                <option value="all">
                  All
                </option>
                <option value="Active">
                  Active
                </option>
                <option value="Setup link sent">
                  Setup link sent
                </option>
                <option value="Deactivated">
                  Deactivated
                </option>
              </select>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "12px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "320px" }}>
            <label htmlFor="f-search" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
              Search
            </label>
            <div style={{ position: "relative" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", left: "13px", top: "13px", pointerEvents: "none", fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.75", strokeLinecap: "round" }}>
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input id="f-search" type="search" className="a-field" value={v.q} onChange={v.setQ} placeholder="Name, account name or email" autoComplete="off" style={{ width: "100%", height: "44px", padding: "0 14px 0 40px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
            </div>
          </div>
          <button type="button" className="a-btn a-btn-quiet" aria-disabled={v.clearOff} onClick={v.clear} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)" }}>
            Clear filters
          </button>
          <p className="a-num" aria-live="polite" style={{ marginLeft: "auto", height: "44px", display: "flex", alignItems: "center", fontSize: "13.5px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
            {v.countText}
          </p>
        </div>
        <section aria-label="Users" className="a-rise" style={{ animationDelay: "180ms" }}>
          <div className="au-scroll" style={{ overflowX: "auto", margin: "0 -12px", padding: "0 12px 4px" }}>
            <table className="au-table" style={{ width: "100%", minWidth: "1120px", textAlign: "left", borderCollapse: "separate", borderSpacing: "0" }}>
              <thead>
                <tr style={{ boxShadow: "inset 0 -1px 0 var(--line-strong)" }}>
                  <th scope="col" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    User
                  </th>
                  <th scope="col" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap", width: "160px" }}>
                    Account name
                  </th>
                  <th scope="col" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap", width: "220px" }}>
                    Role
                  </th>
                  <th scope="col" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap", width: "220px" }}>
                    Status
                  </th>
                  <th scope="col" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap", width: "110px" }}>
                    Google
                  </th>
                  <th scope="col" style={{ padding: "0 0 12px 0", width: "230px" }}>
                    <span className="au-sr">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className={r.cls} style={{ display: r.display, boxShadow: "inset 0 -1px 0 var(--line)" }}>
                      <td className="au-c-user" style={{ padding: "18px 16px 18px 0", verticalAlign: "top", minWidth: "250px", color: r.ink, transition: "color .4s ease-out" }}>
                        <div style={{ fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500" }}>
                          {r.name}
                        </div>
                        <div style={{ marginTop: "3px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ink-3)" }}>
                          {r.email}
                          <span className={r.gSmCls} style={{ display: "none", verticalAlign: "-3px", marginLeft: "8px" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
                              <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
                            </svg>
                            <span className="au-sr">
                              Google linked
                            </span>
                          </span>
                        </div>
                        <div className="au-meta" style={{ display: "none", marginTop: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ink-2)" }}>
                          {r.role}{' '}·{' '}{r.status}
                          <span style={{ color: r.noteInk }}>
                            {r.metaNote}
                          </span>
                        </div>
                      </td>
                      <td className="au-c-acc" style={{ padding: "18px 16px 18px 0", verticalAlign: "top", fontSize: "14.5px", lineHeight: "1.4", color: r.accInk, whiteSpace: "nowrap", transition: "color .4s ease-out" }}>
                        {r.account}
                      </td>
                      <td className={`au-c-role ${r.roleCellCls}`} style={{ padding: "18px 16px 18px 0", verticalAlign: "top", fontSize: "14.5px", lineHeight: "1.4", color: r.ink, transition: "color .4s ease-out" }}>
                        <div className="au-open" style={{ display: r.editDisplay, flexWrap: "wrap", alignItems: "center", gap: "8px", margin: "-9px 0 -9px" }}>
                          <label htmlFor={`role-${r.id}`} className="au-sr">
                            {r.editLabel}
                          </label>
                          <div style={{ position: "relative", width: "186px" }}>
                            <select id={`role-${r.id}`} className="a-field" value={r.editVal} onChange={r.setEdit} style={{ width: "100%", height: "36px", padding: "0 36px 0 12px", borderRadius: "10px", border: "1px solid var(--night-indigo)", background: "var(--field-white)", fontSize: "14.5px", color: "var(--night-indigo)" }}>
                              <option value="Student">
                                Student
                              </option>
                              <option value="Lecturer">
                                Lecturer
                              </option>
                              <option value="Administrator">
                                Administrator
                              </option>
                            </select>
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "12px", top: "10px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </div>
                          <button type="button" className="a-btn a-btn-primary" aria-disabled={r.saveOff} onClick={r.save} style={{ height: "36px", padding: "0 14px", border: "0", borderRadius: "10px", background: "var(--night-indigo)", color: "var(--ivory)", fontSize: "14px", fontWeight: "500", boxShadow: "0 8px 18px -10px rgba(15,22,48,0.55)" }}>
                            Save role
                          </button>
                          <button type="button" className="a-btn a-btn-quiet" onClick={r.cancel} style={{ height: "36px", padding: "0 10px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ink-2)", fontSize: "14px", fontWeight: "500" }}>
                            Cancel
                          </button>
                        </div>
                        <span className={r.roleCls} style={{ display: r.roleDisplay }}>
                          {r.role}
                        </span>
                        <div className="a-just" style={{ marginTop: "4px", display: r.roleJustDisplay, justifyContent: "flex-start", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade-ink)" }}>
                          <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                          just now
                        </div>
                      </td>
                      <td className="au-c-status" style={{ padding: "18px 16px 18px 0", verticalAlign: "top", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", lineHeight: "1.35", color: r.statusInk }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.activeDisplay }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                          </svg>
                          <span className={r.pendCls} style={{ display: r.pendDisplay }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-2)", strokeWidth: "1.5" }} />
                            </svg>
                          </span>
                          <span className={r.markCls} style={{ display: r.offDisplay }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.5" }} />
                            </svg>
                          </span>
                          <span className={r.statusCls} style={{ display: "inline-block" }}>
                            {r.status}
                          </span>
                        </span>
                        <div style={{ display: r.noteDisplay, marginTop: "4px", paddingLeft: "23px", fontSize: "13.5px", lineHeight: "1.4", color: r.noteInk }}>
                          {r.note}
                        </div>
                        <div style={{ display: r.statusJustDisplay, paddingLeft: "23px" }}>
                          <div className="a-just" style={{ marginTop: "4px", display: "flex", justifyContent: "flex-start", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade-ink)" }}>
                            <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                            just now
                          </div>
                        </div>
                      </td>
                      <td className="au-c-google" style={{ padding: "18px 16px 18px 0", verticalAlign: "top", fontSize: "14.5px", lineHeight: "1.4", whiteSpace: "nowrap" }}>
                        <span style={{ display: r.linkedDisplay, alignItems: "center", gap: "8px", color: r.ink }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
                            <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
                          </svg>
                          Linked
                        </span>
                        <span style={{ display: r.notLinkedDisplay, color: "var(--ink-3)" }}>
                          <span aria-hidden="true">
                            –
                          </span>
                          <span className="au-sr">
                            Not linked
                          </span>
                        </span>
                      </td>
                      <td className="au-c-act" style={{ padding: "12px 0 12px 0", verticalAlign: "top", textAlign: "right", whiteSpace: "nowrap" }}>
                        <span style={{ display: r.selfDisplay, paddingTop: "6px", fontSize: "13.5px", color: "var(--ink-3)" }}>
                          You
                        </span>
                        <span style={{ display: r.actDisplay, gap: "8px" }}>
                          <button type="button" className="a-btn a-btn-danger" aria-label={r.deactLabel} aria-expanded={r.confirming} onClick={r.ask} style={{ height: "36px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--red-ink)", background: "transparent", color: "var(--red-ink)", fontSize: "14px", fontWeight: "500" }}>
                            Deactivate
                          </button>
                          <button type="button" className="a-btn a-btn-secondary" aria-label={r.roleLabel} aria-expanded={r.editing} onClick={r.edit} style={{ display: r.roleBtnDisplay, height: "36px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", color: "var(--night-indigo)", fontSize: "14px", fontWeight: "500" }}>
                            Change role
                          </button>
                        </span>
                      </td>
                    </tr>
                    <tr style={{ display: r.confirmDisplay }}>
                      <td colSpan="6" style={{ padding: "6px 0 22px" }}>
                        <div className={`a-night ${r.confirmCls}`} role="group" aria-label={r.deactLabel} style={{ position: "sticky", left: "0", maxWidth: "calc(100vw - 40px)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "18px 40px", padding: "22px 24px", borderRadius: "20px", backgroundColor: "var(--night-indigo)", backgroundImage: "radial-gradient(420px 260px at 100% 0%, var(--jade-wash), rgba(15,22,48,0) 70%)", color: "var(--ivory)", boxShadow: "0 24px 48px -28px rgba(15,22,48,0.7)" }}>
                          <div style={{ flex: "1 1 340px", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
                            <p style={{ fontSize: "18px", lineHeight: "1.35", fontWeight: "500" }}>
                              Deactivate{' '}{r.name}?
                            </p>
                            <p style={{ fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                              They can no longer sign in. Their exam attempts, scores and audit entries stay.
                            </p>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                            <button type="button" className="a-btn a-btn-quiet" onClick={r.keep} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500" }}>
                              Keep active
                            </button>
                            <button type="button" className="a-btn au-night-danger" aria-disabled={r.busy} onClick={r.confirm} style={{ height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--ember-text)", background: "transparent", color: "var(--ember-text)", fontSize: "15px", fontWeight: "500", display: "inline-flex", alignItems: "center", gap: "10px" }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", display: r.busyDisplay, fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }}>
                                <path className="au-spin" d="M12 3a9 9 0 1 1-9 9" />
                              </svg>
                              {r.confirmText}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
                <tr style={{ display: v.emptyDisplay }}>
                  <td colSpan="6" style={{ padding: "28px 0 12px" }}>
                    <div style={{ position: "sticky", left: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
                      <p style={{ fontSize: "15px", color: "var(--ink-2)" }}>
                        No users match these filters.
                      </p>
                      <button type="button" className="a-btn a-btn-quiet" onClick={v.clear} style={{ height: "44px", padding: "0 14px", marginLeft: "-14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)" }}>
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <SampleNote style={{ marginTop: '32px', paddingTop: '0', fontSize: '13px', color: 'var(--ink-3)' }}>All names, emails and counts on this page are sample data.</SampleNote>
      </main>
    </div>
  )
}
