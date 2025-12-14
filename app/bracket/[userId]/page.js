'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

export default function BracketPage({ params }) {
  const userId = params.userId

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [viewer, setViewer] = useState(null)

  const [profile, setProfile] = useState(null)
  const [groups, setGroups] = useState([])
  const [teams, setTeams] = useState([])
  const [picks, setPicks] = useState([])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      // Require sign-in (friends & family only)
      const { data: auth } = await supabase.auth.getUser()
      const u = auth?.user ?? null
      setViewer(u)

      if (!u) {
        setMsg('Please sign in to view brackets.')
        setLoading(false)
        return
      }

      // Load submitted profile
      const profRes = await supabase
        .from('profiles')
        .select('user_id, display_name, submitted_at, bracket_submitted')
        .eq('user_id', userId)
        .maybeSingle()

      if (profRes.error) {
        setMsg(profRes.error.message)
        setLoading(false)
        return
      }

      if (!profRes.data || !profRes.data.bracket_submitted) {
        setMsg('This bracket is not available (not submitted yet).')
        setLoading(false)
        return
      }

      setProfile(profRes.data)

      // Load groups, teams, and this user's submitted picks
      const [gRes, tRes, pRes] = await Promise.all([
        supabase.from('groups').select('*').order('id'),
        supabase.from('teams').select('*').order('name'),
        supabase
          .from('group_picks')
          .select('group_id, position, team_id, submitted_at')
          .eq('user_id', userId)
      ])

      if (gRes.error || tRes.error || pRes.error) {
        setMsg(
          gRes.error?.message ||
            tRes.error?.message ||
            pRes.error?.message ||
            'Failed to load bracket'
        )
        setLoading(false)
        return
      }

      setGroups(gRes.data ?? [])
      setTeams(tRes.data ?? [])
      setPicks(pRes.data ?? [])

      setLoading(false)
    })()
  }, [userId])

  const teamNameById = useMemo(() => {
    const map = {}
    for (const t of teams) map[t.id] = t.name
    return map
  }, [teams])

  const picksByGroup = useMemo(() => {
    const map = {}
    for (const p of picks) {
      if (!map[p.group_id]) map[p.group_id] = {}
      map[p.group_id][p.position] = p.team_id
    }
    return map
  }, [picks])

  function posLabel(pos) {
    if (pos === 1) return '1st'
    if (pos === 2) return '2nd'
    if (pos === 3) return '3rd'
    return '4th'
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Bracket</h1>
        <p>Loading...</p>
      </main>
    )
  }

  if (msg) {
    return (
      <main style={{ padding: 24 }}>
        <nav style={{ marginBottom: 14 }}>
          <a href="/">Home</a> ·{' '}
          <a href="/leaderboard">Leaderboard</a> ·{' '}
          <a href="/standings">Standings</a>
        </nav>

        <h1>Bracket</h1>
        <p>{msg}</p>
      </main>
    )
  }

  const displayName =
    (profile.display_name && profile.display_name.trim()) ||
    `User ${String(profile.user_id).slice(0, 6)}`

  return (
    <main style={{ padding: 24 }}>
      <nav style={{ marginBottom: 14 }}>
        <a href="/">Home</a> ·{' '}
        <a href="/leaderboard">Leaderboard</a> ·{' '}
        <a href="/standings">Standings</a>
      </nav>

      <h1>{displayName} — Group Stage Bracket</h1>

      <p style={{ fontSize: 12, opacity: 0.75 }}>
        Submitted:{' '}
        {profile.submitted_at
          ? new Date(profile.submitted_at).toLocaleString()
          : '—'}
      </p>

      {groups.map(g => {
        const gp = picksByGroup[g.id] ?? {}

        return (
          <section
            key={g.id}
            style={{
              marginTop: 18,
              padding: 14,
              border: '1px solid #ddd',
              maxWidth: 520
            }}
          >
            <h2 style={{ marginTop: 0 }}>{g.name}</h2>

            {[1, 2, 3, 4].map(pos => (
              <div key={pos} style={{ marginTop: 8 }}>
                <strong>{posLabel(pos)}:</strong>{' '}
                {gp[pos]
                  ? teamNameById[gp[pos]]
                  : <span style={{ opacity: 0.6 }}>—</span>}
              </div>
            ))}
          </section>
        )
      })}
    </main>
  )
}
