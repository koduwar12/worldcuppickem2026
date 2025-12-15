'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

export default function AdminGroupsPage() {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [matches, setMatches] = useState([])
  const [draftScores, setDraftScores] = useState({})
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

      const { data: prof } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', u.id)
        .maybeSingle()

      if (!prof?.is_admin) {
        setMsg('Not authorized.')
        return
      }

      setIsAdmin(true)
      await loadMatches()
      setMsg('')
    })()
  }, [])

  async function loadMatches() {
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        group_id,
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

    setMatches(data ?? {})

    const init = {}
    for (const m of data ?? []) {
      init[m.id] = {
        home: m.home_score === null ? '' : String(m.home_score),
        away: m.away_score === null ? '' : String(m.away_score)
      }
    }
    setDraftScores(init)
  }

  function setDraft(matchId, side, val) {
    if (val !== '' && !/^\d+$/.test(val)) return
    setDraftScores(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? { home: '', away: '' }), [side]: val }
    }))
  }

  const grouped = useMemo(() => {
    const map = {}
    for (const m of matches) {
      const k = m.group_id ?? '-'
      if (!map[k]) map[k] = []
      map[k].push(m)
    }
    return map
  }, [matches])

  async function saveMatch(matchId) {
    setMsg('Saving...')
    const d = draftScores[matchId]
    const { error } = await supabase
      .from('matches')
      .update({
        home_score: d.home === '' ? null : Number(d.home),
        away_score: d.away === '' ? null : Number(d.away)
      })
      .eq('id', matchId)

    setMsg(error ? error.message : 'Saved ✅')
  }

  async function finalizeMatch(matchId) {
    await saveMatch(matchId)
    const { error } = await supabase
      .from('matches')
      .update({ is_final: true })
      .eq('id', matchId)

    setMsg(error ? error.message : 'Finalized ✅')
    await loadMatches()
  }

  async function unfinalizeMatch(matchId) {
    const { error } = await supabase
      .from('matches')
      .update({ is_final: false })
      .eq('id', matchId)

    setMsg(error ? error.message : 'Unfinalized')
    await loadMatches()
  }

  if (!user || !isAdmin) {
    return (
      <div className="container">
        <div className="card">
          <p>{msg}</p>
          <a className="pill" href="/">🏠 Main Menu</a>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/admin">🛠 Admin Hub</a>
        <button className="pill" onClick={loadMatches}>🔄 Refresh</button>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Admin — Group Stage</h1>

      {msg && <div className="badge">{msg}</div>}

      {Object.keys(grouped).sort().map(groupId => (
        <div key={groupId} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle">
            {groupId === '-' ? 'No Group' : `Group ${groupId}`}
          </h2>

          {grouped[groupId].map(m => {
            const d = draftScores[m.id] ?? { home: '', away: '' }

            return (
              <div key={m.id} style={{ marginTop: 12 }}>
                <strong>{m.home?.name} vs {m.away?.name}</strong>
                {m.is_final && ' ✅'}

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <input
                    value={d.home}
                    disabled={m.is_final}
                    onChange={e => setDraft(m.id, 'home', e.target.value)}
                    placeholder="Home"
                  />
                  <input
                    value={d.away}
                    disabled={m.is_final}
                    onChange={e => setDraft(m.id, 'away', e.target.value)}
                    placeholder="Away"
                  />

                  {!m.is_final ? (
                    <>
                      <button onClick={() => saveMatch(m.id)}>Save</button>
                      <button onClick={() => finalizeMatch(m.id)}>Finalize</button>
                    </>
                  ) : (
                    <button onClick={() => unfinalizeMatch(m.id)}>Unfinalize</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
