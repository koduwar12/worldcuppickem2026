'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [matches, setMatches] = useState([])
  const [draftScores, setDraftScores] = useState({}) // { [matchId]: { home: '', away: '' } }
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

    const rows = data ?? []
    setMatches(rows)

    // Initialize draft scores once (so inputs are controlled and stable)
    const initialDraft = {}
    for (const m of rows) {
      initialDraft[m.id] = {
        home: m.home_score === null || m.home_score === undefined ? '' : String(m.home_score),
        away: m.away_score === null || m.away_score === undefined ? '' : String(m.away_score)
      }
    }
    setDraftScores(initialDraft)
  }

  function setDraft(matchId, side, value) {
    // allow empty string, digits only
    if (value !== '' && !/^\d+$/.test(value)) return
    setDraftScores(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? { home: '', away: '' }), [side]: value }
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
    const draft = draftScores[matchId] ?? { home: '', away: '' }

    const homeVal = draft.home === '' ? null : Number(draft.home)
    const awayVal = draft.away === '' ? null : Number(draft.away)

    const { error } = await supabase
      .from('matches')
      .update({ home_score: homeVal, away_score: awayVal })
      .eq('id', matchId)

    if (error) {
      setMsg(error.message)
      return
    }

    // Update local list without reloading everything (prevents jumping)
    setMatches(prev =>
      prev.map(m =>
        m.id === matchId ? { ...m, home_score: homeVal, away_score: awayVal } : m
      )
    )

    setMsg('Saved ✅')
  }

  async function finalizeMatch(matchId) {
    const m = matches.find(x => x.id === matchId)
    if (!m) return

    // require both scores before finalizing
    const draft = draftScores[matchId] ?? { home: '', away: '' }
    if (draft.home === '' || draft.away === '') {
      setMsg('Enter both scores before finalizing.')
      return
    }

    setMsg('Finalizing...')
    const { error } = await supabase
      .from('matches')
      .update({ is_final: true })
      .eq('id', matchId)

    if (error) {
      setMsg(error.message)
      return
    }

    setMatches(prev =>
      prev.map(x => (x.id === matchId ? { ...x, is_final: true } : x))
    )

    setMsg('Finalized ✅')
  }

  async function unfinalizeMatch(matchId) {
    setMsg('Unfinalizing...')
    const { error } = await supabase
      .from('matches')
      .update({ is_final: false })
      .eq('id', matchId)

    if (error) {
      setMsg(error.message)
      return
    }

    setMatches(prev =>
      prev.map(x => (x.id === matchId ? { ...x, is_final: false } : x))
    )

    setMsg('Unfinalized ✅')
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
      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}

      {Object.keys(grouped).sort().map(groupId => (
        <section key={groupId} style={{ marginTop: 18 }}>
          <h2 style={{ marginBottom: 8 }}>
            {groupId === '-' ? 'No Group' : `Group ${groupId}`}
          </h2>

          {grouped[groupId].map(m => {
            const draft = draftScores[m.id] ?? { home: '', away: '' }
            const canFinalize = draft.home !== '' && draft.away !== ''

            return (
              <div
                key={m.id}
                style={{
                  border: '1px solid #ddd',
                  padding: 12,
                  marginTop: 10,
                  maxWidth: 560
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {m.home?.name} vs {m.away?.name}
                  {m.is_final ? ' ✅ (Final)' : ''}
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Home"
                    value={draft.home}
                    disabled={m.is_final}
                    onChange={e => setDraft(m.id, 'home', e.target.value)}
                    style={{ width: 90, padding: 8 }}
                  />

                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Away"
                    value={draft.away}
                    disabled={m.is_final}
                    onChange={e => setDraft(m.id, 'away', e.target.value)}
                    style={{ width: 90, padding: 8 }}
                  />

                  <button disabled={m.is_final} onClick={() => saveMatch(m.id)}>
                    Save
                  </button>

                  {!m.is_final ? (
                    <button disabled={!canFinalize} onClick={() => finalizeMatch(m.id)}>
                      Finalize
                    </button>
                  ) : (
                    <button onClick={() => unfinalizeMatch(m.id)}>Unfinalize</button>
                  )}
                </div>

                <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                  Tip: type scores (no jumping), click Save, then Finalize.
                </p>
              </div>
            )
          })}
        </section>
      ))}
    </main>
  )
}
