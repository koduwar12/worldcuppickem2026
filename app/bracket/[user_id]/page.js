'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import KnockoutBracket from '../../components/KnockoutBracket'

export default function ViewBracketPage() {
  const params = useParams()
  const userId = params?.user_id

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [groups, setGroups] = useState([])
  const [picks, setPicks] = useState({})
  const [scoreMap, setScoreMap] = useState({})
  const [profile, setProfile] = useState(null)

  // Knockout
  const [koMatches, setKoMatches] = useState([])
  const [koSelections, setKoSelections] = useState({})
  const [koSubmittedAt, setKoSubmittedAt] = useState(null)

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

    // Load in parallel
    const [groupRes, pickRes, scoreRes, profRes, koMatchRes, koPickRes] = await Promise.all([
      supabase.from('groups').select('id, name, teams(id, name)').order('name'),
      supabase
        .from('group_picks')
        .select('group_id, team_id, position, submitted_at')
        .eq('user_id', uid)
        .not('submitted_at', 'is', null),
      supabase
        .from('group_pick_scores')
        .select('group_id, team_id, picked_position, actual_position, points_awarded, exact, qualified_wrong_order')
        .eq('user_id', uid),
      supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', uid)
        .maybeSingle(),
      supabase
        .from('knockout_matches')
        .select(`
          id, round, match_no, home_team_id, away_team_id, home_score, away_score, is_final,
          home:home_team_id ( id, name ),
          away:away_team_id ( id, name )
        `)
        .order('round', { ascending: true })
        .order('match_no', { ascending: true }),
      supabase
        .from('knockout_picks')
        .select('match_id, picked_winner_team_id, submitted_at')
        .eq('user_id', uid)
    ])

    if (groupRes.error) {
      setMsg(groupRes.error.message)
      setLoading(false)
      return
    }
    if (pickRes.error) {
      setMsg(pickRes.error.message)
      setLoading(false)
      return
    }

    // Group scoring can be unavailable
    if (scoreRes.error) {
      setMsg('Scoring not available yet.')
    }

    // Build group pick maps
    const pickMap = {}
    ;(pickRes.data || []).forEach(p => {
      pickMap[`${p.group_id}-${p.position}`] = p.team_id
    })

    const sMap = {}
    ;(scoreRes.data || []).forEach(s => {
      sMap[`${s.group_id}-${s.picked_position}`] = s
    })

    // Knockout selections
    const koSel = {}
    let koSub = null
    ;(koPickRes.data || []).forEach(p => {
      if (p.picked_winner_team_id) koSel[p.match_id] = p.picked_winner_team_id
      if (p.submitted_at) koSub = p.submitted_at
    })

    setGroups(groupRes.data || [])
    setPicks(pickMap)
    setScoreMap(sMap)
    setProfile(profRes.data || null)

    setKoMatches(koMatchRes.data || [])
    setKoSelections(koSel)
    setKoSubmittedAt(koSub)

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
          <p>Invalid bracket link.</p>
          <div className="nav">
            <a className="pill" href="/">🏠 Main Menu</a>
            <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
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

      {/* Knockout first */}
      <p className="sub">Knockout bracket (read-only)</p>

      {koSubmittedAt && (
        <div className="badge" style={{ marginTop: 10 }}>
          🔒 Knockout submitted on {new Date(koSubmittedAt).toLocaleString()}
        </div>
      )}

      <KnockoutBracket
        matches={koMatches}
        selections={koSelections}
        locked={true}
        mode="view"
        subtitle="Picks show ✅/❌ once matches are finalized."
      />

      {/* Existing Group Stage section stays below */}
      <p className="sub" style={{ marginTop: 18 }}>Group stage picks (read-only)</p>

      {/* ---------- LEGEND ---------- */}
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
        <strong>Legend:</strong>

        <span
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            background: 'rgba(34,197,94,.22)',
            border: '1px solid rgba(34,197,94,.45)',
            fontWeight: 800
          }}
        >
          ✅ Exact position (+5)
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
          🟦 Qualified, wrong order (+2)
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
          ⬜ Incorrect / awaiting results (+0)
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
            const actualPos = score?.actual_position ?? null

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
                  justifyContent: 'space-between',
                  alignItems: 'center',
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
                  {actualPos !== null && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: 'rgba(0,0,0,.18)',
                        border: '1px solid rgba(255,255,255,.10)'
                      }}
                    >
                      Actual #{actualPos}
                    </span>
                  )}

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

                  {isExact && <span>✅</span>}
                  {isQualWrong && <span>🟦</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
