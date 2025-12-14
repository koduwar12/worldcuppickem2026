'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const SCORE_BY_POSITION = { 1: 3, 2: 2, 3: 1, 4: 0 }
const PERFECT_GROUP_BONUS = 2

export default function LeaderboardPage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [me, setMe] = useState(null)
  const [myProfile, setMyProfile] = useState(null)
  const [myNameDraft, setMyNameDraft] = useState('')

  const [groups, setGroups] = useState([])
  const [teams, setTeams] = useState([])
  const [finalMatches, setFinalMatches] = useState([])

  const [profiles, setProfiles] = useState([])
  const [submittedPicks, setSubmittedPicks] = useState([])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: userData } = await supabase.auth.getUser()
      const u = userData?.user ?? null
      setMe(u)

      if (!u) {
        setMsg('Please sign in first.')
        setLoading(false)
        return
      }

      // Ensure my profile exists (so I can set a display name)
      const profRes = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', u.id)
        .maybeSingle()

      if (profRes.error) {
        setMsg(profRes.error.message)
        setLoading(false)
        return
      }

      let prof = profRes.data
      if (!prof) {
        const insertRes = await supabase
          .from('profiles')
          .insert({ user_id: u.id })
          .select()
          .single()

        if (insertRes.error) {
          setMsg(insertRes.error.message)
          setLoading(false)
          return
        }
        prof = insertRes.data
      }

      setMyProfile(prof)
      setMyNameDraft(prof.display_name ?? '')

      const [gRes, tRes, mRes, pRes, picksRes] = await Promise.all([
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
          .eq('is_final', true),
        supabase
          .from('profiles')
          .select('user_id, display_name, submitted_at, bracket_submitted')
          .eq('bracket_submitted', true),
        supabase
          .from('group_picks')
          .select('user_id, group_id, position, team_id, submitted_at')
      ])

      if (gRes.error || tRes.error || mRes.error || pRes.error || picksRes.error) {
        setMsg(
          gRes.error?.message ||
            tRes.error?.message ||
            mRes.error?.message ||
            pRes.error?.message ||
            picksRes.error?.message ||
            'Error loading leaderboard data'
        )
        setLoading(false)
        return
      }

      setGroups(gRes.data ?? [])
      setTeams(tRes.data ?? [])
      setFinalMatches(mRes.data ?? [])
      setProfiles(pRes.data ?? [])
      setSubmittedPicks(picksRes.data ?? [])

      setLoading(false)
    })()
  }, [])

  // Compute standings per group from finalized matches
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
        gd: 0,
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

  // Map submitted picks by user/group/position
  const picksByUser = useMemo(() => {
    const map = {}
    for (const p of submittedPicks) {
      if (!p.submitted_at) continue
      if (!map[p.user_id]) map[p.user_id] = {}
      if (!map[p.user_id][p.group_id]) map[p.user_id][p.group_id] = {}
      map[p.user_id][p.group_id][p.position] = p.team_id
    }
    return map
  }, [submittedPicks])

  // Score all submitted users
  const leaderboardRows = useMemo(() => {
    const users = profiles
      .filter(p => p.bracket_submitted)
      .map(p => ({
        user_id: p.user_id,
        display_name: p.display_name,
        submitted_at: p.submitted_at
      }))

    const rows = users.map(u => {
      let total = 0
      const groupBreakdown = {}

      for (const g of groups) {
        const actual = standingsByGroup[g.id] ?? []
        const actualOrder = actual.slice(0, 4).map(r => r.teamId)

        const userGroup = picksByUser[u.user_id]?.[g.id] ?? {}

        let groupPts = 0
        let correctCount = 0

        for (let pos = 1; pos <= 4; pos++) {
          const pickedTeamId = userGroup[pos]
          const actualTeamId = actualOrder[pos - 1]

          if (pickedTeamId && actualTeamId && pickedTeamId === actualTeamId) {
            groupPts += SCORE_BY_POSITION[pos]
            correctCount += 1
          }
        }

        if (correctCount === 4) groupPts += PERFECT_GROUP_BONUS

        groupBreakdown[g.id] = { points: groupPts, correct: correctCount }
        total += groupPts
      }

      return {
        ...u,
        name:
          (u.display_name && u.display_name.trim()) ||
          `User ${String(u.user_id).slice(0, 6)}`,
        total,
        groupBreakdown
      }
    })

    // Sort by total desc, then earlier submit wins tie
    rows.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      const at = a.submitted_at ? new Date(a.submitted_at).getTime() : 0
      const bt = b.submitted_at ? new Date(b.submitted_at).getTime() : 0
      return at - bt
    })

    return rows
  }, [profiles, groups, standingsByGroup, picksByUser])

  async function saveDisplayName() {
    if (!me) return
    setMsg('Saving name...')

    const { error, data } = await supabase
      .from('profiles')
      .update({ display_name: myNameDraft })
      .eq('user_id', me.id)
      .select()
      .single()

    if (error) {
      setMsg(error.message)
      return
    }

    setMyProfile(data)
    setMsg('Saved ✅ (refresh to see name update)')
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Leaderboard</h1>
        <p>Loading...</p>
      </main>
    )
  }

  if (msg && !me) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Leaderboard</h1>
        <p>{msg}</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <a href="/">Home</a>
        <a href="/picks">Picks</a>
        <a href="/standings">Standings</a>
      </div>

      <h1>Leaderboard</h1>

      <p style={{ fontSize: 12, opacity: 0.75 }}>
        Scoring (test): 1st=3, 2nd=2, 3rd=1, 4th=0, perfect group +{PERFECT_GROUP_BONUS}.
        Updates live from finalized matches.
      </p>

      {myProfile && (
        <section style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', maxWidth: 520 }}>
          <h2 style={{ marginTop: 0 }}>Your display name</h2>
          <input
            value={myNameDraft}
            onChange={e => setMyNameDraft(e.target.value)}
            placeholder="e.g. Koda, Uncle Mike, etc."
            style={{ padding: 8, width: '100%', maxWidth: 360 }}
          />
          <div style={{ marginTop: 10 }}>
            <button onClick={saveDisplayName}>Save Name</button>
          </div>
          {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
        </section>
      )}

      <section style={{ marginTop: 18 }}>
        {leaderboardRows.length === 0 ? (
          <p>No submitted brackets yet.</p>
        ) : (
          <div style={{ maxWidth: 720 }}>
            {leaderboardRows.map((r, idx) => (
              <div
                key={r.user_id}
                style={{
                  border: '1px solid #ddd',
                  padding: 12,
                  marginTop: 10
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <strong>
                      {idx + 1}.{' '}
                      <a href={`/bracket/${r.user_id}`} style={{ textDecoration: 'underline' }}>
                        {r.name}
                      </a>
                    </strong>

                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Submitted:{' '}
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'} •{' '}
                      <a href={`/bracket/${r.user_id}`}>View bracket →</a>
                    </div>
                  </div>

                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {r.total} pts
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                  {groups.map(g => (
                    <span key={g.id} style={{ marginRight: 12 }}>
                      <strong>{g.id}</strong>: {r.groupBreakdown[g.id]?.points ?? 0} pts
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

