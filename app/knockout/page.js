'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'F']
const ROUND_LABEL = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  F: 'Final'
}

// Expected match counts for consistent bracket spacing (even if DB has fewer rows)
const ROUND_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }

// Bracket visuals (tuned for readability)
const COL_W = 240
const COL_GAP = 16

const ROUND_META = {
  R32: { matchH: 66, gap: 14, padTop: 0 },
  R16: { matchH: 66, gap: 46, padTop: 40 },
  QF: { matchH: 66, gap: 126, padTop: 100 },
  SF: { matchH: 66, gap: 286, padTop: 210 },
  F: { matchH: 66, gap: 0, padTop: 330 }
}

function roundIndex(r) {
  const i = ROUND_ORDER.indexOf(r)
  return i === -1 ? 999 : i
}

function computeRoundHeight(round) {
  const meta = ROUND_META[round]
  const count = ROUND_COUNTS[round] ?? 0
  if (!meta || count <= 0) return 0
  return meta.padTop + count * meta.matchH + (count - 1) * meta.gap + 20
}

function matchCenterY(round, idx0) {
  const meta = ROUND_META[round]
  if (!meta) return 0
  return meta.padTop + idx0 * (meta.matchH + meta.gap) + meta.matchH / 2
}

function colX(round) {
  const i = roundIndex(round)
  return i * (COL_W + COL_GAP)
}

export default function KnockoutPage() {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [user, setUser] = useState(null)

  const [matches, setMatches] = useState([])
  const [selections, setSelections] = useState({}) // { [matchId]: teamId }
  const [submittedAt, setSubmittedAt] = useState(null)

  const [savingState, setSavingState] = useState('idle') // idle | saving | saved | submitted | error

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
            id, round, match_no, home_team_id, away_team_id, is_final,
            home:home_team_id ( id, name ),
            away:away_team_id ( id, name )
          `),
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

      const msRaw = mRes.data ?? []
      const ms = msRaw
        .slice()
        .sort((a, b) => {
          const ra = roundIndex(a.round)
          const rb = roundIndex(b.round)
          if (ra !== rb) return ra - rb
          return (a.match_no ?? 0) - (b.match_no ?? 0)
        })

      const ps = pRes.data ?? []

      setMatches(ms)

      const seed = {}
      let sub = null
      for (const p of ps) {
        if (p.picked_winner_team_id) seed[p.match_id] = String(p.picked_winner_team_id)
        if (p.submitted_at) sub = p.submitted_at
      }
      setSelections(seed)
      setSubmittedAt(sub)

      setLoading(false)
    })()
  }, [])

  const matchesByRound = useMemo(() => {
    const map = {}
    for (const r of ROUND_ORDER) map[r] = []
    for (const m of matches) {
      if (!map[m.round]) map[m.round] = []
      map[m.round].push(m)
    }
    for (const r of Object.keys(map)) {
      map[r] = (map[r] || []).slice().sort((a, b) => (a.match_no ?? 0) - (b.match_no ?? 0))
    }
    return map
  }, [matches])

  const locked = !!submittedAt

  function pick(matchId, teamId) {
    if (locked) return
    setSelections(prev => ({ ...prev, [matchId]: String(teamId) }))
  }

  async function saveDraft() {
    if (!user) return
    if (locked) {
      setMsg('Submitted and locked 🔒')
      return
    }
    if (savingState === 'saving') return

    setSavingState('saving')
    setMsg('')

    try {
      const rows = Object.entries(selections).map(([matchId, teamId]) => ({
        user_id: user.id,
        match_id: Number(matchId),
        picked_winner_team_id: String(teamId),
        submitted_at: null
      }))

      if (rows.length === 0) {
        setSavingState('idle')
        setMsg('Pick at least one winner before saving.')
        return
      }

      const { error } = await supabase
        .from('knockout_picks')
        .upsert(rows, { onConflict: 'user_id,match_id' })

      if (error) throw error

      setSavingState('saved')
      setMsg('Draft saved ✅')
      setTimeout(() => setSavingState('idle'), 1400)
    } catch (e) {
      setSavingState('error')
      setMsg(e?.message || 'Save failed.')
      setTimeout(() => setSavingState('idle'), 1600)
    }
  }

  async function submit() {
    if (!user) return
    if (locked) return
    if (savingState === 'saving') return

    const required = matches.filter(m => m.home?.id && m.away?.id)
    const missing = required.filter(m => !selections[m.id])

    if (missing.length > 0) {
      setMsg('Pick a winner for every posted knockout match before submitting.')
      return
    }

    const now = new Date().toISOString()
    setSavingState('saving')
    setMsg('')

    try {
      const rows = required.map(m => ({
        user_id: user.id,
        match_id: m.id,
        picked_winner_team_id: String(selections[m.id]),
        submitted_at: now
      }))

      const { error } = await supabase
        .from('knockout_picks')
        .upsert(rows, { onConflict: 'user_id,match_id' })

      if (error) throw error

      setSubmittedAt(now)
      setSavingState('submitted')
      setMsg('Submitted ✅ (locked 🔒)')
      setTimeout(() => setSavingState('idle'), 1800)
    } catch (e) {
      setSavingState('error')
      setMsg(e?.message || 'Submit failed.')
      setTimeout(() => setSavingState('idle'), 1600)
    }
  }

  function TeamPickButton({ disabled, active, label, onClick }) {
    return (
      <button
        className="btn"
        disabled={disabled}
        onClick={onClick}
        style={{
          textAlign: 'left',
          padding: '12px 12px',
          borderRadius: 14,
          fontWeight: 900,
          background: active ? 'rgba(56,189,248,.18)' : 'rgba(0,0,0,.20)',
          border: active ? '1px solid rgba(56,189,248,.35)' : '1px solid rgba(255,255,255,.10)'
        }}
      >
        {label} {active ? ' ✅' : ''}
      </button>
    )
  }

  function BracketMatchCard({ round, idx0, m }) {
    const home = m?.home
    const away = m?.away
    const chosen = selections[m?.id] ? String(selections[m.id]) : ''
    const homeChosen = chosen && home?.id && chosen === String(home.id)
    const awayChosen = chosen && away?.id && chosen === String(away.id)

    const meta = ROUND_META[round]
    const h = meta?.matchH ?? 66

    return (
      <div
        style={{
          height: h,
          borderRadius: 14,
          padding: 10,
          background: 'rgba(255,255,255,.05)',
          border: '1px solid rgba(255,255,255,.10)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 8,
          position: 'relative',
          zIndex: 2
        }}
        title={`Match ${m?.match_no ?? idx0 + 1}`}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
          <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 900 }}>
            M{m?.match_no ?? idx0 + 1}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 900 }}>
            {m?.is_final ? 'Final ✅' : 'Pending'}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              fontWeight: 900,
              background: homeChosen ? 'rgba(56,189,248,.18)' : 'rgba(0,0,0,.20)',
              border: homeChosen ? '1px solid rgba(56,189,248,.35)' : '1px solid rgba(255,255,255,.10)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {home?.name ?? 'TBD'}
          </div>

          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              fontWeight: 900,
              background: awayChosen ? 'rgba(56,189,248,.18)' : 'rgba(0,0,0,.20)',
              border: awayChosen ? '1px solid rgba(56,189,248,.35)' : '1px solid rgba(255,255,255,.10)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {away?.name ?? 'TBD'}
          </div>
        </div>
      </div>
    )
  }

  // Build SVG connector paths between rounds based on index pairing:
  // idx i in round -> idx floor(i/2) in next round
  const bracketSvg = useMemo(() => {
    const totalW = ROUND_ORDER.length * COL_W + (ROUND_ORDER.length - 1) * COL_GAP
    const totalH = Math.max(...ROUND_ORDER.map(r => computeRoundHeight(r)))

    const paths = []

    for (let ri = 0; ri < ROUND_ORDER.length - 1; ri++) {
      const r = ROUND_ORDER[ri]
      const next = ROUND_ORDER[ri + 1]

      const list = matchesByRound[r] || []
      const nextList = matchesByRound[next] || []

      // only draw lines if there are cards in both rounds
      if (list.length === 0 || nextList.length === 0) continue

      for (let i = 0; i < list.length; i++) {
        const j = Math.floor(i / 2)
        if (!nextList[j]) continue

        // positions in the SVG coordinate system
        const x1 = colX(r) + COL_W
        const y1 = matchCenterY(r, i)
        const x2 = colX(next)
        const y2 = matchCenterY(next, j)

        const mid1 = x1 + 18
        const mid2 = x2 - 18
        const midX = (mid1 + mid2) / 2

        // A clean bracket elbow path:
        // x1->mid1 (short), mid1->midX (horizontal), midX vertical to y2, then to x2
        const d = [
          `M ${x1} ${y1}`,
          `L ${mid1} ${y1}`,
          `L ${midX} ${y1}`,
          `L ${midX} ${y2}`,
          `L ${mid2} ${y2}`,
          `L ${x2} ${y2}`
        ].join(' ')

        paths.push(d)
      }
    }

    return { totalW, totalH, paths }
  }, [matchesByRound])

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
        Pick winners on the left. Bracket preview on the right (desktop) / below (mobile). Submit locks 🔒
      </p>

      {locked && (
        <div className="badge" style={{ marginTop: 10 }}>
          🔒 Submitted on {new Date(submittedAt).toLocaleString()}
        </div>
      )}

      {msg && <div className="badge" style={{ marginTop: 10 }}>{msg}</div>}

      <div className="koGrid" style={{ marginTop: 16 }}>
        {/* LEFT: Picks */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Pick Winners</div>
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                Tap a team to select. (Teams must be set by admin.)
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
              {locked ? 'Locked 🔒' : 'Editable'}
            </div>
          </div>

          {ROUND_ORDER.map(r => (
            <div key={r} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{ROUND_LABEL[r]}</div>

              {(matchesByRound[r] ?? []).length === 0 ? (
                <div style={{ opacity: 0.75, fontWeight: 800, fontSize: 12 }}>
                  No matches posted yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {(matchesByRound[r] ?? []).map(m => {
                    const home = m.home
                    const away = m.away
                    const canPick = !!(home?.id && away?.id)
                    const chosen = selections[m.id] ? String(selections[m.id]) : ''
                    const homeChosen = chosen && home?.id && chosen === String(home.id)
                    const awayChosen = chosen && away?.id && chosen === String(away.id)

                    return (
                      <div
                        key={m.id}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          background: 'rgba(255,255,255,.04)',
                          border: '1px solid rgba(255,255,255,.08)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
                            Match {m.match_no}
                          </div>
                          {m.is_final && (
                            <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 900 }}>
                              ✅ Final
                            </div>
                          )}
                        </div>

                        <div style={{ marginTop: 6, fontWeight: 900 }}>
                          {home?.name ?? 'TBD'} vs {away?.name ?? 'TBD'}
                        </div>

                        {!canPick && (
                          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                            Teams not set yet by admin.
                          </div>
                        )}

                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <TeamPickButton
                            disabled={locked || !canPick}
                            active={homeChosen}
                            label={home?.name ?? 'TBD'}
                            onClick={() => pick(m.id, home.id)}
                          />
                          <TeamPickButton
                            disabled={locked || !canPick}
                            active={awayChosen}
                            label={away?.name ?? 'TBD'}
                            onClick={() => pick(m.id, away.id)}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              className={`btn ${savingState === 'saving' ? 'btnLocked' : ''} ${savingState === 'saved' ? 'btnGlow' : ''}`}
              disabled={locked || savingState === 'saving'}
              onClick={saveDraft}
            >
              {savingState === 'saving'
                ? '🔒 Saving…'
                : savingState === 'saved'
                ? '✓ Saved'
                : savingState === 'error'
                ? '⚠️ Error'
                : 'Save Draft'}
            </button>

            <button
              className={`btn btnPrimary ${savingState === 'saving' ? 'btnLocked' : ''} ${
                savingState === 'submitted' ? 'btnGlowStrong' : ''
              }`}
              disabled={locked || savingState === 'saving'}
              onClick={submit}
            >
              {savingState === 'saving'
                ? '🔒 Submitting…'
                : savingState === 'submitted'
                ? '🏁 Submitted!'
                : savingState === 'error'
                ? '⚠️ Error'
                : 'Submit (Locks 🔒)'}
            </button>
          </div>
        </div>

        {/* RIGHT: Bracket Preview + Connector Lines */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Bracket Preview</div>
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                Connector lines included — updates as you pick.
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
              Scroll →
            </div>
          </div>

          <div style={{ marginTop: 12, overflowX: 'auto', paddingBottom: 8 }}>
            <div
              style={{
                position: 'relative',
                width: bracketSvg.totalW,
                minHeight: bracketSvg.totalH,
                paddingBottom: 10
              }}
            >
              {/* SVG connector lines (behind cards) */}
              <svg
                width={bracketSvg.totalW}
                height={bracketSvg.totalH}
                viewBox={`0 0 ${bracketSvg.totalW} ${bracketSvg.totalH}`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  pointerEvents: 'none'
                }}
              >
                {bracketSvg.paths.map((d, idx) => (
                  <path
                    key={idx}
                    d={d}
                    fill="none"
                    stroke="rgba(255,255,255,.16)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>

              {/* Columns + cards */}
              <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: COL_GAP }}>
                {ROUND_ORDER.map(r => {
                  const list = matchesByRound[r] ?? []
                  const meta = ROUND_META[r] || { matchH: 66, gap: 16, padTop: 0 }

                  return (
                    <div key={r} style={{ width: COL_W }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>{ROUND_LABEL[r]}</div>

                      <div style={{ paddingTop: meta.padTop }}>
                        {list.length === 0 ? (
                          <div style={{ opacity: 0.75, fontWeight: 800, fontSize: 12 }}>
                            No matches posted.
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: meta.gap }}>
                            {list.map((m, idx0) => (
                              <BracketMatchCard key={m.id} round={r} idx0={idx0} m={m} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
            Want it even closer to your reference image? Next step is drawing the “join bars” (little brackets) between pairs.
          </div>
        </div>
      </div>

      <style jsx>{`
        .koGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 1024px) {
          .koGrid {
            grid-template-columns: 1.1fr 0.9fr;
            align-items: start;
          }
        }
        .btnLocked {
          opacity: 0.75;
        }
        .btnGlow {
          animation: glow 1.2s ease-out;
        }
        .btnGlowStrong {
          animation: glowStrong 1.35s ease-out;
        }
        @keyframes glow {
          0% {
            box-shadow: 0 0 0 rgba(56, 189, 248, 0);
          }
          50% {
            box-shadow: 0 0 24px rgba(56, 189, 248, 0.55);
          }
          100% {
            box-shadow: 0 0 0 rgba(56, 189, 248, 0);
          }
        }
        @keyframes glowStrong {
          0% {
            box-shadow: 0 0 0 rgba(34, 197, 94, 0);
          }
          50% {
            box-shadow: 0 0 28px rgba(34, 197, 94, 0.65);
          }
          100% {
            box-shadow: 0 0 0 rgba(34, 197, 94, 0);
          }
        }
      `}</style>
    </div>
  )
}
