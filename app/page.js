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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <main className="container">
        <div className="card">
          <p>Loading…</p>
        </div>
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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [mode, setMode] = useState('signin') // signin | signup

  async function signUp() {
    setMsg('Creating account…')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name
        }
      }
    })

    setMsg(
      error
        ? error.message
        : 'Check your email to verify your account, then return and sign in.'
    )
  }

  async function signIn() {
    setMsg('Signing in…')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMsg(error ? error.message : '')
  }

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h2 className="cardTitle" style={{ marginTop: 0 }}>
        {mode === 'signup' ? 'Create Account' : 'Sign In'}
      </h2>

      {mode === 'signup' && (
        <>
          <input
            className="field"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div style={{ height: 10 }} />
        </>
      )}

      <input
        className="field"
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <div style={{ height: 10 }} />

      <input
        className="field"
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <div style={{ height: 14 }} />

      <div style={{ display: 'flex', gap: 10 }}>
        {mode === 'signup' ? (
          <button
            className="btn btnPrimary"
            onClick={signUp}
            disabled={!name || !email || !password}
          >
            Sign Up
          </button>
        ) : (
          <button
            className="btn btnPrimary"
            onClick={signIn}
            disabled={!email || !password}
          >
            Sign In
          </button>
        )}

        <button
          className="btn"
          onClick={() => {
            setMsg('')
            setMode(mode === 'signup' ? 'signin' : 'signup')
          }}
        >
          {mode === 'signup' ? 'Have an account?' : 'Create account'}
        </button>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  )
}

/* ---------- DASHBOARD ---------- */

function Dashboard({ user }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, is_admin')
        .eq('user_id', user.id)
        .maybeSingle()

      if (data) {
        setIsAdmin(!!data.is_admin)
        setName(data.display_name || '')
      }
    })()
  }, [user.id])

  async function logout() {
    await supabase.auth.signOut()
  }

  const linkStyle = {
    padding: 12,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,.12)',
    textAlign: 'center',
    textDecoration: 'none',
    fontWeight: 800
  }

  return (
    <div className="card" style={{ marginTop: 16, maxWidth: 760 }}>
      <p style={{ fontWeight: 900, marginTop: 0 }}>
        Welcome{ name ? `, ${name}` : '' } ⚽
      </p>

      <p style={{ fontSize: 12, opacity: 0.7 }}>
        {user.email}
      </p>

      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        <a href="/picks" style={linkStyle}>👉 Group Picks</a>
        <a href="/standings" style={linkStyle}>📊 Standings</a>
        <a href="/leaderboard" style={linkStyle}>🏆 Leaderboard</a>
        <a href="/profile" style={linkStyle}>👤 My Profile</a>

        {isAdmin && (
          <a href="/admin" style={linkStyle}>🛠 Admin</a>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <button className="btn" onClick={logout}>Log out</button>
      </div>
    </div>
  )
}
