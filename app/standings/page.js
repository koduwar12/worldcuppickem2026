'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function StandingsPage() {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [teams, setTeams] = useState([])
  const [matches, setMatches] = useState([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) {
        setMsg('Please sign in first.')
        setLoading(false)
        return
      }

      const [gRes, tRes, mRes] = await Promise.all([
        supabase.from('groups').select('*').order('id'),
        supabase.from('teams').select('*').order('name'),
        supabase
          .from('matches')
          .select(`
            id,
            group_id,
            home_score,
            away_score,
            is_final,
            home:home_team_id ( id, name, group_id ),
            away:away_team_id ( id, name, group_id )
          `)
          .eq('stage', 'GROUP')
          .eq('is_final', true)
      ])

      if (gRes.error || tRes.error || mRes.error) {
        setMsg(gRes.error?.message || tRes.error?.message || mRes.error?.message || 'Error loading data')
        setLoading(false)
        return
      }

      setGroups(gRes.data ?? [])
      setTeams(tRes.data ?? [])
      setMatches(mRes.data ?? [])
      setLoading(false)
    })()
  }, [])

  const standingsByGroup = useMemo(() => {
    // Build per-team table from finalized matches only
    const table = {} // { groupId: { teamId: stats } }

    for (const g of groups) table[g.id] = {}
    for (const t of teams) {
      if (!table[t.group_id]) table[t.group_id] = {}
      table[t.group_id][t.id] = {
        teamId: t.id,
        name: t.name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      }
    }

    for (const m of matches) {
      const groupId = m.group_id
      if (!groupId) continue
      const hs = m.home_score
      const as = m.away_score
      if (hs === null || as === null) continue

      const home = m.home
      const away = m.away
      if (!home?.id || !away?.id) continue

      const h = table[groupId]?.[home.id]
      const a = table[groupId]?.[away.id]
      if (!h || !a) continue

      h.played += 1
      a.played += 1

      h.gf += hs
      h.ga += as
      a.gf += as
      a.ga += hs

      if (hs > as) {
        h.wins += 1
        a.losses += 1
        h.pts += 3
      } else if (hs < as) {
        a.wins += 1
        h.losses += 1
        a.pts += 3
      } else {
        h.draws += 1
        a.draws += 1
        h.pts += 1
        a.pts += 1
      }
    }

    // compute gd and sort
    const result = {}
    for (const g of groups) {
      const rows = Object.values(table[g.id] ?? {}).map(r => ({
        ...r,
        gd: r.gf - r.ga
      }))

      // Sort: points desc, gd desc, gf desc, name asc (simple tie-breaker for test set)
      rows.sort((x, y) => {
        if (y.pts !== x.pts) return y.pts - x.pts
        if (y.gd !== x.gd) return y.gd - x.gd
        if (y.gf !== x.gf) return y.gf - x.gf
        return x.name.localeCompare(y.name)
      })

      result[g.id] = rows
    }

    return result
  }, [groups, teams, matches])

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Standings</h1>
        <p>Loading...</p>
      </main>
    )
  }

  if (msg) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Standings</h1>
        <p>{msg}</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Standings (Live from Finalized Matches)</h1>
      <p style={{ opacity: 0.7, fontSize: 12 }}>
        Tie-break (test set): Points → Goal Diff → Goals For → Name
      </p>

      {groups.map(g => (
        <section key={g.id} style={{ marginTop: 18, padding: 14, border: '1px solid #ddd' }}>
          <h2>{g.name}</h2>

          <table style={{ width: '100%', maxWidth: 720, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {(standingsByGroup[g.id] ?? []).map((r, idx) => (
                <tr key={r.teamId} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '6px 0' }}>
                    <strong>{idx + 1}.</strong> {r.name}
                  </td>
                  <td align="center">{r.played}</td>
                  <td align="center">{r.wins}</td>
                  <td align="center">{r.draws}</td>
                  <td align="center">{r.losses}</td>
                  <td align="center">{r.gf}</td>
                  <td align="center">{r.ga}</td>
                  <td align="center">{r.gd}</td>
                  <td align="center"><strong>{r.pts}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>

          {(matches.filter(m => m.group_id === g.id).length === 0) && (
            <p style={{ marginTop: 10, opacity: 0.7 }}>
              No finalized matches yet for this group.
            </p>
          )}
        </section>
      ))}
    </main>
  )
}
