'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function LeaderboardPage() {
  const [rows, setRows] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: auth } = await supabase.auth.getUser()
    setMe(auth?.user ?? null)

    const { data, error } = await supabase
      .from('leaderboard')
      .select('user_id, name, points')
      .order('points', { ascending: false })

    if (!error) setRows(data || [])
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

      <div className="card" style={{ marginTop: 18 }}>
        {rows.map((r, idx) => {
          const isMe = me?.id === r.user_id

          return (
            <a
              key={r.user_id}
              href={`/bracket/${r.user_id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: 12,
                marginTop: idx === 0 ? 0 : 8,
                borderRadius: 12,
                textDecoration: 'none',
                fontWeight: 800,
                background: isMe
                  ? 'rgba(250,204,21,.22)'
                  : 'rgba(255,255,255,.05)',
                outline: isMe
                  ? '2px solid rgba(250,204,21,.5)'
                  : '1px solid rgba(255,255,255,.1)',
                color: 'inherit'
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
    </div>
  )
}
