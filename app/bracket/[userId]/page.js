'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

export default function ViewBracketPage({ params }) {
  const userId = params?.user_id

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [groups, setGroups] = useState([])
  const [picks, setPicks] = useState({})
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!userId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function load() {
    setLoading(true)
    setMsg('')

    // Load groups + teams
    const { data: groupData, error: gErr } = await supabase
      .from('groups')
      .select('id, name, teams(id, name)')
      .order('name')

    if (gErr) {
      setMsg(gErr.message)
      setLoading(false)
      return
    }

    // Load that user's picks (submitted only)
    const { data: pickData, error: pErr } = await supabase
      .from('group_picks')
      .select('group_id, team_id, position, submitted_at')
      .eq('user_id', userId)
      .not('submitted_at', 'is', null)

    if (pErr) {
      setMsg(pErr.message)
      setLoading(false)
      return
    }

    // Optional: display name from profiles
    const { data: profileData } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', userId)
      .maybeSingle()

    setGroups(groupData || [])

    const map = {}
    pickData?.forEach(p => {
      map[`${p.group_id}-${p.position}`] = p.team_id
    })

    setPicks(map)
    setProfile(profileData || null)
    setLoading(false)
  }

  if (!userId) {
    return (
      <div className="container">
        <div className="card">
          <p>Invalid bracket link.</p>
          <div className="nav" style={{ marginTop: 10 }}>
            <a className="pill" href="/leaderboard">🏆 Back to Leaderboard</a>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ margin: 0, color: 'rgba(234,240,255,.75)' }}>Loading bracket…</p>
        </div>
      </div>
    )
  }

  if (msg) {
    return (
      <div className="container">
        <div className="card">
          <p>{msg}</p>
          <div className="nav" style={{ marginTop: 10 }}>
            <a className="pill" href="/leaderboard">🏆 Back to Leaderboard</a>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </div>
    )
  }

  const displayName =
    profile?.display_name?.trim() ||
    `User ${String(userId).slice(0, 6)}`

  return (
    <div className="container">
      {/* ---------- NAV ---------- */}
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <a className="pill" href="/standings">📊 Standings</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>
        {displayName}’s Bracket
      </h1>
      <p className="sub">Group stage picks (read-only)</p>

      {Object.keys(picks).length === 0 && (
        <div className="badge" style={{ marginTop: 10 }}>
          No submitted picks found for this user yet.
        </div>
      )}

      {groups.map(group => (
        <div key={group.id} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle">{group.name}</h2>

          {group.teams.map((_t, index) => {
            const position = index + 1
            const pickedTeamId = picks[`${group.id}-${position}`]
            const pickedTeam = group.teams.find(t => t.id === pickedTeamId)

            return (
              <div
                key={position}
                style={{
                  padding: 10,
                  marginTop: 8,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10
                }}
              >
                <span style={{ fontWeight: 900 }}>#{position}</span>
                <span style={{ fontWeight: 750 }}>
                  {pickedTeam ? pickedTeam.name : '—'}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
