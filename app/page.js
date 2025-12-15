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

    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ margin: 0, color: 'rgba(234,240,255,.75)' }}>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="hero">
        <div>
          <h1 className="h1">World Cup Pick’em 2026</h1>
          <p className="sub">
            Friends & family bracket challenge — pick groups, track standings, climb the leaderboard.
          </p>
          <div className="nav">
            <span className="badge">⚽ Built for June kick-off</span>
            <span className="badge">🔒 Picks lock on submit</span>
            <span className="badge">📊 Live standings (finalized games)</span>
          </div>
        </div>
      </div>

      <div className="card">
        {!user ? <Auth /> : <Dashboard user={user} />}
      </div>

      <div className="footerNote">
        Tip: set a display name on the leaderboard so everyone recognizes you.
      </div>
    </div>
  )
}

function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function signUp() {
    const e = email.trim()
    const p = password.trim()
    if (!e || !p) return setMsg('Please enter an email and password.')

    const { error } = await supabase.auth.signUp({ email: e, password: p })
    setMsg(error ? error.message : 'Account created — you can sign in')
  }

  async function signIn() {
    const e = email.trim()
    const p = password.trim()
    if (!e || !p) return setMsg('Please enter an email and password.')

    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p })
    setMsg(error ? error.message : '')
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h2 className="cardTitle">Sign in</h2>
      <p className="cardSub">Use your email + password.</p>

      <div className="row" style={{ flexDirection: 'column' }}>
        <input
          className="field"
          type="email"
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
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btnPrimary" onClick={signIn}>Sign In</button>
        <button className="btn" onClick={signUp}>Sign Up</button>
      </div>

      {msg && <p style={{ marginTop: 12, color: 'rgba(234,240,255,.80)' }}>{msg}</p>}
    </div>
  )
}

function Dashboard({ user }) {
  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="cardTitle">Welcome ⚽</h2>
          <p className="cardSub" style={{ marginBottom: 0 }}>
            Logged in as <span style={{ color: 'rgba(234,240,255,.90)' }}>{user.email}</span>
          </p>
        </div>

        <button className="btn btnDanger" onClick={logout}>Log out</button>
      </div>

      <div className="grid">
        <a className="linkCard" href="/picks">
          <p className="linkTitle">👉 Group Picks</p>
          <p className="linkDesc">Submit your group rankings (locks after submit).</p>
        </a>

        <a className="linkCard" href="/standings">
          <p className="linkTitle">📊 Standings</p>
          <p className="linkDesc">Live group tables from finalized matches.</p>
        </a>

        <a className="linkCard" href="/leaderboard">
          <p className="linkTitle">🏆 Leaderboard</p>
          <p className="linkDesc">See who’s winning and open brackets.</p>
        </a>

        <a className="linkCard" href="/admin">
          <p className="linkTitle">🛠 Admin</p>
          <p className="linkDesc">Enter match results (finalize games).</p>
        </a>
      </div>
    </div>
  )
}
