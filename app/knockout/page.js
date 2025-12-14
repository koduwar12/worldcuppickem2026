'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'F']

export default function AdminKnockoutPage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [teams, setTeams] = useState([])
  const [matches, setMatches] = useState([])

  // local drafts for scores
  const [draftScores, setDraftScores] = useState({}) // matchId -> {home:'', away:''}

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

      const { data: adminRow, error: adminErr } = await supabase
        .from('admin_emails')
        .select('email')
        .eq('email', u.email)
        .maybeSingle()

      if (adminErr) {
        setMsg(adminErr.message)
        setLoading(false)
        return
      }

      if (!adminRow) {
        setMsg('Not authorized (admin only).')
        setLoading(false)
        return
      }

      setIsAdmin(true)

      const [tRes, mRes] = await Promise.all([
        supabase.from('teams').select('id,name,group_id').order('name'),
        supabase
          .from('knockout_matches')
          .select(`
            id, round, match_no, home_team_id, away_team_id,
            home_score, away_score, is_final, winner_team_id,
            home:home_team_id ( id, name ),
            away:away_team_id ( id, name ),
            winner:winner_team_id ( id, name )
          `)
          .order('round', { ascending: true })
          .order('match_no', { ascending: true })
      ])

      if (tRes.error || mRes.error) {
        setMsg(tRes.error?.message || mRes.error?.message || 'Error loading')
        setLoading(false)
        return
      }

      setTeams(tRes.data ?? [])
      const rows = mRes.data ?? []
      setMatches(rows)

      const init = {}
      for (const m of rows) {
        init[m.id] = {
          home: m.home_score === null || m.home_score === undefined ? '' : String(m.home_score),
          away: m.away_score === null || m.away_score === undefined ? '' : String(m.away_score)
        }
      }
      setDraftScores(init)

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

  function setDraft(matchId, side, value) {
    if (value !== '' && !/^\d+$/.test(value)) return
    setDraftScores(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? { home: '', away: '' }), [side]: value }
    }))
  }

  async function updateMatch(matchId, patch) {
    setMsg('Saving...')
    const { error, data } = await supabase
      .from('knockout_matches')
      .update(patch)
      .eq('id', matchId)
      .select(`
        id, round, match_no, home_team_id, away_team_id,
        home_score, away_score, is_final, winner_team_id,
        home:home_team_id ( id, name ),
        away:away_team_id ( id, name ),
        winner:winner_team_id ( id, name )
      `)
      .single()

    if (error) {
      setMsg(error.message)
      return
    }

    setMatches(prev => prev.map(m => (m.id === matchId ? data : m)))
    setMsg('Saved ✅')
  }

  async function saveScores(matchId) {
    const d = draftScores[matchId] ?? { home: '', away: '' }
    const homeVal = d.home === '' ? null : Number(d.home)
    const awayVal = d.away === '' ? null : Number(d.away)

    await updateMatch(matchId, { home_score: homeVal, away_score: awayVal })
  }

  async function finalize(matchId) {
    const m = matches.find(x => x.id === matchId)
    const d = draftScores[matchId] ?? { home: '', away: '' }
    if (!m?.home_team_id || !m?.away_team_id) {
      setMsg('Set both teams before finalizing.')
      return
    }
    if (d.home === '' || d.away === '') {
      setMsg('Enter both scores before finalizing.')
      return
    }
    if (Number(d.home) === Number(d.away)) {
      setMsg('Knockout games cannot end in a draw. Use a winner score.')
      return
    }

    // Save scores first
    await saveScores(matchId)

    const winnerId = Number(d.home) > Number(d.away) ? m.home_team_id : m.away_team_id
    await updateMatch(matchId, { is_final: true, winner_team_id: winnerId })
  }

  async function unfinalize(matchId) {
    await updateMatch(matchId, { is_final: false, winner_team_id: null })
  }

  if (loading) {
    return <main style={{ padding: 24 }}><p>Loading...</p></main>
  }

  if (!user || !isAdmin) {
    return (
      <main style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <a href="/">Home</a>
          <a href="/leaderboard">Leaderboard</a>
        </div>
        <h1>Admin Knockout</h1>
        <p>{msg || 'Not authorized.'}</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <a href="/">Home</a>
        <a href="/standings">Standings</a>
        <a href="/leaderboard">Leaderboard</a>
        <a href="/knockout">Knockout Picks</a>
      </div>

      <h1>Admin — Knockout Bracket</h1>
      {msg && <p>{msg}</p>}

      {ROUND_ORDER.map(r => (
        <section key={r} style={{ marginTop: 18 }}>
          <h2>{r}</h2>

          {(matchesByRound[r] ?? []).map(m => {
            const d = draftScores[m.id] ?? { home: '', away: '' }

            return (
              <div key={m.id} style={{ border: '1px solid #ddd', padding: 12, marginTop: 10, maxWidth: 720 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Match {m.match_no} {m.is_final ? '• FINAL ✅' : ''}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 1fr', gap: 10, alignItems: 'center', marginTop: 10 }}>
                  <select
                    disabled={m.is_final}
                    value={m.home_team_id ?? ''}
                    onChange={e => updateMatch(m.id, { home_team_id: e.target.value ? Number(e.target.value) : null })}
                    style={{ padding: 8 }}
                  >
                    <option value="">Home team…</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Home"
                    value={d.home}
                    disabled={m.is_final}
                    onChange={e => setDraft(m.id, 'home', e.target.value)}
                    style={{ padding: 8 }}
                  />

                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Away"
                    value={d.away}
                    disabled={m.is_final}
                    onChange={e => setDraft(m.id, 'away', e.target.value)}
                    style={{ padding: 8 }}
                  />

                  <select
                    disabled={m.is_final}
                    value={m.away_team_id ?? ''}
                    onChange={e => updateMatch(m.id, { away_team_id: e.target.value ? Number(e.target.value) : null })}
                    style={{ padding: 8 }}
                  >
                    <option value="">Away team…</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
                  <button disabled={m.is_final} onClick={() => saveScores(m.id)}>Save Scores</button>
                  {!m.is_final ? (
                    <button onClick={() => finalize(m.id)}>Finalize (sets winner)</button>
                  ) : (
                    <button onClick={() => unfinalize(m.id)}>Unfinalize</button>
                  )}
                  {m.winner?.name && (
                    <span style={{ fontSize: 12, opacity: 0.8 }}>
                      Winner: <strong>{m.winner.name}</strong>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </main>
  )
}
