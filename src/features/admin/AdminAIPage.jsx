import { Fragment, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { adminApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useSpeech } from '../../hooks/useSpeech.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import { formatDay, formatTime } from '../../utils/format.js'
import { PENDING } from '../../utils/pending.js'
import './AdminAI.css'

const PROV = [
  { k: 'stt', title: 'Speech-to-text (STT)', name: 'speech-to-text', what: '', change: 'STT' },
  { k: 'tts', title: 'Text-to-speech (TTS)', name: 'text-to-speech', what: '', change: 'TTS' },
  { k: 'llm', title: 'Language model', name: 'the language model', what: 'Asks the follow-up questions and suggests scores.', change: 'language model' },
]
const LANG = { vi: 'Vietnamese', en: 'English' }
const SAMPLE = {
  vi: 'Câu hỏi một: kiến trúc phân lớp khác gì so với modular monolith?',
  en: 'Question one: what is the difference between a layered architecture and a modular monolith?',
}
const STEPS = 40
function wave(seed) {
  const out = []
  for (let i = 0; i < STEPS; i++) {
    const env = Math.sin(Math.PI * (i + 0.5) / STEPS)
    const x = Math.abs(Math.sin(i * 0.9 + seed) * 0.6 + Math.sin(i * 0.37 + seed * 3) * 0.4)
    out.push(Math.round(6 + 30 * Math.pow(env, 0.6) * (0.3 + 0.7 * x)))
  }
  return out
}
const WAVE = { vi: wave(1.3), en: wave(4.1) }
const EMPTY = { stt: '', tts: '', llm: '' }
const invalid = (val) => { const t = (val || '').trim(); return t !== '' && !/^https:\/\/[^\s/]+\.[^\s]+/.test(t) }
const savedLineOf = (cfg) => {
  if (!cfg?.savedAt) return ''
  const day = formatDay(cfg.savedAt)
  return day === 'Today' ? `Saved today at ${formatTime(cfg.savedAt)} by ${cfg.savedByName}` : `Last saved ${day} by ${cfg.savedByName}`
}

// Speech language for STT/TTS and the AI providers with their keys and endpoints (F7).
// Keys are write-only: the page shows that one is stored, never the key itself.
export default function AdminAIPage() {
  const { data: cfg, setData } = useLoad(() => adminApi.aiSettings(), [])
  const { speak, cancel } = useSpeech()
  const { later } = useTimeouts()
  const [s, put] = useMergeState({ lang: null, keys: { stt: 'saved', tts: 'saved', llm: 'saved' }, drafts: { ...EMPTY }, eps: null, touched: {}, tried: false, saving: false, savedNow: false, okFlash: false, justKeys: {}, playing: false, pos: 0, langFlip: false, error: null })
  useEffect(() => {
    if (cfg && s.lang === null) put({ lang: cfg.language, eps: { stt: cfg.providers.stt.endpoint, tts: cfg.providers.tts.endpoint, llm: cfg.providers.llm.endpoint } })
  }, [cfg, s.lang, put])
  // the sample bars move with the reading; a real voice plays when the browser has one
  useEffect(() => {
    if (!s.playing) return undefined
    const iv = setInterval(() => put((p) => (p.pos + 1 >= STEPS ? { playing: false, pos: 0 } : { pos: p.pos + 1 })), 150)
    return () => clearInterval(iv)
  }, [s.playing, put])
  useEffect(() => cancel, [cancel])
  if (!cfg || s.lang === null) {
    return (
      <div className="pg-adminai" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <StaffTopBar current="ai" />
      </div>
    )
  }
  const savedLang = cfg.language
  const savedEps = { stt: cfg.providers.stt.endpoint, tts: cfg.providers.tts.endpoint, llm: cfg.providers.llm.endpoint }
  const ch = []
  if (s.lang !== savedLang) ch.push(`speech language (${LANG[s.lang]})`)
  PROV.forEach((p) => {
    if (s.keys[p.k] === 'replacing' && s.drafts[p.k].trim()) ch.push(`${p.change} key`)
    if (s.eps[p.k].trim() !== savedEps[p.k].trim()) ch.push(`${p.change} endpoint`)
  })
  const dirty = ch.length > 0
  const bad = PROV.filter((p) => invalid(s.eps[p.k]))
  const n = ch.length
  const tick = n % 2 ? 'a-tick-a' : 'a-tick-b'
  const stopPlay = () => { cancel(); put({ playing: false, pos: 0 }) }
  const play = () => {
    if (s.playing) { stopPlay(); return }
    put({ playing: true, pos: 0 })
    speak(SAMPLE[s.lang], { lang: s.lang === 'vi' ? 'vi-VN' : 'en-US' })
  }
  const pickLang = (code) => {
    if (s.lang === code) return
    cancel()
    put((p) => ({ lang: code, playing: false, pos: 0, langFlip: !p.langFlip, savedNow: false }))
  }
  const save = async () => {
    if (s.saving || !dirty) return
    if (bad.length) {
      const touched = { ...s.touched }
      bad.forEach((p) => { touched[p.k] = true })
      put({ tried: true, touched })
      return
    }
    put({ saving: true, tried: false, error: null })
    try {
      const providers = Object.fromEntries(PROV.map((p) => [p.k, { endpoint: s.eps[p.k].trim(), ...(s.keys[p.k] === 'replacing' && s.drafts[p.k].trim() ? { key: s.drafts[p.k].trim() } : {}) }]))
      const next = await atLeast(adminApi.saveAiSettings({ language: s.lang, providers }), 900)
      const justKeys = {}
      PROV.forEach((p) => { if (s.keys[p.k] === 'replacing' && s.drafts[p.k].trim()) justKeys[p.k] = true })
      setData(next)
      put({ saving: false, keys: { stt: 'saved', tts: 'saved', llm: 'saved' }, drafts: { ...EMPTY }, justKeys, savedNow: true, okFlash: true, touched: {} })
      later(() => put({ okFlash: false }), 1800)
    } catch (e) {
      put({ saving: false, error: e.message })
    }
  }
  const discard = () => put((p) => ({ lang: savedLang, eps: { ...savedEps }, keys: { stt: 'saved', tts: 'saved', llm: 'saved' }, drafts: { ...EMPTY }, touched: {}, tried: false, langFlip: p.lang !== savedLang ? !p.langFlip : p.langFlip }))
  const bars = WAVE[s.lang].map((h, i) => ({ h: `${h}px`, bg: s.playing && i <= s.pos ? 'var(--lantern-gold)' : 'rgba(246,241,231,0.28)' }))
  const secs = Math.min(6, Math.floor(s.pos * 0.15))
  const langs = ['vi', 'en'].map((code) => {
    const on = s.lang === code
    return {
      code, name: LANG[code], checked: on, open: !on,
      ink: on ? 'var(--ivory)' : 'var(--ivory-3)',
      weight: on ? 300 : 200,
      sub: on ? (code === savedLang ? 'In use for every exam' : 'Chosen, not saved yet') : '',
      subInk: on && code !== savedLang ? 'var(--ivory)' : 'var(--ivory-2)',
      subWeight: on && code !== savedLang ? 500 : 400,
      hasSub: on,
      pick: () => pickLang(code),
    }
  })
  const providers = PROV.map((p) => {
    const showErr = invalid(s.eps[p.k]) && !!s.touched[p.k]
    return {
      key: p.k, title: p.title, what: p.what, hasWhat: !!p.what, epPh: `https://${p.k}.example.edu/v1`,
      idProv: `${p.k}-prov`, idKey: `${p.k}-key`, idKeyLbl: `${p.k}-key-l`, idEp: `${p.k}-ep`, idErr: `${p.k}-ep-err`,
      keySaved: s.keys[p.k] === 'saved', keyReplacing: s.keys[p.k] === 'replacing',
      justKey: s.keys[p.k] === 'saved' && !!s.justKeys[p.k],
      draft: s.drafts[p.k], keepLabel: `Keep the saved ${p.change} key`,
      onDraft: (e) => put((q) => ({ drafts: { ...q.drafts, [p.k]: e.target.value }, savedNow: false })),
      replace: () => put((q) => ({ keys: { ...q.keys, [p.k]: 'replacing' }, justKeys: { ...q.justKeys, [p.k]: false } })),
      keep: () => put((q) => ({ keys: { ...q.keys, [p.k]: 'saved' }, drafts: { ...q.drafts, [p.k]: '' } })),
      ep: s.eps[p.k],
      onEp: (e) => put((q) => ({ eps: { ...q.eps, [p.k]: e.target.value }, savedNow: false })),
      blurEp: () => { if (s.eps[p.k].trim()) put((q) => ({ touched: { ...q.touched, [p.k]: true } })) },
      epInvalid: showErr ? 'true' : 'false',
      showErr,
    }
  })
  const v = {
    dirty, clean: !dirty,
    statusText: dirty ? `${n} ${n === 1 ? 'change' : 'changes'} not saved` : savedLineOf(cfg),
    statusInk: dirty ? 'var(--ink-3)' : 'var(--ink-2)',
    statusWeight: dirty ? 500 : 400,
    statusCls: dirty ? tick : s.savedNow ? 'a-rise' : '',
    moonCls: s.savedNow ? 'a-moon-fill' : '',
    showJust: !dirty && s.savedNow,
    langs,
    glow: s.playing ? 1 : 0,
    glowCls: s.playing ? 'ai-glow-on' : '',
    voiceTitle: `${LANG[s.lang]} voice`,
    voiceCls: s.langFlip ? 'a-tick-a' : 'a-tick-b',
    play,
    playing: s.playing, stopped: !s.playing,
    playLabel: s.playing ? 'Stop the voice sample' : `Play a voice sample in ${LANG[s.lang]}`,
    bars,
    timeNow: `0:0${secs}`,
    providers,
    showAlert: s.tried && bad.length > 0,
    alertText: bad.length ? `The endpoint URL for ${bad.map((p) => p.name).join(' and ')} must be a full address that starts with https://.` : '',
    submit: (e) => { e.preventDefault(); save() },
    saveDisabled: !dirty && !s.okFlash && !s.saving ? 'true' : 'false',
    saving: s.saving,
    okFlash: s.okFlash && !dirty && !s.saving,
    saveLabel: s.saving ? 'Saving' : s.okFlash && !dirty ? 'Saved' : 'Save changes',
    saveLabelCls: s.saving || s.okFlash ? 'a-rise' : '',
    discard,
    changeList: ch.join(', '),
    savedLine: !dirty && s.savedNow,
  }
  return (
    <div className="pg-adminai" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <StaffTopBar current="ai" />
      <main className="a-gutter" style={{ flex: "1", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "56px 40px 80px", display: "flex", flexDirection: "column" }}>
        <div className="a-rise a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "20px 40px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" }}>
            <h1 className="a-title" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "44px", lineHeight: "1.08", letterSpacing: "-0.012em", color: "var(--night-indigo)" }}>
              AI and speech
            </h1>
            <p style={{ fontSize: "16.5px", lineHeight: "1.5", color: "var(--ink-2)", maxWidth: "40em" }}>
              Every exam uses these settings. Each saved change is written to the{' '}
              <Link className="a-link" to={paths.adminAudit} style={{ color: "var(--night-indigo)" }}>
                audit log
              </Link>
              .
            </p>
          </div>
          <div className="ai-status" aria-live="polite" style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", paddingBottom: "4px" }}>
            <p style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14.5px", lineHeight: "1.35", color: v.statusInk }}>
              {v.dirty && (
                <>
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.5", strokeDasharray: "2.45 2.45" }} />
                  </svg>
                </>
              )}
              {v.clean && (
                <>
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                    <circle className={v.moonCls} cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                  </svg>
                </>
              )}
              <span className={v.statusCls} style={{ fontWeight: v.statusWeight }}>
                {v.statusText}
              </span>
            </p>
            {v.showJust && (
              <>
                <div className="a-just" style={{ marginTop: "2px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade-ink)" }}>
                  <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                  just now
                </div>
              </>
            )}
          </div>
        </div>
        <form onSubmit={v.submit} style={{ display: "flex", flexDirection: "column" }}>
          <section className="a-night ai-unveil ai-inset" aria-labelledby="lang-h" style={{ position: "relative", overflow: "hidden", marginTop: "48px", padding: "32px 36px 32px", borderRadius: "20px", backgroundColor: "var(--night-indigo)", backgroundImage: "radial-gradient(420px 260px at 100% 0%, var(--jade-wash), rgba(15,22,48,0) 70%)", color: "var(--ivory)", boxShadow: "0 24px 48px -28px rgba(15,22,48,0.7)" }}>
            <div aria-hidden="true" className={`ai-glow ${v.glowCls}`} style={{ position: "absolute", right: "-120px", top: "-80px", width: "760px", height: "460px", pointerEvents: "none", background: "radial-gradient(closest-side, rgba(245,183,0,0.22), rgba(214,120,30,0.08) 55%, rgba(214,120,30,0) 100%)", opacity: v.glow }} />
            <div className="a-grid-1-sm" style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap: "72px", rowGap: "36px", alignItems: "end" }}>
              <fieldset style={{ margin: "0", padding: "0", border: "0", minWidth: "0", display: "flex", flexDirection: "column", gap: "22px" }}>
                <legend id="lang-h" style={{ padding: "0", marginBottom: "8px", fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--ivory)" }}>
                  Speech language
                </legend>
                <p style={{ fontSize: "16px", fontWeight: "300", lineHeight: "1.5", color: "var(--ivory-2)", maxWidth: "30em" }}>
                  AIVES reads every question aloud (TTS) and listens to every answer (STT) in this language.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: "40px", rowGap: "10px" }}>
                  {v.langs.map((l, l_i) => (
                    <Fragment key={l.key ?? l_i}>
                      <label className="ai-opt" style={{ position: "relative", display: "flex", flexDirection: "column", gap: "4px", minHeight: "44px", padding: "4px 4px 4px 0", borderRadius: "10px", color: l.ink }}>
                        <input className="ai-sr" type="radio" name="speech-lang" value={l.code} checked={l.checked} onChange={l.pick} />
                        <span style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                          {l.checked && (
                            <>
                              <svg width="26" height="26" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                                <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                                <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                              </svg>
                            </>
                          )}
                          {l.open && (
                            <>
                              <svg width="26" height="26" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                                <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-3)", strokeWidth: "1.5" }} />
                              </svg>
                            </>
                          )}
                          <span className="ai-lang" style={{ fontSize: "40px", lineHeight: "1.1", fontWeight: l.weight, letterSpacing: "-0.015em" }}>
                            {l.name}
                          </span>
                        </span>
                        {l.hasSub && (
                          <>
                            <span className="a-rise" style={{ paddingLeft: "40px", fontSize: "13.5px", lineHeight: "1.4", fontWeight: l.subWeight, color: l.subInk }}>
                              {l.sub}
                            </span>
                          </>
                        )}
                      </label>
                    </Fragment>
                  ))}
                </div>
              </fieldset>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "0", paddingBottom: "24px" }}>
                <p style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "500", color: "var(--ivory)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
                    <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
                    <path d="M18 6.5a7.8 7.8 0 0 1 0 11" />
                  </svg>
                  <span className={v.voiceCls}>
                    {v.voiceTitle}
                  </span>
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
                  <button type="button" className="a-btn" onClick={v.play} aria-label={v.playLabel} style={{ flex: "none", width: "52px", height: "52px", border: "0", borderRadius: "50%", background: "var(--ivory)", color: "var(--night-indigo)", display: "grid", placeItems: "center", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                    {v.playing && (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "currentColor" }}>
                          <rect x="6" y="5" width="4" height="14" rx="1" />
                          <rect x="14" y="5" width="4" height="14" rx="1" />
                        </svg>
                      </>
                    )}
                    {v.stopped && (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ marginLeft: "3px", fill: "currentColor" }}>
                          <path d="M7 4.5v15l12-7.5z" />
                        </svg>
                      </>
                    )}
                  </button>
                  <div aria-hidden="true" style={{ flex: "1", minWidth: "0", height: "44px", display: "flex", alignItems: "center", gap: "3px" }}>
                    {v.bars.map((b, b_i) => (
                      <Fragment key={b.key ?? b_i}>
                        <span className="ai-bar" style={{ flex: "1", minWidth: "2px", borderRadius: "2px", height: b.h, backgroundColor: b.bg }} />
                      </Fragment>
                    ))}
                  </div>
                </div>
                <p className="a-num" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 16px", fontSize: "13.5px", color: "var(--ivory-2)" }}>
                  <span>
                    <span style={{ fontWeight: "500", color: "var(--ivory)" }}>
                      {v.timeNow}
                    </span>
                    {' '}of 0:06
                  </span>
                  <span>
                    A sample question, read the way students hear it
                  </span>
                </p>
              </div>
            </div>
          </section>
          <section className="ai-in-2" aria-labelledby="prov-h" style={{ marginTop: "72px", display: "flex", flexDirection: "column" }}>
            <div className="a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "10px 24px", paddingBottom: "20px", boxShadow: "inset 0 -1px 0 var(--line-strong)" }}>
              <h2 id="prov-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)" }}>
                AI providers
              </h2>
              <p style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--ink-3)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--jade-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
                  <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
                </svg>
                A saved API key is never shown again.
              </p>
            </div>
            {v.providers.map((p, p_i) => (
              <Fragment key={p.key ?? p_i}>
                <fieldset className="a-grid-1-sm" style={{ margin: "0", padding: "32px 0 34px", border: "0", minWidth: "0", boxShadow: "inset 0 -1px 0 var(--line)", display: "grid", gridTemplateColumns: "236px minmax(0, 1fr)", columnGap: "48px", rowGap: "20px", alignItems: "start" }}>
                  <legend style={{ float: "left", padding: "0", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "18px", lineHeight: "1.3", fontWeight: "500", color: "var(--night-indigo)" }}>
                      {p.title}
                    </span>
                    {p.hasWhat && (
                      <>
                        <span style={{ fontSize: "14.5px", lineHeight: "1.45", fontWeight: "400", color: "var(--ink-2)" }}>
                          {p.what}
                        </span>
                      </>
                    )}
                  </legend>
                  <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.1fr)", gap: "20px 20px", minWidth: "0" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                      <label htmlFor={p.idProv} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                        Provider
                      </label>
                      <div style={{ position: "relative" }}>
                        <select id={p.idProv} className="a-field" style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--ink-3)", textOverflow: "ellipsis" }}>
                          <option>
                            {PENDING.aiProviders}
                          </option>
                        </select>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "14px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                      {p.keySaved && (
                        <>
                          <p id={p.idKeyLbl} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                            API key
                          </p>
                          <div role="group" aria-labelledby={p.idKeyLbl} style={{ height: "44px", display: "flex", alignItems: "center", gap: "10px", padding: "0 4px 0 14px", borderRadius: "10px", border: "1px solid var(--line)", background: "rgba(255,255,255,0.6)" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--jade-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
                              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
                            </svg>
                            <span style={{ flex: "1", minWidth: "0", fontSize: "15px", color: "var(--night-indigo)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              A key is saved
                            </span>
                            <button type="button" className="a-btn a-btn-quiet" onClick={p.replace} style={{ flex: "none", height: "36px", padding: "0 12px", border: "0", borderRadius: "8px", background: "transparent", fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)", textDecoration: "underline", textDecorationColor: "var(--edge)", textUnderlineOffset: "3px" }}>
                              Replace
                            </button>
                          </div>
                          {p.justKey && (
                            <>
                              <div className="a-just" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--jade-ink)" }}>
                                <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                                New key saved just now
                              </div>
                            </>
                          )}
                        </>
                      )}
                      {p.keyReplacing && (
                        <>
                          <label htmlFor={p.idKey} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                            New API key
                          </label>
                          <div className="ai-open" style={{ display: "flex", gap: "6px" }}>
                            <input id={p.idKey} type="password" className="a-field" autoComplete="off" value={p.draft} onChange={p.onDraft} placeholder="Paste the new key" style={{ flex: "1", minWidth: "0", height: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                            <button type="button" className="a-btn a-btn-quiet" onClick={p.keep} aria-label={p.keepLabel} style={{ flex: "none", width: "44px", height: "44px", padding: "0", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ink-2)", display: "grid", placeItems: "center" }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }}>
                                <path d="M6 6l12 12M18 6 6 18" />
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                      <label htmlFor={p.idEp} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                        Endpoint URL
                      </label>
                      <input id={p.idEp} type="text" inputMode="url" className="a-field" autoComplete="off" spellCheck="false" value={p.ep} onChange={p.onEp} onBlur={p.blurEp} aria-invalid={p.epInvalid} aria-describedby={p.idErr} placeholder={p.epPh} style={{ width: "100%", height: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                      {p.showErr && (
                        <>
                          <p id={p.idErr} className="a-rise" style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--red-ink)" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <path d="M12 4 21 19.5H3z" />
                              <path d="M12 10v4.5" />
                              <path d="M12 17.2v.01" />
                            </svg>
                            Use the full address, starting with https://
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </fieldset>
              </Fragment>
            ))}
          </section>
          <div className="ai-in-2" style={{ marginTop: "36px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {v.showAlert && (
              <>
                <div className="a-rise" role="alert" style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "12px", padding: "14px 16px", borderRadius: "12px", background: "var(--red-wash-day)", border: "1px solid rgba(179,48,26,0.28)", maxWidth: "720px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", fill: "none", stroke: "var(--red-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M12 4 21 19.5H3z" />
                    <path d="M12 10v4.5" />
                    <path d="M12 17.2v.01" />
                  </svg>
                  <p style={{ fontSize: "14.5px", lineHeight: "1.5", color: "var(--night-indigo)" }}>
                    <span style={{ fontWeight: "500", color: "var(--red-ink)" }}>
                      Nothing was saved.
                    </span>
                    {' '}{v.alertText}
                  </p>
                </div>
              </>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px" }}>
              <button type="submit" className="a-btn a-btn-primary" aria-disabled={v.saveDisabled} style={{ height: "44px", minWidth: "168px", padding: "0 20px", border: "0", borderRadius: "12px", background: "var(--night-indigo)", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 8px 18px -10px rgba(15,22,48,0.55)" }}>
                {v.saving && (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="ai-spin" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }}>
                      <path d="M12 4a8 8 0 1 1-8 8" />
                    </svg>
                  </>
                )}
                {v.okFlash && (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="a-pop" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </>
                )}
                <span className={v.saveLabelCls}>
                  {v.saveLabel}
                </span>
              </button>
              {v.dirty && (
                <>
                  <button type="button" className="a-btn a-btn-quiet a-rise" onClick={v.discard} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)" }}>
                    Discard changes
                  </button>
                </>
              )}
              <p aria-live="polite" style={{ fontSize: "14.5px", lineHeight: "1.45", color: "var(--ink-2)" }}>
                {v.dirty && (
                  <>
                    <span>
                      Not saved yet:{' '}
                      <span style={{ color: "var(--night-indigo)", fontWeight: "500" }}>
                        {v.changeList}
                      </span>
                    </span>
                  </>
                )}
                {v.savedLine && (
                  <>
                    <span className="a-rise" style={{ display: "inline-block" }}>
                      Saved for every exam from now on. The change is in the{' '}
                      <Link className="a-link" to={paths.adminAudit} style={{ color: "var(--night-indigo)" }}>
                        audit log
                      </Link>
                      .
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </form>
        <SampleNote style={{ marginTop: '32px', paddingTop: '0', fontSize: '13px', color: 'var(--ink-3)' }}>All names, times and keys on this page are sample data.</SampleNote>
      </main>
    </div>
  )
}
