'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function PicksPage() {
  const [user, setUser] = useState(null)
  const [groups, setGroups] = useState([])
  const [picks, setPicks] = useState({})
  const [submittedAt, setSubmittedAt] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return
    setUser(auth.user)

    const { data: groupData } = await supabase
      .from('groups')
      .select('id, name, teams(id, name)')
      .order('name')

    const { data: pickData } = await supabase
      .from('group_picks')
      .select('group_id, team_id, position, rank, submitted_at')
      .eq('user_id', auth.user.id)

    setGroups(groupData || [])

    const map = {}
    let sub = null

    pickData?.forEach(p => {
      map[`${p.group_id}-${p.position}`] = p.team_id
      if (p.submitted_at) sub = p.submitted_at
    })

    setPicks(map)
    setSubmittedAt(sub)
  }

  const locked = !!submittedAt

  async function saveDraft() {
    if (!user || locked) return
    setMsg('Saving...')

    const rows = Object.entries(picks).map(([key, teamId]) => {
      const [group_id, position] = key.split('-')

      return {
        user_id: user.id,
        group_id,
        team_id: teamId,
        position: Number(position),
        rank: Number(position), // satisfy NOT NULL constraint
        submitted_at: null
      }
    })

    const { error } = await supabase.from('group_picks').upsert(rows)
    setMsg(error ? error.message : 'Draft saved ✅')
  }

  async function submit() {
    if (!user || locked) return

    for (const g of groups) {
      for (let p = 1; p <= g.teams.length; p++) {
        if (!picks[`${g.id}-${p}`]) {
          setMsg('Please complete all group rankings before submitting.')
          return
        }
      }
    }

    const now = new Date().toISOString()

    const rows = Object.entries(picks).map(([key, teamId]) => {
      const [group_id, position] = key.split('-')

      return {
        user_id: user.id,
        group_id,
        team_id: teamId,
        position: Number(position),
        rank: Number(position), // satisfy NOT NULL constraint
        submitted_at: now
      }
    })

    const { error } = await supabase.from('group_picks').upsert(rows)
    if (!error) setSubmittedAt(now)

    setMsg(error ? error.message : 'Submitted! Picks locked 🔒')
  }

  return (
    <div className="container">
      {/* ---------- NAV ---------- */}
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/standings">📊 Standings</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Group Picks</h1>
      <p className="sub">
        Rank teams in each group. Submitting locks your picks.
      </p>

      {locked && (
        <div className="badge">
          🔒 Submitted on {new Date(submittedAt).toLocaleString()}
        </div>
      )}

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      {groups.map(group => (
        <div key={group.id} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle">{group.name}</h2>
          <p className="cardSub">Rank teams from 1st to last</p>

          {group.teams.map((team, index) => {
            const position = index + 1

            return (
              <select
                key={team.id}
                className="field"
                disabled={locked}
                value={picks[`${group.id}-${position}`] || ''}
                onChange={e =>
                  setPicks(prev => ({
                    ...prev,
                    [`${group.id}-${position}`]: e.target.value
                  }))
                }
                style={{ marginBottom: 8 }}
              >
                <option value="">Rank {position}</option>
                {group.teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )
          })}
        </div>
      ))}

      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" disabled={locked} onClick={saveDraft}>
          Save Draft
        </button>
        <button className="btn btnPrimary" disabled={locked} onClick={submit}>
          Submit Picks (Locks 🔒)
        </button>
      </div>
    </div>
  )
}
