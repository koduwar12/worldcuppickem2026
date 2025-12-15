'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function LeaderboardPage() {
  const [rows, setRows] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setMsg('')

    const { data: auth } = await supabase.auth.getUser()
    setMe(auth?.user ?? null)

    // Expect a view/table named leaderboard OR leaderboard_view
    const candidates = ['leaderboard', 'leaderboard_view']

    for (const name of candidates) {
      const res = await supabase.from(name).select('*').order('points', { ascending: false })
      if (!res.error) {
        const base = res.data || []

        // Pull profiles for display_name
        const userIds = [...new Set(base.map(r => r.user_id).filter(Boolean))]
        let profileMap = {}

        if (userIds.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', userIds)

          for (const p of profs || []) profileMap[p.user_id] = p.display_name
        }

        const normalized = base.map(r => {
          const user_id = r.user_id ?? r.userid ?? r.id ?? r.user
          const nameFromProfile = (profileMap[user_id] || '').trim()

          return {
            user_id,
            name: nameFromProfile || r.name || r.email || 'Unknown',
            points: r.points ?? r.total_points ?? 0
          }
        })

        setRows(normalized)
        setLoading(false)
        return
      }
    }

    setRows([])
    setMsg('Could not load leaderboard (missing leaderboard table/view).')
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading leaderboard…</p></div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/standings">📊 Standings</a>
        <a className="pill" href="/profile">👤 My Profile</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Leaderboard</h1>

      {msg && (
        <div className="card" style={{ marginTop: 14 }}>
          <p style={{ marginTop: 0, fontWeight: 800 }}>Leaderboard error:</p>
          <p style={{ marginBottom: 0, opacity: 0.85 }}>{msg}</p>
        </div>
      )}

      {!msg && rows.length === 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <p style={{ margin: 0 }}>No leaderboard data yet.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          {rows.map((r, idx) => {
            const isMe = me?.id && r.user_id === me.id
            return (
              <a
                key={r.user_id || idx}
                href={r.user_id ? `/bracket/${r.user_id}` : '#'}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 12,
                  marginTop: idx === 0 ? 0 : 8,
                  borderRadius: 12,
                  textDecoration: 'none',
                  fontWeight: 900,
                  background: isMe ? 'rgba(34,197,94,.14)' : 'rgba(255,255,255,.05)',
                  outline: isMe ? '2px solid rgba(34,197,94,.35)' : '1px solid rgba(255,255,255,.10)',
                  color: '#fff'
                }}
              >
                <span>
                  #{idx + 1} {r.name} {isMe ? '(You)' : ''}
                </span>
                <span>{r.points} pts</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
