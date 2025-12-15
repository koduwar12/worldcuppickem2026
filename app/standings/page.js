'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function StandingsPage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [groups, setGroups] = useState([])
  const [teams, setTeams] = useState([])
  const [matches, setMatches] = useState([])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: auth } = await supabase.auth.getUser()
      if (!auth?.user) {
        setMsg('Please sign in first.')
        setLoading(false)
        return
      }

      // Load groups + teams + finalized matches
      const [gRes, tRes, mRes] = await Promise.all([
        supabase.from('groups').select('id,name').order('name'),
        supabase.from('teams').select('id,name,group_id').order('name'),
        supabase
          .from('matches')
          .select('id, group_id, home_team_id, away_team_id, home_score, away_score, is_final')
          .eq('is_final', true)
      ])

      if (gRes.error || tRes.error || mRes.error) {
        setMsg(gRes.error?.message || tRes.error?.message || mRes.error?.message || 'Error loading')
        setLoading(false)
        return
      }

      setGroups(gRes.data ?? [])
      setTeams(tRes.data ?? [])
      setMatches(mRes.data ?? [])
      setLoading(false)
    })()
  }, [])

  const teamById = useMemo(() => {
    const map = {}
    for (const t of teams) map[t.id] = t
    return map
  }, [teams])

  const standingsByGroup = useMemo(() => {
    // Initialize stats for each team
    const stats = {} // teamId -> { P,W,D,L,GF,GA,GD,PTS }
    for (const t of teams) {
      stats[t.id] = { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, PTS: 0 }
    }

    // Apply finalized match results
    for (const m of matches) {
      const homeId = m.home_team_id
      const awayId = m.away_team_id
      if (!homeId || !awayId) continue
      if (m.home_score === null || m.away_score === null) continue

      const hs = Number(m.home_score)
      const as = Number(m.away_score)

      const home = stats[homeId]
      const away = stats[awayId]
      if (!home || !away) continue

      home.P += 1
      away.P += 1

      home.GF += hs
      home.GA += as
      away.GF += as
      away.GA += hs

      if (hs > as) {
        home.W += 1
        home.PTS += 3
        away.L += 1
      } else if (hs < as) {
        away.W += 1
        away.PTS += 3
        home.L += 1
      } else {
        home.D += 1
        away.D += 1
        home.PTS += 1
        away.PTS += 1
      }
    }

    // compute GD
    for (const id in stats) {
      stats[id].GD = stats[id].GF - stats[id].GA
    }

    // Group teams by group_id
    const grouped = {}
    for (const g of groups) grouped[g.id] = []
    for (const t of teams) {
      if (!grouped[t.group_id]) grouped[t.group_id] = []
      grouped[t.group_id].push({
        id: t.id,
        name: t.name,
        ...stats[t.id]
      })
    }

    // Sort by PTS, GD, GF (classic)
    for (const gid in grouped) {
      grouped[gid].sort((a, b) => {
        if (b.PTS !== a.PTS) return b.PTS - a.PTS
        if (b.GD !== a.GD) return b.GD - a.GD
        if (b.GF !== a.GF) return b.GF - a.GF
        return a.name.localeCompare(b.name)
      })
    }

    return grouped
  }, [groups, teams, matches])

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ margin: 0, color: 'rgba(234,240,255,.75)' }}>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {/* ---------- TOP NAV ---------- */}
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/picks">👉 Group Picks</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
      </div>

      <h1 className="h1" style={{ marginTop: 14 }}>Standings</h1>
      <p className="sub">
        Updates only when matches are finalized by admin.
      </p>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      {groups.map(g => {
        const rows = standingsByGroup[g.id] ?? []

        return (
          <div key={g.id} className="card" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <h2 className="cardTitle" style={{ marginBottom: 0 }}>{g.name}</h2>
                <p className="cardSub" style={{ marginTop: 6 }}>
                  Sorted by Points, Goal Difference, Goals For
                </p>
              </div>

              <span className="badge">
                ✅ Final games counted: {matches.filter(m => m.group_id === g.id).length}
              </span>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ color: 'rgba(234,240,255,.8)', fontSize: 12 }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyleLeft}>Team</th>
                    <th style={thStyle}>P</th>
                    <th style={thStyle}>W</th>
                    <th style={thStyle}>D</th>
                    <th style={thStyle}>L</th>
                    <th style={thStyle}>GF</th>
                    <th style={thStyle}>GA</th>
                    <th style={thStyle}>GD</th>
                    <th style={thStyle}>PTS</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r, idx) => {
                    const pos = idx + 1
                    const posTag =
                      pos === 1 ? '🥇' :
                      pos === 2 ? '🥈' :
                      pos === 3 ? '🥉' : '•'

                    // subtle highlight for top 2
                    const bg =
                      pos <= 2 ? 'rgba(34,197,94,.10)' :
                      'transparent'

                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,.10)', background: bg }}>
                        <td style={tdCenter}>
                          <span style={{ opacity: 0.9 }}>{posTag}</span> {pos}
                        </td>
                        <td style={tdLeft}>
                          <span style={{ fontWeight: 750 }}>{r.name}</span>
                        </td>
                        <td style={tdCenter}>{r.P}</td>
                        <td style={tdCenter}>{r.W}</td>
                        <td style={tdCenter}>{r.D}</td>
                        <td style={tdCenter}>{r.L}</td>
                        <td style={tdCenter}>{r.GF}</td>
                        <td style={tdCenter}>{r.GA}</td>
                        <td style={tdCenter}>
                          <span style={{ color: r.GD > 0 ? 'rgba(34,197,94,.95)' : r.GD < 0 ? 'rgba(239,68,68,.95)' : 'rgba(234,240,255,.75)' }}>
                            {r.GD}
                          </span>
                        </td>
                        <td style={tdCenter}>
                          <span style={{
                            display: 'inline-flex',
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: 'rgba(124,58,237,.18)',
                            border: '1px solid rgba(124,58,237,.28)',
                            fontWeight: 800
                          }}>
                            {r.PTS}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      <div className="footerNote">
        Note: FIFA tie-breakers can get more complex (head-to-head, fair play). We’re using the common PTS → GD → GF sort for now.
      </div>
    </div>
  )
}

/* ---------- tiny table styles ---------- */

const thStyle = {
  textAlign: 'center',
  padding: '10px 8px',
  borderBottom: '1px solid rgba(255,255,255,.14)'
}

const thStyleLeft = {
  ...thStyle,
  textAlign: 'left'
}

const tdCenter = {
  textAlign: 'center',
  padding: '10px 8px',
  color: 'rgba(234,240,255,.9)',
  fontSize: 13
}

const tdLeft = {
  ...tdCenter,
  textAlign: 'left'
}
