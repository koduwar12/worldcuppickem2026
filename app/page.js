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

  if (loading) return <p>Loading...</p>

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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    setMsg(error ? error.message : '')
  }

  return (
    <>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <br />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <br />
      <button onClick={signUp}>Sign Up</button>
      <button onClick={signIn}>Sign In</button>
      <p>{msg}</p>
    </>
  )
}

function Dashboard({ user }) {
  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <>
      <p>Welcome! ⚽</p>
      <p style={{ fontSize: 12 }}>Logged in as {user.email}</p>
      <button onClick={logout}>Log out</button>
    </>
  )
}
