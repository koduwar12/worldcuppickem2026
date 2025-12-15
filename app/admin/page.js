'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/* ---------- WINNER PREVIEW ---------- */
function winnerPreview(homeName, awayName, homeStr, awayStr) {
  if (homeStr === '' || awayStr === '') return null
  const h = Number(homeStr)
  const a = Number(awayStr)
  if (Number.isNaN(h) || Number.isNaN(a)) return null
  if (h > a) return { label: `Winner (preview): ${homeName}`, kind: 'home' }
  if (a > h) return { label: `Winner (preview): ${awayName}`, kind: 'away' }
  return { label: 'Winner (preview): Draw', kind: 'draw' }
}

export default function AdminPage() {
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

      const { data: adminRow } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', u.id)
        .maybeSingle()

      if (!adminRow?.is_admin) {
        setMsg('Not authorized (admin only).')
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

    const rows = data ?? []
    setMatches(rows)

    const initial = {}
    for (const m of rows) {
      initial[m.id] = {
        home: m.home_score ?? '',
        away: m.away_score ?? ''
      }
    }
    setDraftScores(initial)
  }

  function setDraft(matchId, side, value) {
    if (value !== '' && !/^\d+$/.test(value)) return
    setDraftScores(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? {}), [side]: value }
    }))
  }

  const grouped = useMemo(() => {
    const map = {}
    for (const m of matches) {
      const key = m.group_id ?? '-'
      if (!map[key]) map[key] = []
      map[key].push(m)
    }
    return map
  }, [matches])

  async function saveMatch(matchId) {
    setMsg('Saving...')
    const d = draftScores[matchId]
    const homeVal = d.home === '' ? null : Number(d.home)
    const awayVal = d.away === '' ? null : Number(d.away)

    const { error } = await supabase
      .from('matches')
      .update({ home_score: homeVal, away_score: awayVal })
      .eq('id', matchId)

    if (error) {
      setMsg(error.message)
      return
    }

    setMatches(prev =>
      prev.map(m =>
        m.id === matchId ? { ...m, home_score: homeVal, away_score: awayVal } : m
      )
    )

    setMsg('Saved ✅')
  }

  async function finalizeMatch(matchId) {
    await saveMatch(matchId)
    const { error } = await supabase
      .from('matches')
      .update({ is_final: true })
      .eq('id', matchId)

    if (!error) {
      setMatches(prev =>
        prev.map(m => (m.id === matchId ? { ...m, is_final: true } : m))
      )
      setMsg('Finalized ✅')
    }
  }

  async function unfinalizeMatch(matchId) {
    const { error } = await supabase
      .from('matches')
      .update({ is_final: false })
      .eq('id', matchId)

    if (!error) {
      setMatches(prev =>
        prev.map(m => (m.id === matchId ? { ...m, is_final: false } : m))
      )
      setMsg('Unfinalized')
    }
  }

  if (!user || !isAdmin) {
    return (
      <div className="container">
        <div className="card">
          <h1>Admin</h1>
          <p>{msg}</p>
          <a className="pill" href="/">← Back</a>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Home</a>
        <a className="pill" href="/standings">📊 Standings</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <button className="pill" onClick={loadMatches}>🔄 Refresh</button>
      </div>

      <h1 className="h1">Admin — Enter Match Results</h1>
      <p className="sub">
        Save stores scores. Finalize locks and updates standings.
      </p>

      {msg && <div className="badge">{msg}</div>}

      {Object.keys(grouped).sort().map(groupId => (
        <div key={groupId} className="card" style={{ marginTop: 18 }}>
          <h2 className="cardTitle">
            {groupId === '-' ? 'No Group' : `Group ${groupId}`}
          </h2>

          {grouped[groupId].map(m => {
            const draft = draftScores[m.id] ?? { home: '', away: '' }
            const preview = winnerPreview(
              m.home?.name,
              m.away?.name,
              draft.home,
              draft.away
            )

            return (
              <div
                key={m.id}
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,.05)'
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {m.home?.name} vs {m.away?.name}
                  {m.is_final && ' ✅ Final'}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <input
                    className="field"
                    placeholder="Home"
                    disabled={m.is_final}
                    value={draft.home}
                    onChange={e => setDraft(m.id, 'home', e.target.value)}
                  />
                  <input
                    className="field"
                    placeholder="Away"
                    disabled={m.is_final}
                    value={draft.away}
                    onChange={e => setDraft(m.id, 'away', e.target.value)}
                  />
                </div>

                {preview && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      fontWeight: 800,
                      background:
                        preview.kind === 'draw'
                          ? 'rgba(255,255,255,.06)'
                          : 'rgba(34,197,94,.15)',
                      border:
                        preview.kind === 'draw'
                          ? '1px solid rgba(255,255,255,.15)'
                          : '1px solid rgba(34,197,94,.4)'
                    }}
                  >
                    {preview.label}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {!m.is_final && (
                    <>
                      <button className="btn" onClick={() => saveMatch(m.id)}>
                        Save
                      </button>
                      <button className="btn btnPrimary" onClick={() => finalizeMatch(m.id)}>
                        Finalize
                      </button>
                    </>
                  )}
                  {m.is_final && (
                    <button className="btn" onClick={() => unfinalizeMatch(m.id)}>
                      Unfinalize
                    </button>
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
