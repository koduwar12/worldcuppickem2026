'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

export default function BracketView({ params }) {
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

      // Require sign-in (keeps it friends/family only)
      const { data: userData } = await supabase.auth.getUser()
      const u = userData?.user ?? null
      setViewer(u)

      if (!u) {
        setMsg('Please sign in first.')
        setLoading(false)
        return
      }

      // Load submitted profile (display name)
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

      // Load groups + teams + this user's submitted picks
      const [gRes, tRes, picksRes] = await Promise.all([
        supabase.from('groups').select('*').order('id'),
        supabase.from('teams').select('*').order('name'),
        supabase
          .from('group_picks')
          .select('group_id, position, team_id, submitted_at')
          .eq('user_id', userId)
      ])

      if (gRes.error || tRes.error || picksRes.error) {
        setMsg(
          gRes.error?.message ||
            tRes.error?.message ||
            picksRes.error?.message ||
            'Error loading bracket'
        )
        setLoading(false)
        return
      }

      // group_picks policy already ensures only submitted picks are readable by others
      setGroups(gRes.data ?? [])
      setTeams(tRes.data ?? [])
      setPicks(picksRes.data ?? [])

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
    return pos === 1 ? '1st' : pos === 2 ? '2nd' : pos === 3 ? '3rd' : '4th'
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
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <a href="/">Home</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/standings">Standings</a>
        </div>

        <h1>Bracket</h1>
        <p>{msg}</p>
      </main>
    )
  }

  const name =
    (profile?.display_name && profile.display_name.trim()) ||
    `User ${String(profile.user_id).slice(0, 6)}`

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <a href="/">Home</a>
        <a href="/leaderboard">Leaderboard</a>
        <a href="/standings">Standings</a>
      </div>

      <h1>{name} — Group Picks</h1>
      <p style={{ fontSize: 12, opacity: 0.75 }}>
        Submitted:{' '}
        {profile.submitted_at ? new Date(profile.submitted_at).toLocaleString() : '—'}
      </p>

      {groups.map(g => {
        const gp = picksByGroup[g.id] ?? {}
        return (
          <section
            key={g.id}
            style={{ marginTop: 18, padding: 14, border: '1px solid #ddd', maxWidth: 560 }}
          >
            <h2 style={{ marginTop: 0 }}>{g.name}</h2>

            {[1, 2, 3, 4].map(pos => (
              <div key={pos} style={{ marginTop: 8 }}>
                <strong>{posLabel(pos)}:</strong>{' '}
                {gp[pos] ? teamNameById[gp[pos]] : <span style={{ opacity: 0.7 }}>—</span>}
              </div>
            ))}
          </section>
        )
      })}
    </main>
  )
}
