'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const SCORE_BY_RANK = { 1: 3, 2: 2, 3: 1, 4: 0 }
const PERFECT_GROUP_BONUS = 2

export default function LeaderboardPage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [groups, setGroups] = useState([])
  const [teams, setTeams] = useState([])
  const [finalMatches, setFinalMatches] = useState([])
  const [submittedUsers, setSubmittedUsers] = useState([]) // [{user_id, display_name, submitted_at}]
  const [allPicks, setAllPicks] = useState([]) // group_picks rows

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

      const [gRes, tRes, mRes, usersRes, picksRes] = await Promise.all([
        supabase.from('groups').select('id,name').order('name'),
        supabase.from('teams').select('id,name,group_id').order('name'),
        supabase
          .from('matches')
          .select('id, group_id, home_team_id, away_team_id, home_score, away_score, is_final')
          .eq('is_final', true),
        // Prefer profiles if you have it (display names + submitted)
        supabase
          .from('profiles')
          .select('user_id, display_name, submitted_at, bracket_submitted')
          .eq('bracket_submitted', true),
        // Pull picks only for submitted picks (submitted_at not null)
        supabase
          .from('group_picks')
          .select('user_id, group_id, team_id, rank, submitted_at')
          .not('submitted_at', 'is', null)
      ])

      if (gRes.error || tRes.error || mRes.error || usersRes.error || picksRes.error) {
        setMsg(
          gRes.error?.message ||
            tRes.error?.message ||
            mRes.error?.message ||
            usersRes.error?.message ||
            picksRes.error?.message ||
            'Error loading leaderboard'
        )
        setLoading(false)
        return
      }

      setGroups(gRes.data ?? [])
      setTeams(tRes.data ?? [])
      setFinalMatches(mRes.data ?? [])
      setSubmittedUsers(usersRes.data ?? [])
      setAllPicks(picksRes.data ?? [])

      setLoading(false)
    })()
  }, [])

  const teamNameById = useMemo(() => {
    const map = {}
    for (const t of teams) map[t.id] = t.name
    return map
  }, [teams])

  // Build standings (actual group order) from finalized matches
  const standingsByGroup = useMemo(() => {
    const stats = {}
    for (const t of teams) {
      stats[t.id] = { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, PTS: 0 }
    }

    for (const m of finalMatches) {
      const h = m.home_team_id
      const a = m.away_team_id
      if (!h || !a) continue
      if (m.home_score === null || m.away_score === null) continue

      const hs = Number(m.home_score)
      const as = Number(m.away_score)

      const home = stats[h]
      const away = stats[a]
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

    for (const id in stats) stats[id].GD = stats[id].GF - stats[id].GA

    const grouped = {}
    for (const g of groups) grouped[g.id] = []

    for (const t of teams) {
      if (!grouped[t.group_id]) grouped[t.group_id] = []
      grouped[t.group_id].push({
        teamId: t.id,
        name: t.name,
        ...stats[t.id]
      })
    }

    for (const gid in grouped) {
      grouped[gid].sort((x, y) => {
        if (y.PTS !== x.PTS) return y.PTS - x.PTS
        if (y.GD !== x.GD) return y.GD - x.GD
        if (y.GF !== x.GF) return y.GF - x.GF
        return x.name.localeCompare(y.name)
      })
    }

    return grouped
  }, [groups, teams, finalMatches])

  // Picks indexed: picksByUser[userId][groupId][rank] = teamId
  const picksByUser = useMemo(() => {
    const map = {}
    for (const p of allPicks) {
      if (!map[p.user_id]) map[p.user_id] = {}
      if (!map[p.user_id][p.group_id]) map[p.user_id][p.group_id] = {}
      map[p.user_id][p.group_id][p.rank] = p.team_id
    }
    return map
  }, [allPicks])

  // Score users
  const rows = useMemo(() => {
    const result = []

    for (const u of submittedUsers) {
      const userId = u.user_id
      const pu = picksByUser[userId] ?? {}

      let total = 0
      let perfectGroups = 0

      for (const g of groups) {
        const actual = standingsByGroup[g.id] ?? []
        const actualTop4 = actual.slice(0, 4).map(r => r.teamId)

        const gp = pu[g.id] ?? {}

        let pts = 0
        let correct = 0

        for (let r = 1; r <= 4; r++) {
          const picked = gp[r]
          const actualTeam = actualTop4[r - 1]
          if (picked && actualTeam && picked === actualTeam) {
            pts += SCORE_BY_RANK[r]
            correct += 1
          }
        }

        if (correct === 4) {
          pts += PERFECT_GROUP_BONUS
          perfectGroups += 1
        }

        total += pts
      }

      const name =
        (u.display_name && u.display_name.trim()) ||
        `User ${String(userId).slice(0, 6)}`

      result.push({
        user_id: userId,
        name,
        submitted_at: u.submitted_at,
        total,
        perfectGroups
      })
    }

    // Sort: points desc, then perfect groups desc, then name
    result.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      if (b.perfectGroups !== a.perfectGroups) return b.perfectGroups - a.perfectGroups
      return a.name.localeCompare(b.name)
    })

    return result
  }, [submittedUsers, picksByUser, groups, standingsByGroup])

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
        <a className="pill" href="/standings">📊 Standings</a>
      </div>

      <h1 className="h1" style={{ marginTop: 14 }}>Leaderboard</h1>
      <p className="sub">
        Click a name to view their bracket. Points update from finalized matches.
      </p>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 className="cardTitle" style={{ marginBottom: 0 }}>Top Players</h2>
            <p className="cardSub" style={{ marginTop: 6 }}>
              Scoring: 1st=3, 2nd=2, 3rd=1, 4th=0 • Perfect group bonus +{PERFECT_GROUP_BONUS}
            </p>
          </div>
          <span className="badge">👥 Players: {rows.length}</span>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={{ color: 'rgba(234,240,255,.8)', fontSize: 12 }}>
                <th style={thStyle}>Rank</th>
                <th style={thStyleLeft}>Player</th>
                <th style={thStyle}>Points</th>
                <th style={thStyle}>Perfect Groups</th>
                <th style={thStyle}>Submitted</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => {
                const rank = idx + 1
                const medal =
                  rank === 1 ? '🥇' :
                  rank === 2 ? '🥈' :
                  rank === 3 ? '🥉' : '🏅'

                const bg =
                  rank === 1 ? 'rgba(124,58,237,.16)' :
                  rank === 2 ? 'rgba(6,182,212,.14)' :
                  rank === 3 ? 'rgba(34,197,94,.12)' :
                  'transparent'

                const submittedText = r.submitted_at
                  ? new Date(r.submitted_at).toLocaleString()
                  : '—'

                return (
                  <tr key={r.user_id} style={{ borderTop: '1px solid rgba(255,255,255,.10)', background: bg }}>
                    <td style={tdCenter}>
                      <span style={{ marginRight: 6 }}>{medal}</span>
                      <strong>{rank}</strong>
                    </td>

                    <td style={tdLeft}>
                      <a
                        href={`/bracket/${r.user_id}`}
                        style={{
                          textDecoration: 'none',
                          fontWeight: 850,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8
                        }}
                      >
                        <span>{r.name}</span>
                        <span style={{ opacity: 0.7, fontSize: 12 }}>↗</span>
                      </a>
                      <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(234,240,255,.65)' }}>
                        {rank <= 3 ? 'Top 3 right now 👀' : 'Chasing the top…'}
                      </div>
                    </td>

                    <td style={tdCenter}>
                      <span style={pointsPillStyle}>{r.total}</span>
                    </td>

                    <td style={tdCenter}>
                      <span style={{
                        display: 'inline-flex',
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: 'rgba(34,197,94,.12)',
                        border: '1px solid rgba(34,197,94,.22)',
                        fontWeight: 800
                      }}>
                        {r.perfectGroups}
                      </span>
                    </td>

                    <td style={tdCenter}>
                      <span style={{ color: 'rgba(234,240,255,.75)', fontSize: 12 }}>
                        {submittedText}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="footerNote" style={{ marginTop: 14 }}>
          If you want, we can add a “My Rank” box at the top and show your score breakdown by group.
        </p>
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
  padding: '12px 8px',
  color: 'rgba(234,240,255,.92)',
  fontSize: 13
}

const tdLeft = {
  ...tdCenter,
  textAlign: 'left'
}

const pointsPillStyle = {
  display: 'inline-flex',
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(124,58,237,.18)',
  border: '1px solid rgba(124,58,237,.28)',
  fontWeight: 900
}

