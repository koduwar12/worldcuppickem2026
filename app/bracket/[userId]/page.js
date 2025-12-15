'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useParams } from 'next/navigation'

export default function ViewBracketPage() {
  const params = useParams()
  const userId = params.user_id

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [groups, setGroups] = useState([])
  const [picks, setPicks] = useState({})
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

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

    // Load that user's picks
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

    // Optional: load display name if you have profiles table
    const { data: profileData } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', userId)
      .single()

    setGroups(groupData || [])

    const map = {}
    pickData?.forEach(p => {
      map[`${p.group_id}-${p.position}`] = p.team_id
    })

    setPicks(map)
    setProfile(profileData || null)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p>Loading bracket…</p>
        </div>
      </div>
    )
  }

  if (msg) {
    return (
      <div className="container">
        <div className="card">
          <p>{msg}</p>
        </div>
      </div>
    )
  }

  const displayName =
    profile?.display_name ||
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
      <p className="sub">
        Group stage picks (read-only)
      </p>

      {groups.map(group => (
        <div key={group.id} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle">{group.name}</h2>

          {group.teams.map((team, index) => {
            const position = index + 1
            const pickedTeamId = picks[`${group.id}-${position}`]
            const pickedTeam = group.teams.find(t => t.id === pickedTeamId)

            return (
              <div
                key={position}
                style={{
                  padding: 10,
                  marginTop: 6,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)'
                }}
              >
                <strong>#{position}</strong>{' '}
                {pickedTeam ? pickedTeam.name : '—'}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
