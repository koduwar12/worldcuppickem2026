'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'F']
const ROUND_LABEL = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  F: 'Final'
}

export default function KnockoutPage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [user, setUser] = useState(null)

  const [matches, setMatches] = useState([])
  const [selections, setSelections] = useState({}) // { [matchId]: teamId }
  const [submittedAt, setSubmittedAt] = useState(null)

  // button animation state
  const [savingState, setSavingState] = useState('idle') // idle | saving | saved | submitted | error

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: auth } = await supabase.auth.getUser()
      const u = auth?.user ?? null
      setUser(u)

      if (!u) {
        setMsg('Please sign in first.')
        setLoading(false)
        return
      }

      const [mRes, pRes] = await Promise.all([
        supabase
          .from('knockout_matches')
          .select(`
            id, round, match_no, home_team_id, away_team_id, is_final,
            home:home_team_id ( id, name ),
            away:away_team_id ( id, name )
          `),
        supabase
          .from('knockout_picks')
          .select('match_id, picked_winner_team_id, submitted_at')
          .eq('user_id', u.id)
      ])

      if (mRes.error || pRes.error) {
        setMsg(mRes.error?.message || pRes.error?.message || 'Error loading knockout.')
        setLoading(false)
        return
      }

      const msRaw = mRes.data ?? []
      const ms = msRaw
        .slice()
        .sort((a, b) => {
          const ra = ROUND_ORDER.indexOf(a.round)
          const rb = ROUND_ORDER.indexOf(b.round)
          const rCmp = (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb)
          if (rCmp !== 0) return rCmp
          return (a.match_no ?? 0) - (b.match_no ?? 0)
        })

      const ps = pRes.data ?? []

      setMatches(ms)

      const seed = {}
      let sub = null
      for (const p of ps) {
        if (p.picked_winner_team_id) seed[p.match_id] = String(p.picked_winner_team_id)
        if (p.submitted_at) sub = p.submitted_at
      }
      setSelections(seed)
      setSubmittedAt(sub)

      setLoading(false)
    })()
  }, [])

  const matchesByRound = useMemo(() => {
    const map = {}
    for (const r of ROUND_ORDER) map[r] = []
    for (const m of matches) {
      if (!map[m.round]) map[m.round] = []
      map[m.round].push(m)
    }
    return map
  }, [matches])

  const locked = !!submittedAt

  function pick(matchId, teamId) {
    if (locked) return
    setSelections(prev => ({ ...prev, [matchId]: String(teamId) }))
  }

  async function saveDraft() {
    if (!user) return
    if (locked) {
      setMsg('Submitted and locked 🔒')
      return
    }
    if (savingState === 'saving') return

    setSavingState('saving')
    setMsg('')

    try {
      // Save only picks that have a selection
      const rows = Object.entries(selections).map(([matchId, teamId]) => ({
        user_id: user.id,
        match_id: Number(matchId),
        picked_winner_team_id: teamId,
        submitted_at: null
      }))

      if (rows.length === 0) {
        setSavingState('idle')
        setMsg('Pick at least one winner before saving.')
        return
      }

      // safer if you have a unique constraint on (user_id, match_id)
      const { error } = await supabase
        .from('knockout_picks')
        .upsert(rows, { onConflict: 'user_id,match_id' })

      if (error) throw error

      setSavingState('saved')
      setMsg('Draft saved ✅')
      setTimeout(() => setSavingState('idle'), 1400)
    } catch (e) {
      setSavingState('error')
      setMsg(e?.message || 'Save failed.')
      setTimeout(() => setSavingState('idle'), 1600)
    }
  }

  async function submit() {
    if (!user) return
    if (locked) return
    if (savingState === 'saving') return

    // Only require picks where BOTH teams exist
    const required = matches.filter(m => m.home?.id && m.away?.id)
    const missing = required.filter(m => !selections[m.id])

    if (missing.length > 0) {
      setMsg('Pick a winner for every posted knockout match before submitting.')
      return
    }

    const now = new Date().toISOString()
    setSavingState('saving')
    setMsg('')

    try {
      const rows = required.map(m => ({
        user_id: user.id,
        match_id: m.id,
        picked_winner_team_id: String(selections[m.id]),
        submitted_at: now
      }))

      const { error } = await supabase
        .from('knockout_picks')
        .upsert(rows, { onConflict: 'user_id,match_id' })

      if (error) throw error

      setSubmittedAt(now)
      setSavingState('submitted')
      setMsg('Submitted ✅ (locked 🔒)')
      setTimeout(() => setSavingState('idle'), 1800)
    } catch (e) {
      setSavingState('error')
      setMsg(e?.message || 'Submit failed.')
      setTimeout(() => setSavingState('idle'), 1600)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading…</p></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ margin: 0 }}>{msg || 'Please sign in.'}</p>
          <div className="nav" style={{ marginTop: 12 }}>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/picks">👉 Group Picks</a>
        <a className="pill" href="/standings">📊 Standings</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Knockout Picks</h1>
      <p className="sub">
        Tap a team to pick the winner. Save drafts anytime. Submit locks 🔒
      </p>

      {locked && (
        <div className="badge" style={{ marginTop: 10 }}>
          🔒 Submitted on {new Date(submittedAt).toLocaleString()}
        </div>
      )}

      {msg && <div className="badge" style={{ marginTop: 10 }}>{msg}</div>}

      {ROUND_ORDER.map(r => (
        <div key={r} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle" style={{ marginTop: 0 }}>{ROUND_LABEL[r] || r}</h2>

          {(matchesByRound[r] ?? []).length === 0 && (
            <p className="cardSub">No matches posted yet.</p>
          )}

          {(matchesByRound[r] ?? []).map(m => {
            const home = m.home
            const away = m.away
            const canPick = !!(home?.id && away?.id)
            const chosen = selections[m.id] ? String(selections[m.id]) : ''

            const homeChosen = chosen && home?.id && chosen === String(home.id)
            const awayChosen = chosen && away?.id && chosen === String(away.id)

            return (
              <div
                key={m.id}
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.10)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
                    Match {m.match_no}
                  </div>
                  {m.is_final && (
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
                      ✅ Final
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 6, fontWeight: 900 }}>
                  {home?.name ?? 'TBD'} vs {away?.name ?? 'TBD'}
                </div>

                {!canPick && (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                    Teams not set yet by admin.
                  </div>
                )}

                <div
                  style={{
                    marginTop: 10,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10
                  }}
                >
                  <button
                    className="btn"
                    disabled={locked || !canPick}
                    onClick={() => pick(m.id, home.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 12px',
                      borderRadius: 14,
                      fontWeight: 900,
                      background: homeChosen ? 'rgba(56,189,248,.18)' : 'rgba(0,0,0,.20)',
                      border: homeChosen
                        ? '1px solid rgba(56,189,248,.35)'
                        : '1px solid rgba(255,255,255,.10)'
                    }}
                  >
                    {home?.name ?? 'TBD'} {homeChosen ? ' ✅' : ''}
                  </button>

                  <button
                    className="btn"
                    disabled={locked || !canPick}
                    onClick={() => pick(m.id, away.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 12px',
                      borderRadius: 14,
                      fontWeight: 900,
                      background: awayChosen ? 'rgba(56,189,248,.18)' : 'rgba(0,0,0,.20)',
                      border: awayChosen
                        ? '1px solid rgba(56,189,248,.35)'
                        : '1px solid rgba(255,255,255,.10)'
                    }}
                  >
                    {away?.name ?? 'TBD'} {awayChosen ? ' ✅' : ''}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      <div style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          className={`btn ${savingState === 'saving' ? 'btnLocked' : ''} ${savingState === 'saved' ? 'btnGlow' : ''}`}
          disabled={locked || savingState === 'saving'}
          onClick={saveDraft}
        >
          {savingState === 'saving'
            ? '🔒 Saving…'
            : savingState === 'saved'
            ? '✓ Saved'
            : savingState === 'error'
            ? '⚠️ Error'
            : 'Save Draft'}
        </button>

        <button
          className={`btn btnPrimary ${savingState === 'saving' ? 'btnLocked' : ''} ${
            savingState === 'submitted' ? 'btnGlowStrong' : ''
          }`}
          disabled={locked || savingState === 'saving'}
          onClick={submit}
        >
          {savingState === 'saving'
            ? '🔒 Submitting…'
            : savingState === 'submitted'
            ? '🏁 Submitted!'
            : savingState === 'error'
            ? '⚠️ Error'
            : 'Submit Knockout Picks (Locks 🔒)'}
        </button>
      </div>

      <style jsx>{`
        .btnLocked {
          opacity: 0.75;
        }
        .btnGlow {
          animation: glow 1.2s ease-out;
        }
        .btnGlowStrong {
          animation: glowStrong 1.35s ease-out;
        }
        @keyframes glow {
          0% {
            box-shadow: 0 0 0 rgba(56, 189, 248, 0);
          }
          50% {
            box-shadow: 0 0 24px rgba(56, 189, 248, 0.55);
          }
          100% {
            box-shadow: 0 0 0 rgba(56, 189, 248, 0);
          }
        }
        @keyframes glowStrong {
          0% {
            box-shadow: 0 0 0 rgba(34, 197, 94, 0);
          }
          50% {
            box-shadow: 0 0 28px rgba(34, 197, 94, 0.65);
          }
          100% {
            box-shadow: 0 0 0 rgba(34, 197, 94, 0);
          }
        }
      `}</style>
    </div>
  )
}
