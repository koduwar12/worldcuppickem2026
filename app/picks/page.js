'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function PicksPage() {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [teams, setTeams] = useState([])
  const [existingPicks, setExistingPicks] = useState([])
  const [profile, setProfile] = useState(null)
  const [user, setUser] = useState(null)
  const [msg, setMsg] = useState('')

  // selections[groupId][position] = teamId
  const [selections, setSelections] = useState({})

  useEffect(() => {
    ;(async () => {
      setLoading(true)

      const { data: userData } = await supabase.auth.getUser()
      const u = userData?.user ?? null
      setUser(u)

      if (!u) {
        setMsg('Please sign in first.')
        setLoading(false)
        return
      }

      const [{ data: g, error: gErr }, { data: t, error: tErr }] =
        await Promise.all([
          supabase.from('groups').select('*').order('id'),
          supabase.from('teams').select('*').order('name')
        ])

      if (gErr || tErr) {
        setMsg(gErr?.message || tErr?.message || 'Error loading data')
        setLoading(false)
        return
      }

      setGroups(g ?? [])
      setTeams(t ?? [])

      // Load profile (lock status). If none exists, create one.
      const profRes = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', u.id)
        .maybeSingle()

      if (profRes.error) {
        setMsg(profRes.error.message)
        setLoading(false)
        return
      }

      let prof = profRes.data
      if (!prof) {
        const insertRes = await supabase
          .from('profiles')
          .insert({ user_id: u.id })
          .select()
          .single()

        if (insertRes.error) {
          setMsg(insertRes.error.message)
          setLoading(false)
          return
        }
        prof = insertRes.data
      }

      setProfile(prof)

      // Load existing picks
      const picksRes = await supabase
        .from('group_picks')
        .select('*')
        .eq('user_id', u.id)

      if (picksRes.error) {
        setMsg(picksRes.error.message)
        setLoading(false)
        return
      }

      const picks = picksRes.data ?? []
      setExistingPicks(picks)

      // Seed selections state from existing picks
      const seed = {}
      for (const p of picks) {
        if (!seed[p.group_id]) seed[p.group_id] = {}
        seed[p.group_id][p.position] = p.team_id
      }
      setSelections(seed)

      setLoading(false)
    })()
  }, [])

  const teamsByGroup = useMemo(() => {
    const map = {}
    for (const g of groups) map[g.id] = []
    for (const tm of teams) {
      if (!map[tm.group_id]) map[tm.group_id] = []
      map[tm.group_id].push(tm)
    }
    return map
  }, [groups, teams])

  function setPick(groupId, position, teamId) {
    setSelections(prev => ({
      ...prev,
      [groupId]: { ...(prev[groupId] ?? {}), [position]: teamId }
    }))
  }

  function isDuplicateInGroup(groupId) {
    const picks = selections[groupId] ?? {}
    const chosen = Object.values(picks).filter(Boolean)
    return new Set(chosen).size !== chosen.length
  }

  function isCompleteGroup(groupId) {
    const picks = selections[groupId] ?? {}
    return [1, 2, 3, 4].every(pos => !!picks[pos]) && !isDuplicateInGroup(groupId)
  }

  const allComplete = useMemo(() => {
    if (groups.length === 0) return false
    return groups.every(g => isCompleteGroup(g.id))
  }, [groups, selections])

  async function saveDraft() {
    if (!user) return
    if (profile?.bracket_submitted) {
      setMsg('Bracket is submitted and locked.')
      return
    }

    // Validate
    for (const g of groups) {
      if (isDuplicateInGroup(g.id)) {
        setMsg(`Group ${g.id}: You picked the same team twice.`)
        return
      }
    }

    // Upsert all picks currently selected
    const rows = []
    for (const g of groups) {
      const picks = selections[g.id] ?? {}
      for (const pos of [1, 2, 3, 4]) {
        const teamId = picks[pos]
        if (!teamId) continue
        rows.push({
          user_id: user.id,
          group_id: g.id,
          position: pos,
          team_id: teamId,
          submitted_at: null
        })
      }
    }

    const { error } = await supabase.from('group_picks').upsert(rows, {
      onConflict: 'user_id,group_id,position'
    })

    setMsg(error ? error.message : 'Draft saved ✅')
  }

  async function submitBracket() {
    if (!user) return
    if (profile?.bracket_submitted) {
      setMsg('Already submitted.')
      return
    }
    if (!allComplete) {
      setMsg('Please complete all groups (1st–4th) with no duplicates.')
      return
    }

    // Save picks one last time and mark submitted_at
    const now = new Date().toISOString()

    const rows = []
    for (const g of groups) {
      const picks = selections[g.id] ?? {}
      for (const pos of [1, 2, 3, 4]) {
        rows.push({
          user_id: user.id,
          group_id: g.id,
          position: pos,
          team_id: picks[pos],
          submitted_at: now
        })
      }
    }

    const upsertRes = await supabase.from('group_picks').upsert(rows, {
      onConflict: 'user_id,group_id,position'
    })

    if (upsertRes.error) {
      setMsg(upsertRes.error.message)
      return
    }

    const profRes = await supabase
      .from('profiles')
      .update({ bracket_submitted: true, submitted_at: now })
      .eq('user_id', user.id)
      .select()
      .single()

    if (profRes.error) {
      setMsg(profRes.error.message)
      return
    }

    setProfile(profRes.data)
    setMsg('Submitted! Your bracket is now locked 🔒')
  }

  if (loading) return <main style={{ padding: 24 }}><p>Loading...</p></main>

  return (
    <main style={{ padding: 24 }}>
      <h1>Group Stage Picks</h1>

      {profile?.bracket_submitted ? (
        <p style={{ padding: 10, background: '#f2f2f2' }}>
          ✅ Submitted on {new Date(profile.submitted_at).toLocaleString()} — locked 🔒
        </p>
      ) : (
        <p style={{ padding: 10, background: '#f2f2f2' }}>
          Fill each group 1st–4th. You can save drafts. Once submitted, it locks.
        </p>
      )}

      <p style={{ color: msg.includes('✅') ? 'green' : 'crimson' }}>{msg}</p>

      {groups.map(g => (
        <section key={g.id} style={{ marginTop: 18, padding: 14, border: '1px solid #ddd' }}>
          <h2>{g.name}</h2>

          {[1,2,3,4].map(pos => (
            <div key={pos} style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>
                {pos}{pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'} place
              </label>

              <select
                disabled={!!profile?.bracket_submitted}
                value={(selections[g.id] ?? {})[pos] ?? ''}
                onChange={e => setPick(g.id, pos, e.target.value)}
                style={{ padding: 8, width: '100%', maxWidth: 420 }}
              >
                <option value="">Select team…</option>
                {(teamsByGroup[g.id] ?? []).map(tm => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {isDuplicateInGroup(g.id) && (
            <p style={{ color: 'crimson' }}>
              You selected the same team more than once in this group.
            </p>
          )}
        </section>
      ))}

      <div style={{ marginTop: 22, display: 'flex', gap: 12 }}>
        <button disabled={!!profile?.bracket_submitted} onClick={saveDraft}>
          Save Draft
        </button>
        <button disabled={!!profile?.bracket_submitted || !allComplete} onClick={submitBracket}>
          Submit Bracket (Locks 🔒)
        </button>
      </div>
    </main>
  )
}
