'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Deadline: March 11, 2026, 12:00 AM EST
 * EST is UTC-5, so that's 2026-03-11T05:00:00Z in UTC.
 */
const DEADLINE_UTC = '2026-03-11T05:00:00Z'

// ✅ UUID-safe key separator (UUIDs contain "-")
const KEY_SEP = '::'
const makeKey = (groupId, pos) => `${groupId}${KEY_SEP}${pos}`
const parseKey = key => {
  const parts = String(key).split(KEY_SEP)
  const group_id = parts[0]
  const position = Number(parts[1])
  return { group_id, position }
}

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

  function deadlineLabelEST() {
    return (
      new Date(DEADLINE_UTC).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }) + ' ET'
    )
  }

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

    // ✅ select('*') so it works whether your table uses "position" or "rank"
    const { data: pickData, error: pErr } = await supabase
      .from('group_picks')
      .select('*')
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
      const pos = p.position ?? p.rank // ✅ whichever exists in your DB
      if (p.group_id && pos != null) {
        map[makeKey(p.group_id, pos)] = p.team_id
      }
      if (p.submitted_at) sub = p.submitted_at
    })

    setPicks(map)
    setSubmittedAt(sub)
    setLoading(false)
  }

  // ✅ Upsert helper that supports either schema:
  // tries "position" first, then falls back to "rank" if needed.
  async function upsertGroupPicks(rows, preferredCol /* 'position'|'rank' */) {
    // Try position first by default
    const tryCols = preferredCol === 'rank' ? ['rank', 'position'] : ['position', 'rank']

    for (const col of tryCols) {
      const payload = rows.map(r => {
        const base = {
          user_id: r.user_id,
          group_id: r.group_id,
          team_id: r.team_id,
          submitted_at: r.submitted_at
        }
        if (col === 'position') return { ...base, position: r.position }
        return { ...base, rank: r.position }
      })

      const { error } = await supabase.from('group_picks').upsert(payload)

      if (!error) return { ok: true, used: col }

      const msg = String(error.message || '')
      const missingPosition = msg.toLowerCase().includes('column') && msg.toLowerCase().includes('position') && msg.toLowerCase().includes('does not exist')
      const missingRank = msg.toLowerCase().includes('column') && msg.toLowerCase().includes('rank') && msg.toLowerCase().includes('does not exist')

      // If the column literally doesn't exist, try the other one
      if ((col === 'position' && missingPosition) || (col === 'rank' && missingRank)) {
        continue
      }

      // Otherwise it's a real error (RLS, nulls, etc.)
      return { ok: false, error }
    }

    return { ok: false, error: { message: 'Neither "position" nor "rank" columns could be used.' } }
  }

  async function saveDraft() {
    if (!user) return
    if (locked) {
      setMsg('Group picks are locked (deadline passed).')
      return
    }

    setMsg('Saving...')

    // If they already submitted once, keep submitted_at (don’t “unsubmit”)
    const keepSubmittedAt = submittedAt || null

    const rows = Object.entries(picks)
      .map(([key, teamId]) => {
        const { group_id, position } = parseKey(key)

        // ✅ Only write complete rows
        if (!group_id) return null
        if (!Number.isFinite(position)) return null
        if (!teamId) return null

        return {
          user_id: user.id,
          group_id,      // UUID safe
          team_id: teamId, // UUID safe
          position,
          submitted_at: keepSubmittedAt
        }
      })
      .filter(Boolean)

    if (rows.length === 0) {
      setMsg('Pick at least one team before saving.')
      return
    }

    const res = await upsertGroupPicks(rows, 'position')
    if (!res.ok) {
      setMsg(res.error?.message || 'Save failed.')
      return
    }

    setMsg(`Saved ✅`)
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
        if (!picks[makeKey(g.id, pos)]) {
          setMsg('Please complete all group rankings before submitting.')
          return
        }
      }
    }

    const now = new Date().toISOString()
    setMsg('Submitting...')

    const rows = Object.entries(picks)
      .map(([key, teamId]) => {
        const { group_id, position } = parseKey(key)
        if (!group_id) return null
        if (!Number.isFinite(position)) return null
        if (!teamId) return null

        return {
          user_id: user.id,
          group_id,
          team_id: teamId,
          position,
          submitted_at: now
        }
      })
      .filter(Boolean)

    const expected = groups.reduce((sum, g) => sum + (g?.teams?.length || 0), 0)
    if (rows.length !== expected) {
      setMsg('Internal error: some picks were missing. Please refresh and try again.')
      return
    }

    const res = await upsertGroupPicks(rows, 'position')
    if (!res.ok) {
      setMsg(res.error?.message || 'Submit failed.')
      return
    }

    setSubmittedAt(now)
    setMsg('Submitted ✅ (You can still edit until the deadline)')
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

      <div className="card" style={{ marginTop: 12 }}>
        {locked ? (
          <p style={{ margin: 0, fontWeight: 800 }}>🔒 Locked — deadline has passed.</p>
        ) : submittedAt ? (
          <p style={{ margin: 0, fontWeight: 800 }}>
            ✅ Submitted (counts for scoring). You can still edit and re-submit until the deadline.
          </p>
        ) : (
          <p style={{ margin: 0, fontWeight: 800 }}>
            ⏳ Not submitted yet — make sure you submit before the deadline.
          </p>
        )}
      </div>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      {groups.map(group => (
        <div key={group.id} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle">{group.name}</h2>
          <p className="cardSub">Rank teams from 1st to last</p>

          {group.teams.map((team, index) => {
            const pos = index + 1
            const k = makeKey(group.id, pos)

            return (
              <div key={team.id} style={{ marginBottom: 8 }}>
                <select
                  className="field"
                  disabled={locked}
                  value={picks[k] || ''}
                  onChange={e =>
                    setPicks(prev => ({
                      ...prev,
                      [k]: e.target.value
                    }))
                  }
                >
                  <option value="">Rank {pos}</option>
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
