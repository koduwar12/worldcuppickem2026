'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function AdminHubPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: auth } = await supabase.auth.getUser()
      const u = auth?.user ?? null

      if (!u) {
        setMsg('Not found.')
        setLoading(false)
        return
      }

      const { data: prof, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', u.id)
        .maybeSingle()

      if (error || !prof?.is_admin) {
        setMsg('Not found.')
        setIsAdmin(false)
        setLoading(false)
        return
      }

      setIsAdmin(true)
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading…</p></div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ margin: 0 }}>{msg || 'Not found.'}</p>
          <div className="nav" style={{ marginTop: 12 }}>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </div>
    )
  }

  const linkStyle = {
    padding: 12,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,.12)',
    textAlign: 'center',
    textDecoration: 'none',
    fontWeight: 900,
    display: 'block'
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <a className="pill" href="/standings">📊 Standings</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Admin</h1>
      <p className="sub">Choose what you want to manage.</p>

      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <a href="/admin/groups" style={linkStyle}>📊 Group Stage Admin (Enter Scores)</a>
          <a href="/admin/knockout" style={linkStyle}>🏟 Knockout Admin (Set Matchups)</a>
        </div>
      </div>
    </div>
  )
}
