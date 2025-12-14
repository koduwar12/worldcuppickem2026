'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [matches, setMatches] = useState([])
  const [msg, setMsg] = useState('Loading...')

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const u = data?.user ?? null
      setUser(u)

      if (!u) {
        setMsg('Please sign in first.')
        return
      }

      // Check admin allowlist in DB
      const { data: adminRow, error: adminErr } = await supabase
        .from('admin_emails')
        .select('email')
        .eq('email', u.email)
        .maybeSingle()

      if (adminErr) {
        setMsg(adminErr.message)
        return
      }

      if (!adminRow) {
        setIsAdmin(false)
        setMsg('Not authorized (admin only).')
        return
      }

      setIsAdmin(true)

      await loadMatches()
      setMsg('')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMatches() {
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        group_id,
        kickoff_at,
        home_score,
        away_score,
        is_final,
        home:home_team_id ( name ),
        away:away_team_id ( name )
      `)
      .order('group_id', { ascending: true })

    if (error) {
      setMsg(error.message)
      return
    }

    setMatches(data ?? [])
  }

  async function updateMatch(id, patch) {
    setMsg('Saving...')
    const { error } = await supabase.from('matches').update(patch).eq('id', id)
    if (error) {
      setMsg(error.message)
      return
    }
    setMsg('Saved ✅')
    await loadMatches()
  }

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Admin</h1>
        <p>{msg}</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Admin</h1>
        <p>{msg}</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin — Enter Match Results</h1>
      {msg && <p>{msg}</p>}

      {matches.map(m => (
        <div
          key={m.id}
          style={{
            border: '1px solid #ddd',
            padding: 12,
            marginTop: 12,
            maxWidth: 520
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Group {m.group_id} {m.is_final ? '• FINAL' : ''}
          </div>

          <div style={{ marginTop: 6, fontWeight: 600 }}>
            {m.home?.name} vs {m.away?.name}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <input
              type="number"
              placeholder="Home"
              defaultValue={m.home_score ?? ''}
              disabled={m.is_final}
              onBlur={e => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                updateMatch(m.id, { home_score: v })
              }}
              style={{ width: 90, padding: 8 }}
            />

            <input
              type="number"
              placeholder="Away"
              defaultValue={m.away_score ?? ''}
              disabled={m.is_final}
              onBlur={e => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                updateMatch(m.id, { away_score: v })
              }}
              style={{ width: 90, padding: 8 }}
            />

            <button
              onClick={() => updateMatch(m.id, { is_final: true })}
              disabled={m.is_final || m.home_score === null || m.away_score === null}
            >
              Finalize
            </button>

            {m.is_final && (
              <button onClick={() => updateMatch(m.id, { is_final: false })}>
                Unfinalize
              </button>
            )}
          </div>

          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            Tip: enter both scores, then click Finalize.
          </p>
        </div>
      ))}
    </main>
  )
}
