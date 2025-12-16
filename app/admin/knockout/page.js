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
        .select('round, match_no, home_team_id, away_team_id, home_score, away_score, is_final')
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

    const d = {}
    for (const r of ROUND_ORDER) d[r] = {}

    for (const row of m) {
      d[row.round][row.match_no] = {
        home_team_id: row.home_team_id ?? '',
        away_team_id: row.away_team_id ?? ''
      }
    }

    // Ensure all slots exist so selects are controlled
    for (const r of ROUND_ORDER) {
      const count = ROUND_MATCH_COUNTS[r] ?? 0
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

    const count = ROUND_MATCH_COUNTS[round] ?? 0
    const rows = []

    for (let matchNo = 1; matchNo <= count; matchNo++) {
      const cur = draft?.[round]?.[matchNo] ?? { home_team_id: '', away_team_id: '' }

      rows.push({
        round,
        match_no: matchNo,
        home_team_id: cur.home_team_id || null,
        away_team_id: cur.away_team_id || null
      })
    }

    const { error } = await supabase
      .from('knockout_matches')
      .upsert(rows, { onConflict: 'round,match_no' })

    if (error) {
      setMsg(error.message)
      return
    }

    setMsg(`Saved ${ROUND_LABEL[round] || round} ✅`)
    await loadAll()
  }

  async function clearRound(round) {
    const ok = confirm(`Clear all teams for ${ROUND_LABEL[round] || round}?`)
    if (!ok) return

    setMsg('Clearing…')

    const count = ROUND_MATCH_COUNTS[round] ?? 0
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

    setMsg(`Cleared ${ROUND_LABEL[round] || round} ✅`)
    await loadAll()
  }

  const matchesByRound = useMemo(() => {
    const map = {}
    for (const r of ROUND_ORDER) map[r] = []
    for (const m of matches) {
      if (!map[m.round]) map[m.round] = []
      map[m.round].push(m)
    }
    return map
  }, [matches])

  // ✅ Build a "used teams" set per round from current DRAFT (not DB)
  const usedByRound = useMemo(() => {
    const out = {}
    for (const r of ROUND_ORDER) {
      const set = new Set()
      const count = ROUND_MATCH_COUNTS[r] ?? 0
      for (let i = 1; i <= count; i++) {
        const cur = draft?.[r]?.[i]
        if (cur?.home_team_id) set.add(String(cur.home_team_id))
        if (cur?.away_team_id) set.add(String(cur.away_team_id))
      }
      out[r] = set
    }
    return out
  }, [draft])

  function isDisabledOption(round, matchNo, side, teamId) {
    const id = String(teamId)
    const cur = draft?.[round]?.[matchNo] ?? { home_team_id: '', away_team_id: '' }

    // Always allow current selection so it doesn't disappear/lock you out
    if (String(cur?.[side] || '') === id) return false

    // Block picking same team on the opposite side of SAME match
    const otherSide = side === 'home_team_id' ? 'away_team_id' : 'home_team_id'
    if (String(cur?.[otherSide] || '') === id) return true

    // Block teams already used elsewhere in this round
    const used = usedByRound?.[round]
    if (!used) return false

    return used.has(id)
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
        <a className="pill" href="/admin">🛠 Admin Hub</a>
        <a className="pill" href="/admin/groups">📊 Group Admin</a>
        <button className="pill" onClick={loadAll}>🔄 Refresh</button>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Admin — Knockout Setup</h1>
      <p className="sub">
        Assign teams for each knockout match. Teams already used in the same round are disabled.
      </p>

      {msg && <div className="badge" style={{ marginTop: 10 }}>{msg}</div>}

      {ROUND_ORDER.map(round => (
        <div key={round} className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <h2 className="cardTitle" style={{ margin: 0 }}>{ROUND_LABEL[round] || round}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800, paddingTop: 6 }}>
                Used: {usedByRound?.[round]?.size ?? 0}
              </div>
              <button className="btn" onClick={() => clearRound(round)}>Clear</button>
              <button className="btn btnPrimary" onClick={() => saveRound(round)}>Save</button>
            </div>
          </div>

          <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
            Saved matches in DB for this round: {(matchesByRound[round] ?? []).length}
          </div>

          {Array.from({ length: ROUND_MATCH_COUNTS[round] }).map((_, i) => {
            const matchNo = i + 1
            const cur = draft?.[round]?.[matchNo] ?? { home_team_id: '', away_team_id: '' }

            const sameTeam = cur.home_team_id && cur.home_team_id === cur.away_team_id

            return (
              <div key={matchNo} style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900 }}>Match {matchNo}</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                  <select
                    className="field"
                    value={cur.home_team_id || ''}
                    onChange={e => setDraftTeam(round, matchNo, 'home_team_id', e.target.value)}
                  >
                    <option value="">Home team</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id} disabled={isDisabledOption(round, matchNo, 'home_team_id', t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="field"
                    value={cur.away_team_id || ''}
                    onChange={e => setDraftTeam(round, matchNo, 'away_team_id', e.target.value)}
                  >
                    <option value="">Away team</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id} disabled={isDisabledOption(round, matchNo, 'away_team_id', t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {sameTeam && (
                  <div style={{ marginTop: 8, fontWeight: 900, color: '#f87171' }}>
                    Home and away cannot be the same team.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
