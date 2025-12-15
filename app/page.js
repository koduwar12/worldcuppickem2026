'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Home() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <main className="container">
        <div className="card"><p>Loading...</p></div>
      </main>
    )
  }

  return (
    <main className="container">
      <h1 className="h1">World Cup Pick’em 2026</h1>

      {!user ? <Auth /> : <Dashboard user={user} />}
    </main>
  )
}

/* ---------- AUTH ---------- */

function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMsg(error ? error.message : 'Account created — you can sign in')
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMsg(error ? error.message : '')
  }

  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <input
        className="field"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />

      <input
        className="field"
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ marginTop: 10 }}
      />

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={signUp}>Sign Up</button>
        <button className="btn btnPrimary" onClick={signIn}>Sign In</button>
      </div>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  )
}

/* ---------- DASHBOARD ---------- */

function Dashboard({ user }) {
  async function logout() {
    await supabase.auth.signOut()
  }

  const linkStyle = {
    padding: 12,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,.15)',
    textDecoration: 'none',
    textAlign: 'center',
    fontWeight: 700
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <p>Welcome ⚽</p>
      <p style={{ fontSize: 12, opacity: 0.7 }}>{user.email}</p>

      <div className="nav" style={{ marginTop: 14, flexDirection: 'column' }}>
        <a href="/picks" style={linkStyle}>👉 Group Picks</a>
        <a href="/standings" style={linkStyle}>📊 Standings</a>
        <a href="/leaderboard" style={linkStyle}>🏆 Leaderboard</a>
        <a href="/profile" style={linkStyle}>👤 My Profile</a>
      </div>

      <button className="btn" style={{ marginTop: 14 }} onClick={logout}>
        Log out
      </button>
    </div>
  )
}
