'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function ViewBracketPage() {
  const params = useParams()
  const userId = params?.user_id

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [groups, setGroups] = useState([])
  const [picks, setPicks] = useState({})
  const [scoreMap, setScoreMap] = useState({})
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!userId || userId === 'undefined') {
      setLoading(false)
      return
    }
    load(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function load(uid) {
    setLoading(true)
    setMsg('')

    // groups + teams
    const { data: groupData, error: gErr } = await supabase
      .from('groups')
      .select('id, name, teams(id, name)')
      .order('name')

    if (gErr) {
      setMsg(gErr.message)
      setLoading(false)
      return
    }

    // submitted picks (read-only)
    const { data: pickData, error: pErr } = await supabase
      .from('group_picks')
      .select('group_id, team_id, position, submitted_at')
      .eq('user_id', uid)
      .not('submitted_at', 'is', null)

    if (pErr) {
      setMsg(pErr.message)
      setLoading(false)
      return
    }

    // score per pick (may be empty if no match results yet)
    const { data: scoreData, error: sErr } = await supabase
      .from('group_pick_scores')
      .select('group_id, team_id, picked_position, actual_position, points_awarded, exact, qualified_wrong_order')
      .eq('user_id', uid)

    if (sErr) {
      // Not fatal; bracket can still show. Just show a helpful message.
      setMsg(`Scoring not available yet: ${sErr.message}`)
    }

    // profile name
    const { data: prof } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', uid)
      .maybeSingle()

    // maps
    const pickMap = {}
    ;(pickData || []).forEach(p => {
      pickMap[`${p.group_id}-${p.position}`] = p.team_id
    })

    const sMap = {}
    ;(scoreData || []).forEach(s => {
      sMap[`${s.group_id}-${s.picked_position}`] = s
    })

    setGroups(groupData || [])
    setPicks(pickMap)
    setScoreMap(sMap)
    setProfile(prof || null)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading bracket…</p></div>
      </div>
    )
  }

  if (!userId || userId === 'undefined') {
    return (
      <div className="container">
        <div className="card">
          <p style={{ marginTop: 0 }}>Invalid bracket link.</p>
          <div className="nav" style={{ marginTop: 10 }}>
            <a className="pill" href="/leaderboard">🏆 Back to Leaderboard</a>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </div>
    )
  }

  const displayName =
    profile?.display_name?.trim() || `User ${String(userId).slice(0, 6)}`

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <a className="pill" href="/standings">📊 Standings</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>
        {displayName}’s Bracket
      </h1>
      <p className="sub">Group stage picks (read-only)</p>
<div
  className="card"
  style={{
    marginTop: 12,
    padding: 14,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center'
  }}
>
  <strong style={{ marginRight: 6 }}>Legend:</strong>

  <span
    style={{
      padding: '6px 10px',
      borderRadius: 999,
      background: 'rgba(34,197,94,.22)',
      border: '1px solid rgba(34,197,94,.45)',
      fontWeight: 800
    }}
  >
    ✅ Exact spot (+5)
  </span>

  <span
    style={{
      padding: '6px 10px',
      borderRadius: 999,
      background: 'rgba(56,189,248,.18)',
      border: '1px solid rgba(56,189,248,.35)',
      fontWeight: 800
    }}
  >
    🟦 Qualified wrong order (+2)
  </span>

  <span
    style={{
      padding: '6px 10px',
      borderRadius: 999,
      background: 'rgba(255,255,255,.06)',
      border: '1px solid rgba(255,255,255,.12)',
      fontWeight: 800
    }}
  >
    ⬜ Not correct (+0) / Waiting for results
  </span>
</div>


      {msg && (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0, opacity: 0.85 }}>{msg}</p>
        </div>
      )}

      {groups.map(group => (
        <div key={group.id} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle">{group.name}</h2>

          {[1, 2, 3, 4].map(position => {
            const pickedTeamId = picks[`${group.id}-${position}`]
            const pickedTeam = group.teams.find(t => t.id === pickedTeamId)

            const score = scoreMap[`${group.id}-${position}`]
            const isExact = !!score?.exact
            const isQualWrong = !!score?.qualified_wrong_order
            const pts = score?.points_awarded ?? null

            // color logic:
            // exact = green
            // qualified wrong order = teal
            // wrong/unknown = default
            const bg = isExact
              ? 'rgba(34,197,94,.22)'
              : isQualWrong
              ? 'rgba(56,189,248,.18)'
              : 'rgba(255,255,255,.06)'

            const outline = isExact
              ? '1px solid rgba(34,197,94,.45)'
              : isQualWrong
              ? '1px solid rgba(56,189,248,.35)'
              : '1px solid rgba(255,255,255,.12)'

            return (
              <div
                key={position}
                style={{
                  padding: 12,
                  marginTop: 10,
                  borderRadius: 14,
                  background: bg,
                  border: outline,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 900 }}>#{position}</span>
                  <span style={{ fontWeight: 800 }}>
                    {pickedTeam ? pickedTeam.name : '—'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {pts !== null && (
                    <span
                      style={{
                        fontWeight: 900,
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: 'rgba(0,0,0,.25)',
                        border: '1px solid rgba(255,255,255,.12)'
                      }}
                    >
                      +{pts}
                    </span>
                  )}

                  {isExact && <span title="Exact position">✅</span>}
                  {isQualWrong && <span title="Qualified (wrong order)">🟦</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
