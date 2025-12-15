'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import KnockoutBracket from '../components/KnockoutBracket'

export default function KnockoutPage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [user, setUser] = useState(null)

  const [matches, setMatches] = useState([])
  const [selections, setSelections] = useState({})
  const [submittedAt, setSubmittedAt] = useState(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: auth } = await supabase.auth.getUser()
      const u = auth?.user ?? null
      setUser(u)

      if (!u) {
        setMsg('Please sign in first.')
        setLoading(false)
        return
      }

      const [mRes, pRes] = await Promise.all([
        supabase
          .from('knockout_matches')
          .select(`
            id, round, match_no, home_team_id, away_team_id, home_score, away_score, is_final,
            home:home_team_id ( id, name ),
            away:away_team_id ( id, name )
          `)
          .order('round', { ascending: true })
          .order('match_no', { ascending: true }),
        supabase
          .from('knockout_picks')
          .select('match_id, picked_winner_team_id, submitted_at')
          .eq('user_id', u.id)
      ])

      if (mRes.error || pRes.error) {
        setMsg(mRes.error?.message || pRes.error?.message || 'Error loading knockout.')
        setLoading(false)
        return
      }

      const ms = mRes.data ?? []
      const ps = pRes.data ?? []

      setMatches(ms)

      const seed = {}
      let sub = null
      for (const p of ps) {
        if (p.picked_winner_team_id) seed[p.match_id] = p.picked_winner_team_id
        if (p.submitted_at) sub = p.submitted_at
      }
      setSelections(seed)
      setSubmittedAt(sub)

      setLoading(false)
    })()
  }, [])

  const locked = !!submittedAt

  async function saveDraft() {
    if (!user) return
    if (locked) {
      setMsg('Submitted and locked 🔒')
      return
    }

    setMsg('Saving…')

    const rows = Object.entries(selections).map(([matchId, teamId]) => ({
      user_id: user.id,
      match_id: Number(matchId),
      picked_winner_team_id: teamId,
      submitted_at: null
    }))

    const { error } = await supabase.from('knockout_picks').upsert(rows)
    setMsg(error ? error.message : 'Draft saved ✅')
  }

  async function submit() {
    if (!user) return
    if (locked) return

    // Only require picks where BOTH teams exist
    const required = matches.filter(m => m.home?.id && m.away?.id)
    const missing = required.filter(m => !selections[m.id])

    if (missing.length > 0) {
      setMsg('Pick a winner for every posted knockout match before submitting.')
      return
    }

    const now = new Date().toISOString()
    setMsg('Submitting…')

    const rows = required.map(m => ({
      user_id: user.id,
      match_id: m.id,
      picked_winner_team_id: selections[m.id],
      submitted_at: now
    }))

    const { error } = await supabase.from('knockout_picks').upsert(rows)
    if (error) {
      setMsg(error.message)
      return
    }

    setSubmittedAt(now)
    setMsg('Submitted ✅ (locked 🔒)')
  }

  function onSelect(matchId, teamId) {
    setSelections(prev => ({ ...prev, [matchId]: teamId }))
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading…</p></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ margin: 0 }}>{msg || 'Please sign in.'}</p>
          <div className="nav" style={{ marginTop: 12 }}>
            <a className="pill" href="/">🏠 Main Menu</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/picks">👉 Group Picks</a>
        <a className="pill" href="/standings">📊 Standings</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
      </div>

      <h1 className="h1" style={{ marginTop: 16 }}>Knockout Picks</h1>
      <p className="sub">
        Pick winners inside the bracket. Save drafts anytime. Submit locks 🔒
      </p>

      {locked && (
        <div className="badge" style={{ marginTop: 10 }}>
          🔒 Submitted on {new Date(submittedAt).toLocaleString()}
        </div>
      )}

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <KnockoutBracket
        matches={matches}
        selections={selections}
        locked={locked}
        onSelect={onSelect}
        mode="picks"
        subtitle="Scroll horizontally on mobile. Connector lines show progression through rounds."
      />

      <div style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn" disabled={locked} onClick={saveDraft}>
          Save Draft
        </button>
        <button className="btn btnPrimary" disabled={locked} onClick={submit}>
          Submit Knockout Picks (Locks 🔒)
        </button>
      </div>
    </div>
  )
}
