'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Deadline: March 11, 2026, 12:00 AM EST
 * EST is UTC-5, so that's 2026-03-11T05:00:00Z in UTC.
 */
const DEADLINE_UTC = '2026-03-11T05:00:00Z'

export default function PicksPage() {
  const [user, setUser] = useState(null)
  const [groups, setGroups] = useState([])
  const [picks, setPicks] = useState({})
  const [submittedAt, setSubmittedAt] = useState(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const deadline = useMemo(() => new Date(DEADLINE_UTC), [])
  const locked = Date.now() >= deadline.getTime()

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    setMsg('')

    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) {
      setUser(null)
      setLoading(false)
      return
    }
    setUser(auth.user)

    const { data: groupData, error: gErr } = await supabase
      .from('groups')
      .select('id, name, teams(id, name)')
      .order('name')

    if (gErr) {
      setMsg(gErr.message)
      setLoading(false)
      return
    }

    const { data: pickData, error: pErr } = await supabase
      .from('group_picks')
      .select('group_id, team_id, position, submitted_at')
      .eq('user_id', auth.user.id)

    if (pErr) {
      setMsg(pErr.message)
      setLoading(false)
      return
    }

    setGroups(groupData || [])

    const map = {}
    let sub = null

    ;(pickData || []).forEach(p => {
      map[`${p.group_id}-${p.position}`] = p.team_id
      if (p.submitted_at) sub = p.submitted_at
    })

    setPicks(map)
    setSubmittedAt(sub)
    setLoading(false)
  }

  async function saveDraft() {
    if (!user) return
    if (locked) {
      setMsg('Group picks are locked (deadline passed).')
      return
    }

    setMsg('Saving...')

    // IMPORTANT:
    // If they've already submitted once, DO NOT clear submitted_at.
    // (Option A: only submitted picks count. We don't want "Save Draft" to accidentally un-submit them.)
    const keepSubmittedAt = submittedAt || null

    const rows = Object.entries(picks).map(([key, teamId]) => {
      const [group_id, position] = key.split('-')
      return {
        user_id: user.id,
        group_id: Number(group_id),
        team_id: Number(teamId),
        position: Number(position),
        submitted_at: keepSubmittedAt
      }
    })

    const { error } = await supabase.from('group_picks').upsert(rows)
    setMsg(error ? error.message : 'Saved ✅')
  }

  async function submit() {
    if (!user) return
    if (locked) {
      setMsg('Group picks are locked (deadline passed).')
      return
    }

    // Require full rankings before submit
    for (const g of groups) {
      for (let pos = 1; pos <= g.teams.length; pos++) {
        if (!picks[`${g.id}-${pos}`]) {
          setMsg('Please complete all group rankings before submitting.')
          return
        }
      }
    }

    const now = new Date().toISOString()
    setMsg('Submitting...')

    const rows = Object.entries(picks).map(([key, teamId]) => {
      const [group_id, position] = key.split('-')
      return {
        user_id: user.id,
        group_id: Number(group_id),
        team_id: Number(teamId),
        position: Number(position),
        submitted_at: now
      }
    })

    const { error } = await supabase.from('group_picks').upsert(rows)
    if (error) {
      setMsg(error.message)
      return
    }

    setSubmittedAt(now)
    setMsg('Submitted ✅ (You can still edit until the deadline)')
  }

  function deadlineLabelEST() {
    // Show as Eastern time (browser will localize; label explains intent)
    return new Date(DEADLINE_UTC).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }) + ' ET'
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading...</p></div>
      </div>
    )
  }

  return (
    <div className="container">
      {/* ---------- TOP NAV ---------- */}
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/standings">📊 Standings</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <a className="pill" href="/profile">👤 My Profile</a>
      </div>

      <h1 className="h1" style={{ marginTop: 14 }}>Group Picks</h1>
      <p className="sub">
        You can edit anytime until <strong>{deadlineLabelEST()}</strong>. After that, picks lock for everyone.
      </p>

      {/* Status banner */}
      <div className="card" style={{ marginTop: 12 }}>
        {locked ? (
          <p style={{ margin: 0, fontWeight: 800 }}>
            🔒 Locked — deadline has passed.
          </p>
        ) : submittedAt ? (
          <p style={{ margin: 0, fontWeight: 800 }}>
            ✅ Submitted (counts for scoring). You can still edit and re-submit until the deadline.
          </p>
        ) : (
          <p style={{ margin: 0, fontWeight: 800 }}>
            ⏳ Not submitted yet — make sure you submit before the deadline (Option A).
          </p>
        )}
      </div>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      {groups.map(group => (
        <div key={group.id} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle">{group.name}</h2>
          <p className="cardSub">Rank teams from 1st to last</p>

          {group.teams.map((team, index) => {
            const position = index + 1
            return (
              <div key={team.id} style={{ marginBottom: 8 }}>
                <select
                  className="field"
                  disabled={locked}
                  value={picks[`${group.id}-${position}`] || ''}
                  onChange={e =>
                    setPicks(prev => ({
                      ...prev,
                      [`${group.id}-${position}`]: e.target.value
                    }))
                  }
                >
                  <option value="">Rank {position}</option>
                  {group.teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      ))}

      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" disabled={locked} onClick={saveDraft}>
          Save
        </button>
        <button className="btn btnPrimary" disabled={locked} onClick={submit}>
          Submit (Required before deadline)
        </button>
      </div>
    </div>
  )
}
