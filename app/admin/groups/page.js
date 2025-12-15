'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

export default function AdminGroupsPage() {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [matches, setMatches] = useState([])
  const [draftScores, setDraftScores] = useState({}) // { [matchId]: { home:'', away:'' } }

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: auth } = await supabase.auth.getUser()
      const u = auth?.user ?? null
      setUser(u)

      if (!u) {
        setMsg('Not found.')
        setLoading(false)
        return
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', u.id)
        .maybeSingle()

      if (profErr) {
        setMsg(profErr.message)
        setLoading(false)
        return
      }

      if (!prof?.is_admin) {
        setMsg('Not found.')
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
    setMsg('')

    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        group_id,
        home_team_id,
        away_team_id,
        home_score,
        away_score,
        is_final,
        home:home_team_id ( name ),
        away:away_team_id ( name )
      `)
      // ✅ IMPORTANT: stable ordering prevents "random shuffle"
      .order('group_id', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      setMsg(error.message)
      return
    }

    const rows = data ?? []
    setMatches(rows)

    // only initialize drafts for matches that don't have a draft yet
    setDraftScores(prev => {
      const next = { ...prev }
      for (const m of rows) {
        if (!next[m.id]) {
          next[m.id] = {
            home:
              m.home_score === null || m.home_score === undefined
                ? ''
                : String(m.home_score),
            away:
              m.away_score === null || m.away_score === undefined
                ? ''
                : String(m.away_score)
          }
        }
      }
      return next
    })
  }

  function setDraft(matchId, side, value) {
    // allow empty or digits only
    if (value !== '' && !/^\d+$/.test(value)) return
    setDraftScores(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? { home: '', away: '' }), [side]: value }
    }))
  }

  async function saveMatch(matchId) {
    const draft = draftScores[matchId] ?? { home: '', away: '' }

    const homeVal = draft.home === '' ? null : Number(draft.home)
    const awayVal = draft.away === '' ? null : Number(draft.away)

    setMsg('Saving…')

    const { error } = await supabase
      .from('matches')
      .update({ home_score: homeVal, away_score: awayVal })
      .eq('id', matchId)

    if (error) {
      setMsg(`Save failed: ${error.message}`)
      return
    }

    // update local only (no reorder/jump)
    setMatches(prev =>
      prev.map(m =>
        m.id === matchId ? { ...m, home_score: homeVal, away_score: awayVal } : m
      )
    )

    setMsg('Saved ✅ (Standings update after Finalize.)')
  }

  function computeWinnerLabel(m, draft) {
    const h = draft?.home === '' ? null : Number(draft?.home)
    const a = draft?.away === '' ? null : Number(draft?.away)
    if (h === null || a === null) return null
    if (h === a) return 'Draw'
    return h > a ? m.home?.name ?? 'Home' : m.away?.name ?? 'Away'
  }

  async function finalizeMatch(matchId) {
    const m = matches.find(x => x.id === matchId)
    const draft = draftScores[matchId] ?? { home: '', away: '' }

    if (!m) return
    if (draft.home === '' || draft.away === '') {
      setMsg('Enter BOTH scores first.')
      return
    }

    // Save first to ensure DB has scores
    await saveMatch(matchId)

    setMsg('Finalizing…')
    const { error } = await supabase
      .from('matches')
      .update({ is_final: true })
      .eq('id', matchId)

    if (error) {
      setMsg(`Finalize failed: ${error.message}`)
      return
    }

    setMatches(prev => prev.map(x => (x.id === matchId ? { ...x, is_final: true } : x)))
    setMsg('Finalized ✅')
  }

  async function unfinalizeMatch(matchId) {
    setMsg('Unfinalizing…')
    const { error } = await supabase
      .from('matches')
      .update({ is_final: false })
      .eq('id', matchId)

    if (error) {
      setMsg(`Unfinalize failed: ${error.message}`)
      return
    }

    setMatches(prev => prev.map(x => (x.id === matchId ? { ...x, is_final: false } : x)))
    setMsg('Unfinalized ✅')
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

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading…</p></div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ margin: 0 }}>{msg || 'Not found.'}</p>
          <div className="nav" style={{ marginTop: 12 }}>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </div>
    )
  }

  const groupKeys = Object.keys(grouped).sort((a, b) => String(a).localeCompare(String(b)))

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/admin">🛠 Admin Hub</a>
        <button className="pill" onClick={loadMatches}>🔄 Refresh</button>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Admin — Group Stage</h1>
      <p className="sub">
        Type scores → <b>Save</b>. Standings update only after <b>Finalize</b>. Draws allowed.
      </p>

      {msg && <div className="badge" style={{ marginTop: 10 }}>{msg}</div>}

      {groupKeys.map(groupId => (
        <div key={groupId} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle" style={{ marginBottom: 6 }}>
            {groupId === '-' ? 'No Group' : `Group ${groupId}`}
          </h2>

          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {grouped[groupId].map(m => {
              const draft = draftScores[m.id] ?? { home: '', away: '' }
              const winner = computeWinnerLabel(m, draft)

              return (
                <div
                  key={m.id}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    background: 'rgba(255,255,255,.04)',
                    border: '1px solid rgba(255,255,255,.08)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      {m.home?.name} vs {m.away?.name}{' '}
                      {m.is_final && <span style={{ marginLeft: 8 }}>✅ <span style={{ opacity: 0.9 }}>Final</span></span>}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      marginTop: 10
                    }}
                  >
                    <input
                      className="field"
                      inputMode="numeric"
                      placeholder="Home"
                      value={draft.home}
                      disabled={m.is_final}
                      onChange={e => setDraft(m.id, 'home', e.target.value)}
                    />

                    <input
                      className="field"
                      inputMode="numeric"
                      placeholder="Away"
                      value={draft.away}
                      disabled={m.is_final}
                      onChange={e => setDraft(m.id, 'away', e.target.value)}
                    />

                    <div style={{ display: 'flex', gap: 8 }}>
                      {!m.is_final ? (
                        <>
                          <button className="btn" onClick={() => saveMatch(m.id)}>Save</button>
                          <button className="btn btnPrimary" onClick={() => finalizeMatch(m.id)}>
                            Finalize
                          </button>
                        </>
                      ) : (
                        <button className="btn" onClick={() => unfinalizeMatch(m.id)}>
                          Unfinalize
                        </button>
                      )}
                    </div>
                  </div>

                  {winner && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'rgba(34,197,94,.12)',
                        border: '1px solid rgba(34,197,94,.22)',
                        fontWeight: 900
                      }}
                    >
                      Winner (preview): {winner}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
