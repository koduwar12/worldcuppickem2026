'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Home() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial session check
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null)
      setLoading(false)
    })

    // Listen for login/logout
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

/* ---------- AUTH ---------- */

function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMsg(error ? error.message : 'Account created — you can now sign in')
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
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

/* ---------- DASHBOARD ---------- */

function Dashboard({ user }) {
  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div style={{ marginTop: 16 }}>
      <p>Welcome! ⚽</p>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        Logged in as {user.email}
      </p>

      <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
        <a href="/picks">Go to Group Picks</a>
        <button onClick={logout}>Log out</button>
      </div>
    </div>
  )
}
