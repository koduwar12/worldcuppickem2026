'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'F']
const ROUND_LABEL = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  F: 'Final'
}

// Match counts per round
const ROUND_MATCH_COUNTS = {
  R32: 16,
  R16: 8,
  QF: 4,
  SF: 2,
  F: 1
}

export default function AdminKnockoutPage() {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [teams, setTeams] = useState([])
  const [matches, setMatches] = useState([])

  // draft[round][match_no] = { home_team_id, away_team_id }
  const [draft, setDraft] = useState({})

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: auth } = await supabase.auth.getUser()
      const u = auth?.user ?? null
      setUser(u)

      if (!u) {
        setMsg('Not authorized.')
        setLoading(false)
        return
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', u.id)
        .maybeSingle()

      if (!prof?.is_admin) {
        setMsg('Not authorized.')
        setLoading(false)
        return
      }

      setIsAdmin(true)
      await loadAll()
      setLoading(false)
    })()
  }, [])

  async function loadAll() {
    setMsg('')

    const [tRes, mRes] = await Promise.all([
      supabase.from('teams').select('id, name').order('name'),
      supabase
        .from('knockout_matches')
        .select('round, match_no, home_team_id, away_team_id')
        .order('round')
        .order('match_no')
    ])

    if (tRes.error || mRes.error) {
      setMsg(tRes.error?.message || mRes.error?.message || 'Error loading data.')
      return
    }

    const t = tRes.data ?? []
    const m = mRes.data ?? []

    setTeams(t)
    setMatches(m)

    // Build draft state
    const d = {}
    for (const r of ROUND_ORDER) d[r] = {}

    for (const row of m) {
      d[row.round][row.match_no] = {
        home_team_id: row.home_team_id ?? '',
        away_team_id: row.away_team_id ?? ''
      }
    }

    // Ensure slots exist
    for (const r of ROUND_ORDER) {
      const count = ROUND_MATCH_COUNTS[r]
      for (let i = 1; i <= count; i++) {
        if (!d[r][i]) d[r][i] = { home_team_id: '', away_team_id: '' }
      }
    }

    setDraft(d)
  }

  function setDraftTeam(round, matchNo, side, value) {
    setDraft(prev => ({
      ...prev,
      [round]: {
        ...(prev[round] ?? {}),
        [matchNo]: {
          ...(prev?.[round]?.[matchNo] ?? {}),
          [side]: value
        }
      }
    }))
  }

  async function saveRound(round) {
    setMsg('Saving…')

    const count = ROUND_MATCH_COUNTS[round]
    const rows = []

    for (let matchNo = 1; matchNo <= count; matchNo++) {
      const cur = draft[round][matchNo]

      rows.push({
        round,
        match_no: matchNo,
        home_team_id: cur.home_team_id || null,
        away_team_id: cur.away_team_id || null
      })
    }

    // 🔑 Upsert using UNIQUE (round, match_no)
    const { error } = await supabase
      .from('knockout_matches')
      .upsert(rows, { onConflict: 'round,match_no' })

    if (error) {
      setMsg(error.message)
      return
    }

    setMsg(`Saved ${ROUND_LABEL[round]} ✅`)
    await loadAll()
  }

  async function clearRound(round) {
    const ok = confirm(`Clear all teams for ${ROUND_LABEL[round]}?`)
    if (!ok) return

    setMsg('Clearing…')

    const count = ROUND_MATCH_COUNTS[round]
    const rows = []

    for (let i = 1; i <= count; i++) {
      rows.push({
        round,
        match_no: i,
        home_team_id: null,
        away_team_id: null
      })
    }

    const { error } = await supabase
      .from('knockout_matches')
      .upsert(rows, { onConflict: 'round,match_no' })

    if (error) {
      setMsg(error.message)
      return
    }

    setMsg(`Cleared ${ROUND_LABEL[round]} ✅`)
    await loadAll()
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading…</p></div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return (
      <div className="container">
        <div className="card">
          <p>{msg || 'Not authorized.'}</p>
          <a className="pill" href="/">🏠 Main Menu</a>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/admin">🛠 Admin Hub</a>
        <a className="pill" href="/knockout">🏟 Knockout Picks</a>
        <button className="pill" onClick={loadAll}>🔄 Refresh</button>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Admin — Knockout Setup</h1>
      <p className="sub">Assign teams to each knockout match.</p>

      {msg && <div className="badge">{msg}</div>}

      {ROUND_ORDER.map(round => (
        <div key={round} className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h2 className="cardTitle">{ROUND_LABEL[round]}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => clearRound(round)}>Clear</button>
              <button className="btn btnPrimary" onClick={() => saveRound(round)}>Save</button>
            </div>
          </div>

          {Array.from({ length: ROUND_MATCH_COUNTS[round] }).map((_, i) => {
            const matchNo = i + 1
            const cur = draft?.[round]?.[matchNo]

            return (
              <div key={matchNo} style={{ marginTop: 12 }}>
                <strong>Match {matchNo}</strong>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                  <select
                    className="field"
                    value={cur.home_team_id || ''}
                    onChange={e => setDraftTeam(round, matchNo, 'home_team_id', e.target.value)}
                  >
                    <option value="">Home team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>

                  <select
                    className="field"
                    value={cur.away_team_id || ''}
                    onChange={e => setDraftTeam(round, matchNo, 'away_team_id', e.target.value)}
                  >
                    <option value="">Away team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {cur.home_team_id && cur.home_team_id === cur.away_team_id && (
                  <p style={{ color: '#f87171', fontWeight: 800 }}>
                    Home and away cannot be the same team
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
