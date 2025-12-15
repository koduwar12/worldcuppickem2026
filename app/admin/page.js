'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [isAdmin, setIsAdmin] = useState(false)
  const [matches, setMatches] = useState([])
  const [draftScores, setDraftScores] = useState({}) // { [matchId]: { home: '', away: '' } }
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data } = await supabase.auth.getUser()
      const u = data?.user ?? null
      setUser(u)

      if (!u) {
        setMsg('Not found.')
        setLoading(false)
        return
      }

      // Admin check via profiles.is_admin
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', u.id)
        .maybeSingle()

      if (profErr || !prof?.is_admin) {
        setMsg('Not found.')
        setIsAdmin(false)
        setLoading(false)
        return
      }

      setIsAdmin(true)
      await loadMatches()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      .order('id', { ascending: true })

    if (error) {
      setMsg(error.message)
      return
    }

    const rows = data ?? []
    setMatches(rows)

    const initialDraft = {}
    for (const m of rows) {
      initialDraft[m.id] = {
        home: m.home_score === null || m.home_score === undefined ? '' : String(m.home_score),
        away: m.away_score === null || m.away_score === undefined ? '' : String(m.away_score)
      }
    }
    setDraftScores(initialDraft)
    setMsg('')
  }

  function setDraft(matchId, side, value) {
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
      setMsg(`Save failed: ${error.message}`)
      return
    }

    setMatches(prev =>
      prev.map(m =>
        m.id === matchId ? { ...m, home_score: homeVal, away_score: awayVal } : m
      )
    )

    setMsg('Saved ✅ (Standings/leaderboard update only after Finalize.)')
  }

  async function finalizeMatch(matchId) {
    const draft = draftScores[matchId] ?? { home: '', away: '' }
    if (draft.home === '' || draft.away === '') {
      setMsg('Enter BOTH scores, click Save, then Finalize.')
      return
    }

    await saveMatch(matchId)

    setMsg('Finalizing...')
    const { error } = await supabase
      .from('matches')
      .update({ is_final: true })
      .eq('id', matchId)

    if (error) {
      setMsg(`Finalize failed: ${error.message}`)
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
      setMsg(`Unfinalize failed: ${error.message}`)
      return
    }

    setMatches(prev =>
      prev.map(x => (x.id === matchId ? { ...x, is_final: false } : x))
    )

    setMsg('Unfinalized ✅')
  }

  // --------- DISCREET GATE ----------
  if (loading) {
    return (
      <main className="container">
        <div className="card"><p>Loading…</p></div>
      </main>
    )
  }

  if (!user || !isAdmin) {
    return (
      <main className="container">
        <div className="card">
          <p style={{ margin: 0 }}>{msg || 'Not found.'}</p>
          <div className="nav" style={{ marginTop: 12 }}>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </main>
    )
  }

  const groupIds = Object.keys(grouped).sort()

  return (
    <main className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/picks">👉 Picks</a>
        <a className="pill" href="/standings">📊 Standings</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <button className="pill" onClick={loadMatches} style={{ cursor: 'pointer' }}>
          🔄 Refresh
        </button>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Admin — Enter Match Results</h1>
      <p className="sub">
        Typing does not auto-save. Click <strong>Save</strong>. Standings/leaderboard update only after <strong>Finalize</strong>.
      </p>

      {msg && (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>{msg}</p>
        </div>
      )}

      {groupIds.map(groupId => (
        <section key={groupId} style={{ marginTop: 18 }}>
          <h2 className="cardTitle" style={{ marginBottom: 10 }}>
            {groupId === '-' ? 'No Group' : `Group ${groupId}`}
          </h2>

          <div className="card">
            {(grouped[groupId] ?? []).map(m => {
              const draft = draftScores[m.id] ?? { home: '', away: '' }
              const canFinalize = draft.home !== '' && draft.away !== ''

              return (
                <div
                  key={m.id}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,.10)',
                    marginTop: 10,
                    background: 'rgba(255,255,255,.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      {m.home?.name} vs {m.away?.name}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                      {m.is_final ? '✅ Final' : 'Draft'}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginTop: 12
                    }}
                  >
                    <input
                      className="field"
                      style={{ width: 110 }}
                      inputMode="numeric"
                      placeholder="Home"
                      value={draft.home}
                      disabled={m.is_final}
                      onChange={e => setDraft(m.id, 'home', e.target.value)}
                    />

                    <input
                      className="field"
                      style={{ width: 110 }}
                      inputMode="numeric"
                      placeholder="Away"
                      value={draft.away}
                      disabled={m.is_final}
                      onChange={e => setDraft(m.id, 'away', e.target.value)}
                    />

                    <button
                      className="btn"
                      disabled={m.is_final}
                      onClick={() => saveMatch(m.id)}
                    >
                      Save
                    </button>

                    {!m.is_final ? (
                      <button
                        className="btn btnPrimary"
                        disabled={!canFinalize}
                        onClick={() => finalizeMatch(m.id)}
                      >
                        Finalize
                      </button>
                    ) : (
                      <button className="btn" onClick={() => unfinalizeMatch(m.id)}>
                        Unfinalize
                      </button>
                    )}
                  </div>

                  {!canFinalize && !m.is_final && (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                      Tip: enter both scores to enable Finalize.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </main>
  )
}
