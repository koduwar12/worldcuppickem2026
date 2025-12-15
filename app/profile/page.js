'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [user, setUser] = useState(null)

  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const u = auth?.user ?? null
      setUser(u)

      if (!u) {
        setMsg('Please sign in first.')
        setLoading(false)
        return
      }

      const { data: prof, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', u.id)
        .maybeSingle()

      if (error) setMsg(error.message)
      setDisplayName(prof?.display_name ?? '')
      setLoading(false)
    })()
  }, [])

  async function save() {
    if (!user) return
    setMsg('Saving...')

    const name = displayName.trim()
    if (!name) {
      setMsg('Please enter a display name.')
      return
    }

    const { error } = await supabase.from('profiles').upsert({
      user_id: user.id,
      display_name: name
    })

    setMsg(error ? error.message : 'Saved ✅')
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
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <a className="pill" href="/picks">👉 Group Picks</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>My Profile</h1>
      <p className="sub">Set your name so friends can recognize you.</p>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <div className="card" style={{ marginTop: 18, maxWidth: 520 }}>
        <label style={{ display: 'block', fontWeight: 800, marginBottom: 8 }}>
          Display Name
        </label>

        <input
          className="field"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="e.g. Koda, Andy, Mom, Uncle Mike..."
          style={{ width: '100%' }}
        />

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btnPrimary" onClick={save}>Save</button>
        </div>

        {user && (
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
            Logged in as {user.email}
          </p>
        )}
      </div>
    </div>
  )
}
