'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'F']

export default function KnockoutPicksPage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [user, setUser] = useState(null)

  const [matches, setMatches] = useState([])
  const [picks, setPicks] = useState([])

  // selections[matchId] = teamId
  const [selections, setSelections] = useState({})
  const [submittedAt, setSubmittedAt] = useState(null)

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
            id, round, match_no, is_final, winner_team_id,
            home:home_team_id ( id, name ),
            away:away_team_id ( id, name )
          `)
          .order('round', { ascending: true })
          .order('match_no', { ascending: true }),
        supabase
          .from('knockout_picks')
          .select('match_id, picked_winner_team_id, submitted_at')
          .eq('user_id', u.id)
      ])

      if (mRes.error || pRes.error) {
        setMsg(mRes.error?.message || pRes.error?.message || 'Error loading knockout')
        setLoading(false)
        return
      }

      const ms = mRes.data ?? []
      const ps = pRes.data ?? []

      setMatches(ms)
      setPicks(ps)

      const seed = {}
      let sub = null
      for (const p of ps) {
        seed[p.match_id] = p.picked_winner_team_id
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

  async function saveDraft() {
    if (!user) return
    if (locked) {
      setMsg('Submitted and locked.')
      return
    }

    setMsg('Saving...')
    const rows = Object.entries(selections).map(([matchId, teamId]) => ({
      user_id: user.id,
      match_id: Number(matchId),
      picked_winner_team_id: Number(teamId),
      submitted_at: null
    }))

    const { error } = await supabase.from('knockout_picks').upsert(rows)
    setMsg(error ? error.message : 'Draft saved ✅')
  }

  async function submit() {
    if (!user) return
    if (locked) return

    // Require picks only for matches that have both teams set
    const required = matches.filter(m => m.home?.id && m.away?.id)
    const missing = required.filter(m => !selections[m.id])
    if (missing.length > 0) {
      setMsg('Pick a winner for every posted knockout match before submitting.')
      return
    }

    const now = new Date().toISOString()
    setMsg('Submitting...')

    const rows = required.map(m => ({
      user_id: user.id,
      match_id: m.id,
      picked_winner_team_id: Number(selections[m.id]),
      submitted_at: now
    }))

    const { error } = await supabase.from('knockout_picks').upsert(rows)
    if (error) {
      setMsg(error.message)
      return
    }

    setSubmittedAt(now)
    setMsg('Submitted ✅ (locked)')
  }

  if (loading) {
    return <main style={{ padding: 24 }}><p>Loading...</p></main>
  }

  if (msg && !user) {
    return (
      <main style={{ padding: 24 }}>
        <p>{msg}</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <a href="/">Home</a>
        <a href="/leaderboard">Leaderboard</a>
        <a href="/standings">Standings</a>
      </div>

      <h1>Knockout Picks</h1>

      {locked ? (
        <p style={{ padding: 10, background: '#f2f2f2' }}>
          Submitted on {new Date(submittedAt).toLocaleString()} — locked 🔒
        </p>
      ) : (
        <p style={{ padding: 10, background: '#f2f2f2' }}>
          Pick winners for the posted matches. Save drafts anytime. Submit locks.
        </p>
      )}

      {msg && <p>{msg}</p>}

      {ROUND_ORDER.map(r => (
        <section key={r} style={{ marginTop: 18, padding: 14, border: '1px solid #ddd', maxWidth: 720 }}>
          <h2 style={{ marginTop: 0 }}>{r}</h2>

          {(matchesByRound[r] ?? []).map(m => {
            const home = m.home
            const away = m.away
            const canPick = home?.id && away?.id

            return (
              <div key={m.id} style={{ marginTop: 10, padding: 12, border: '1px solid #eee' }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Match {m.match_no} {m.is_final ? '• Final ✅' : ''}
                </div>

                <div style={{ marginTop: 6, fontWeight: 600 }}>
                  {home?.name ?? 'TBD'} vs {away?.name ?? 'TBD'}
                </div>

                <div style={{ marginTop: 10 }}>
                  <select
                    disabled={locked || !canPick}
                    value={selections[m.id] ?? ''}
                    onChange={e =>
                      setSelections(prev => ({ ...prev, [m.id]: e.target.value }))
                    }
                    style={{ padding: 8, width: '100%', maxWidth: 420 }}
                  >
                    <option value="">
                      {canPick ? 'Select winner…' : 'Teams not set yet'}
                    </option>
                    {canPick && (
                      <>
                        <option value={home.id}>{home.name}</option>
                        <option value={away.id}>{away.name}</option>
                      </>
                    )}
                  </select>
                </div>

                {m.is_final && m.winner_team_id && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    Actual winner: <strong>{m.winner_team_id === home?.id ? home?.name : away?.name}</strong>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      ))}

      <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
        <button disabled={locked} onClick={saveDraft}>Save Draft</button>
        <button disabled={locked} onClick={submit}>Submit Knockout Picks (Locks 🔒)</button>
      </div>
    </main>
  )
}
