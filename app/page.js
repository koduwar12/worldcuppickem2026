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
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <p>Loading...</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>World Cup Pick’em 2026</h1>
      {!user ? <Auth /> : <Dashboard user={user} />}
    </main>
  )
}

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
    <div style={{ maxWidth: 360 }}>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={signUp}>Sign Up</button>
        <button onClick={signIn}>Sign In</button>
      </div>

      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}

function Dashboard({ user }) {
  async function logout() {
    await supabase.auth.signOut()
  }

  const linkStyle = {
    padding: 10,
    border: '1px solid #000',
    textAlign: 'center',
    textDecoration: 'none'
  }

  return (
    <div style={{ marginTop: 16 }}>
      <p>Welcome! ⚽</p>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        Logged in as {user.email}
      </p>

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxWidth: 260
        }}
      >
        <a href="/picks" style={linkStyle}>👉 Go to Group Picks</a>
        <a href="/standings" style={linkStyle}>📊 View Standings</a>
        <a href="/leaderboard" style={linkStyle}>🏆 View Leaderboard</a>

        <a href="/admin" style={linkStyle}>🛠 Admin: Group Match Results</a>

        <button onClick={logout}>Log out</button>
      </div>
    </div>
  )
}
