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

// Change these counts if you want:
const ROUND_MATCH_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }

export default function AdminKnockoutSetupPage() {
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
        setMsg('Not found.')
        setLoading(false)
        return
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', u.id)
        .maybeSingle()

      if (!prof?.is_admin) {
        setMsg('Not found.')
        setIsAdmin(false)
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
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase
        .from('knockout_matches')
        .select('id, round, match_no, home_team_id, away_team_id')
        .order('round', { ascending: true })
        .order('match_no', { ascending: true })
    ])

    if (tRes.error || mRes.error) {
      setMsg(tRes.error?.message || mRes.error?.message || 'Error loading data.')
      return
    }

    const t = tRes.data ?? []
    const m = mRes.data ?? []
    setTeams(t)
    setMatches(m)

    // Seed draft from DB
    const d = {}
    for (const r of ROUND_ORDER) d[r] = {}
    for (const row of m) {
      if (!d[row.round]) d[row.round] = {}
      d[row.round][row.match_no] = {
        home_team_id: row.home_team_id ?? '',
        away_team_id: row.away_team_id ?? ''
      }
    }

    // Ensure draft has slots for all match numbers
    for (const r of ROUND_ORDER) {
      const count = ROUND_MATCH_COUNTS[r] ?? 0
      if (!d[r]) d[r] = {}
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
          ...(prev?.[round]?.[matchNo] ?? { home_team_id: '', away_team_id: '' }),
          [side]: value
        }
      }
    }))
  }

  const matchIdMap = useMemo(() => {
    // map `${round}-${match_no}` -> id (if exists)
    const map = {}
    for (const m of matches) map[`${m.round}-${m.match_no}`] = m.id
    return map
  }, [matches])

  async function saveRound(round) {
    setMsg('Saving…')

    const count = ROUND_MATCH_COUNTS[round] ?? 0
    const rows = []

    for (let matchNo = 1; matchNo <= count; matchNo++) {
      const cur = draft?.[round]?.[matchNo] ?? { home_team_id: '', away_team_id: '' }
      const existingId = matchIdMap[`${round}-${matchNo}`]

      rows.push({
        id: existingId, // if null/undefined, supabase will insert new row
        round,
        match_no: matchNo,
        home_team_id: cur.home_team_id || null,
        away_team_id: cur.away_team_id || null
      })
    }

    // Upsert by id if present; otherwise inserts
    const { error } = await supabase.from('knockout_matches').upsert(rows)
    if (error) {
      setMsg(error.message)
      return
    }

    setMsg(`Saved ${ROUND_LABEL[round] || round} ✅`)
    await loadAll()
  }

  async function clearRound(round) {
    const ok = confirm(`Clear ALL teams for ${ROUND_LABEL[round] || round}?`)
    if (!ok) return

    setMsg('Clearing…')

    // Set teams to null but keep rows
    const count = ROUND_MATCH_COUNTS[round] ?? 0
    const updates = []
    for (let matchNo = 1; matchNo <= count; matchNo++) {
      const id = matchIdMap[`${round}-${matchNo}`]
      if (!id) continue
      updates.push({ id, home_team_id: null, away_team_id: null })
    }

    if (updates.length) {
      const { error } = await supabase.from('knockout_matches').upsert(updates)
      if (error) {
        setMsg(error.message)
        return
      }
    }

    setMsg(`Cleared ${ROUND_LABEL[round] || round} ✅`)
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
          <p style={{ margin: 0 }}>{msg || 'Not found.'}</p>
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
        <a className="pill" href="/admin">🛠 Admin Scores</a>
        <a className="pill" href="/knockout">🏟 Knockout Picks</a>
        <button className="pill" onClick={loadAll}>🔄 Refresh</button>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Admin — Knockout Setup</h1>
      <p className="sub">
        Set the teams for each knockout match. Users will only be able to pick once both teams are set.
      </p>

      {msg && <div className="badge" style={{ marginTop: 10 }}>{msg}</div>}

      {ROUND_ORDER.map(round => {
        const count = ROUND_MATCH_COUNTS[round] ?? 0
        return (
          <div key={round} className="card" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h2 className="cardTitle" style={{ margin: 0 }}>{ROUND_LABEL[round] || round}</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => clearRound(round)}>Clear</button>
                <button className="btn btnPrimary" onClick={() => saveRound(round)}>Save Round</button>
              </div>
            </div>

            <p className="cardSub" style={{ marginTop: 8 }}>
              {count} match{count === 1 ? '' : 'es'}
            </p>

            {Array.from({ length: count }).map((_, i) => {
              const matchNo = i + 1
              const cur = draft?.[round]?.[matchNo] ?? { home_team_id: '', away_team_id: '' }

              return (
                <div
                  key={`${round}-${matchNo}`}
                  style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 14,
                    background: 'rgba(255,255,255,.05)',
                    border: '1px solid rgba(255,255,255,.10)'
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>
                    Match {matchNo}
                  </div>

                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Home</div>
                      <select
                        className="field"
                        value={cur.home_team_id || ''}
                        onChange={e => setDraftTeam(round, matchNo, 'home_team_id', e.target.value)}
                      >
                        <option value="">— Select team —</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Away</div>
                      <select
                        className="field"
                        value={cur.away_team_id || ''}
                        onChange={e => setDraftTeam(round, matchNo, 'away_team_id', e.target.value)}
                      >
                        <option value="">— Select team —</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {cur.home_team_id && cur.away_team_id && cur.home_team_id === cur.away_team_id && (
                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, opacity: 0.85 }}>
                      ⚠️ Home and away cannot be the same team.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
