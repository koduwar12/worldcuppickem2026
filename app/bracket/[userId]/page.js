'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

const SCORE_BY_POSITION = { 1: 3, 2: 2, 3: 1, 4: 0 }
const PERFECT_GROUP_BONUS = 2

export default function BracketPage({ params }) {
  const userId = params.userId

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [profile, setProfile] = useState(null)
  const [groups, setGroups] = useState([])
  const [teams, setTeams] = useState([])
  const [picks, setPicks] = useState([])
  const [finalMatches, setFinalMatches] = useState([])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      // Require sign-in (friends & family only)
      const { data: auth } = await supabase.auth.getUser()
      const viewer = auth?.user ?? null

      if (!viewer) {
        setMsg('Please sign in to view brackets.')
        setLoading(false)
        return
      }

      // Load submitted profile
      const profRes = await supabase
        .from('profiles')
        .select('user_id, display_name, submitted_at, bracket_submitted')
        .eq('user_id', userId)
        .maybeSingle()

      if (profRes.error) {
        setMsg(profRes.error.message)
        setLoading(false)
        return
      }

      if (!profRes.data || !profRes.data.bracket_submitted) {
        setMsg('This bracket is not available (not submitted yet).')
        setLoading(false)
        return
      }

      setProfile(profRes.data)

      // Load groups, teams, picks, and finalized group matches (for live standings)
      const [gRes, tRes, pRes, mRes] = await Promise.all([
        supabase.from('groups').select('*').order('id'),
        supabase.from('teams').select('*').order('name'),
        supabase
          .from('group_picks')
          .select('group_id, position, team_id, submitted_at')
          .eq('user_id', userId),
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

      if (gRes.error || tRes.error || pRes.error || mRes.error) {
        setMsg(
          gRes.error?.message ||
            tRes.error?.message ||
            pRes.error?.message ||
            mRes.error?.message ||
            'Failed to load bracket'
        )
        setLoading(false)
        return
      }

      setGroups(gRes.data ?? [])
      setTeams(tRes.data ?? [])
      setPicks(pRes.data ?? [])
      setFinalMatches(mRes.data ?? [])

      setLoading(false)
    })()
  }, [userId])

  const teamNameById = useMemo(() => {
    const map = {}
    for (const t of teams) map[t.id] = t.name
    return map
  }, [teams])

  const picksByGroup = useMemo(() => {
    const map = {}
    for (const p of picks) {
      if (!map[p.group_id]) map[p.group_id] = {}
      map[p.group_id][p.position] = p.team_id
    }
    return map
  }, [picks])

  // Compute standings from finalized matches (same logic as /standings + /leaderboard)
  const standingsByGroup = useMemo(() => {
    const table = {}
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
        pts: 0
      }
    }

    for (const m of finalMatches) {
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

    const result = {}
    for (const g of groups) {
      const rows = Object.values(table[g.id] ?? {}).map(r => ({
        ...r,
        gd: r.gf - r.ga
      }))

      // tie-break for test set: pts -> gd -> gf -> name
      rows.sort((x, y) => {
        if (y.pts !== x.pts) return y.pts - x.pts
        if (y.gd !== x.gd) return y.gd - x.gd
        if (y.gf !== x.gf) return y.gf - x.gf
        return x.name.localeCompare(y.name)
      })

      result[g.id] = rows
    }

    return result
  }, [groups, teams, finalMatches])

  // Score this bracket live
  const score = useMemo(() => {
    let total = 0
    const perGroup = {}

    for (const g of groups) {
      const actual = standingsByGroup[g.id] ?? []
      const actualOrder = actual.slice(0, 4).map(r => r.teamId) // [rank1..rank4]
      const gp = picksByGroup[g.id] ?? {}

      let pts = 0
      let correct = 0

      for (let pos = 1; pos <= 4; pos++) {
        const picked = gp[pos]
        const actualTeam = actualOrder[pos - 1]
        const isCorrect = picked && actualTeam && picked === actualTeam
        if (isCorrect) {
          pts += SCORE_BY_POSITION[pos]
          correct += 1
        }
      }

      const bonus = correct === 4 ? PERFECT_GROUP_BONUS : 0
      pts += bonus

      perGroup[g.id] = {
        points: pts,
        correct,
        bonus,
        finalizedMatches: finalMatches.filter(m => m.group_id === g.id).length
      }

      total += pts
    }

    return { total, perGroup }
  }, [groups, standingsByGroup, picksByGroup, finalMatches])

  function posLabel(pos) {
    if (pos === 1) return '1st'
    if (pos === 2) return '2nd'
    if (pos === 3) return '3rd'
    return '4th'
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Bracket</h1>
        <p>Loading...</p>
      </main>
    )
  }

  if (msg) {
    return (
      <main style={{ padding: 24 }}>
        <nav style={{ marginBottom: 14 }}>
          <a href="/">Home</a> · <a href="/leaderboard">Leaderboard</a> ·{' '}
          <a href="/standings">Standings</a>
        </nav>
        <h1>Bracket</h1>
        <p>{msg}</p>
      </main>
    )
  }

  const displayName =
    (profile.display_name && profile.display_name.trim()) ||
    `User ${String(profile.user_id).slice(0, 6)}`

  return (
    <main style={{ padding: 24 }}>
      <nav style={{ marginBottom: 14 }}>
        <a href="/">Home</a> · <a href="/leaderboard">Leaderboard</a> ·{' '}
        <a href="/standings">Standings</a>
      </nav>

      <h1>
        {displayName} — Group Stage Bracket
      </h1>

      <p style={{ fontSize: 12, opacity: 0.75 }}>
        Submitted:{' '}
        {profile.submitted_at ? new Date(profile.submitted_at).toLocaleString() : '—'}
        {' '}·{' '}
        <strong>Total Points:</strong> {score.total}
      </p>

      <p style={{ fontSize: 12, opacity: 0.75 }}>
        Live scoring updates only from <strong>finalized</strong> matches.
      </p>

      {groups.map(g => {
        const gp = picksByGroup[g.id] ?? {}
        const actualOrder = (standingsByGroup[g.id] ?? []).slice(0, 4).map(r => r.teamId)
        const gScore = score.perGroup[g.id] ?? { points: 0, correct: 0, bonus: 0, finalizedMatches: 0 }

        return (
          <section
            key={g.id}
            style={{
              marginTop: 18,
              padding: 14,
              border: '1px solid #ddd',
              maxWidth: 580
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ marginTop: 0 }}>{g.name}</h2>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{gScore.points} pts</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Correct: {gScore.correct}/4
                  {gScore.bonus ? ` • Bonus +${gScore.bonus}` : ''}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
              Finalized matches counted: {gScore.finalizedMatches}
            </div>

            {[1, 2, 3, 4].map(pos => {
              const pickedId = gp[pos]
              const pickedName = pickedId ? teamNameById[pickedId] : null

              const actualId = actualOrder[pos - 1] // may be undefined if no finalized matches yet
              const isScorable = !!actualId
              const isCorrect = pickedId && actualId && pickedId === actualId

              return (
                <div
                  key={pos}
                  style={{
                    marginTop: 10,
                    padding: 10,
                    border: '1px solid #eee',
                    background: isCorrect ? '#eaffea' : '#fff'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <strong>{posLabel(pos)}:</strong>{' '}
                      {pickedName ? pickedName : <span style={{ opacity: 0.6 }}>—</span>}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      {isScorable ? (
                        isCorrect ? (
                          <span style={{ fontWeight: 700 }}>✅ +{SCORE_BY_POSITION[pos]}</span>
                        ) : (
                          <span style={{ opacity: 0.7 }}>❌ +0</span>
                        )
                      ) : (
                        <span style={{ opacity: 0.7 }}>⏳ Pending</span>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                    <strong>Current actual:</strong>{' '}
                    {isScorable ? teamNameById[actualId] : 'Not enough finalized matches yet'}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </main>
  )
}
