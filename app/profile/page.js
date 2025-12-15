'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)

  const [displayName, setDisplayName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [nameChangedAt, setNameChangedAt] = useState(null)

  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: auth } = await supabase.auth.getUser()
      const u = auth?.user ?? null
      setUser(u)

      if (!u) {
        setLoading(false)
        return
      }

      const { data: prof, error } = await supabase
        .from('profiles')
        .select('display_name, name_changed_at')
        .eq('user_id', u.id)
        .maybeSingle()

      if (error) {
        setMsg(error.message)
        setLoading(false)
        return
      }

      const dn = (prof?.display_name ?? '').trim()
      setDisplayName(dn)
      setSavedName(dn)
      setNameChangedAt(prof?.name_changed_at ?? null)
      setLoading(false)
    })()
  }, [])

  const canChangeName = !nameChangedAt

  function validateName(n) {
    const name = n.trim()
    if (name.length < 2) return 'Name must be at least 2 characters.'
    if (name.length > 24) return 'Name must be 24 characters or less.'
    if (!/^[a-zA-Z0-9 _.-]+$/.test(name))
      return 'Name can only use letters, numbers, spaces, and _ . -'
    return null
  }

  async function saveName() {
    setMsg('')
    if (!user) return

    const name = displayName.trim()
    const err = validateName(name)
    if (err) {
      setMsg(err)
      return
    }

    if (!canChangeName && name.toLowerCase() !== (savedName || '').toLowerCase()) {
      setMsg('You already used your one name change.')
      return
    }

    // If they are setting it for the first time OR changing once:
    const payload = canChangeName
      ? { display_name: name, name_changed_at: new Date().toISOString() }
      : { display_name: name } // (should only be same name anyway)

    setMsg('Saving…')

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('user_id', user.id)

    if (error) {
      // Unique index error usually contains "duplicate key"
      if ((error.message || '').toLowerCase().includes('duplicate')) {
        setMsg('That name is already taken. Please choose another.')
      } else {
        setMsg(error.message)
      }
      return
    }

    setSavedName(name)
    if (canChangeName) setNameChangedAt(payload.name_changed_at)
    setMsg('Saved ✅')
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading…</p></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ margin: 0 }}>Please sign in.</p>
          <div className="nav" style={{ marginTop: 12 }}>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <a className="pill" href="/picks">👉 Picks</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>My Profile</h1>

      <div className="card" style={{ marginTop: 12, maxWidth: 560 }}>
        <p style={{ marginTop: 0, opacity: 0.75, fontSize: 12 }}>
          Your name is shown on the leaderboard and your bracket page.
          <br />
          <strong>You can change it only once.</strong>
        </p>

        <label style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Display name</label>
        <div style={{ height: 8 }} />

        <input
          className="field"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          disabled={!canChangeName && displayName.trim().toLowerCase() !== (savedName || '').toLowerCase()}
          placeholder="Your name (e.g., Koda)"
        />

        <div style={{ height: 12 }} />

        <button className="btn btnPrimary" onClick={saveName}>
          Save Name
        </button>

        {!canChangeName && (
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
            🔒 Name change used on {new Date(nameChangedAt).toLocaleString()}.
          </p>
        )}

        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </div>
    </div>
  )
}
