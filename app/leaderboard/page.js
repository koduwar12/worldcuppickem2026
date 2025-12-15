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

    // Try these in order (in case your DB object is named differently)
    const candidates = ['leaderboard', 'leaderboard_view', 'leaderboard_public']

    let lastErr = null
    for (const name of candidates) {
      const res = await supabase
        .from(name)
        .select('*')
        .order('points', { ascending: false })

      if (!res.error) {
        // Normalize columns (in case names differ)
        const normalized = (res.data || []).map(r => ({
          user_id: r.user_id ?? r.userid ?? r.id ?? r.user,
          name: r.name ?? r.display_name ?? r.username ?? r.email ?? 'Unknown',
          points: r.points ?? r.total_points ?? 0
        }))

        setRows(normalized)
        setLoading(false)
        return
      }

      lastErr = `Tried "${name}": ${res.error.message}`
    }

    // If we get here, all attempts failed
    setMsg(lastErr || 'Could not load leaderboard.')
    setRows([])
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
          <p style={{ margin: 0 }}>
            No leaderboard data yet. (This usually means no picks/results have been scored yet, or your leaderboard view/table is empty.)
          </p>
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
                  fontWeight: 800,
                  background: isMe ? 'rgba(250,204,21,.22)' : 'rgba(255,255,255,.05)',
                  outline: isMe ? '2px solid rgba(250,204,21,.5)' : '1px solid rgba(255,255,255,.1)',
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
