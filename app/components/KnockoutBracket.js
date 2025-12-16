'use client'

import React from 'react'

const ROUND_LABEL = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  F: 'Final',
  W: 'Winner'
}

const ROUND_MATCH_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }

// Layout tuning (roomy + readable)
const COL_WIDTH = 270
const COL_GAP = 110

const UNIT = 44
const TOTAL_ROWS = 32
const CARD_H = 86

const PAD = 16
const HEADER_H = 44
const HEIGHT = TOTAL_ROWS * UNIT + HEADER_H + PAD * 2

// Column plan:
// 0: R32 (matches 1-8)
// 1: R32 (matches 9-16)
// 2: R16
// 3: QF
// 4: SF
// 5: F
// 6: Winner
const COLS = ['R32_L', 'R32_R', 'R16', 'QF', 'SF', 'F', 'W']

// Round index for vertical math (bracket progression)
const ROUND_INDEX = { R32: 0, R16: 1, QF: 2, SF: 3, F: 4 }

function buildRoundMap(matches) {
  const map = { R32: [], R16: [], QF: [], SF: [], F: [] }
  for (const m of matches || []) {
    if (!map[m.round]) map[m.round] = []
    map[m.round].push(m)
  }
  for (const r of Object.keys(map)) {
    map[r].sort((a, b) => (a.match_no ?? 0) - (b.match_no ?? 0))
  }
  return map
}

function ensureSlots(roundMap) {
  const out = {}
  for (const r of Object.keys(ROUND_MATCH_COUNTS)) {
    const count = ROUND_MATCH_COUNTS[r]
    const existing = roundMap[r] || []
    const byNo = {}
    for (const m of existing) byNo[m.match_no] = m

    out[r] = []
    for (let i = 1; i <= count; i++) {
      out[r].push(
        byNo[i] || {
          id: `missing-${r}-${i}`,
          round: r,
          match_no: i,
          home: null,
          away: null,
          home_team_id: null,
          away_team_id: null,
          home_score: null,
          away_score: null,
          is_final: false
        }
      )
    }
  }
  return out
}

function winnerTeamId(match) {
  if (!match?.is_final) return null
  const hs = match.home_score
  const as = match.away_score
  if (hs === null || hs === undefined || as === null || as === undefined) return null
  if (hs === as) return null
  return hs > as ? match.home?.id || match.home_team_id : match.away?.id || match.away_team_id
}

function colX(colIndex) {
  return PAD + colIndex * (COL_WIDTH + COL_GAP)
}

function centerRow(roundIndex, matchNo) {
  const mult = Math.pow(2, roundIndex)
  return (2 * matchNo - 1) * mult
}

function cardCenterY(roundIndex, matchNo) {
  return PAD + HEADER_H + centerRow(roundIndex, matchNo) * UNIT
}

function cardY(roundIndex, matchNo) {
  return cardCenterY(roundIndex, matchNo) - CARD_H / 2
}

function getTeamName(obj) {
  return obj?.name || 'TBD'
}

function getWinnerNameFromFinal(finalMatch, teamId) {
  if (!finalMatch || !teamId) return null
  if (finalMatch?.home?.id === teamId) return finalMatch?.home?.name || null
  if (finalMatch?.away?.id === teamId) return finalMatch?.away?.name || null
  return null
}

export default function KnockoutBracket({
  matches,
  selections,
  locked = false,
  onSelect,
  mode = 'picks', // 'picks' | 'view'
  subtitle,
  showWinnerColumn = true
}) {
  const roundMap = ensureSlots(buildRoundMap(matches))
  const totalCols = showWinnerColumn ? COLS.length : COLS.length - 1
  const innerWidth = PAD * 2 + (totalCols - 1) * (COL_WIDTH + COL_GAP) + COL_WIDTH

  // Connector lines
  const paths = []

  // R32 -> R16 (split)
  const r32 = roundMap.R32 || []
  for (const m of r32) {
    const n = m.match_no || 1
    const fromCol = n <= 8 ? 0 : 1
    const toCol = 2

    const x1 = colX(fromCol) + COL_WIDTH
    const x2 = colX(toCol)
    const midX = (x1 + x2) / 2

    const y1 = cardCenterY(ROUND_INDEX.R32, n)

    let r16No
    if (n <= 8) r16No = Math.ceil(n / 2) // 1..4
    else r16No = 4 + Math.ceil((n - 8) / 2) // 5..8

    const y2 = cardCenterY(ROUND_INDEX.R16, r16No)
    paths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`)
  }

  // R16 -> QF -> SF -> F
  const chain = [
    { from: 'R16', to: 'QF', fromCol: 2, toCol: 3, fromIdx: ROUND_INDEX.R16, toIdx: ROUND_INDEX.QF },
    { from: 'QF', to: 'SF', fromCol: 3, toCol: 4, fromIdx: ROUND_INDEX.QF, toIdx: ROUND_INDEX.SF },
    { from: 'SF', to: 'F', fromCol: 4, toCol: 5, fromIdx: ROUND_INDEX.SF, toIdx: ROUND_INDEX.F }
  ]

  for (const step of chain) {
    const fromMatches = roundMap[step.from] || []
    for (const m of fromMatches) {
      const fromNo = m.match_no || 1
      const toNo = Math.ceil(fromNo / 2)

      const x1 = colX(step.fromCol) + COL_WIDTH
      const x2 = colX(step.toCol)
      const midX = (x1 + x2) / 2

      const y1 = cardCenterY(step.fromIdx, fromNo)
      const y2 = cardCenterY(step.toIdx, toNo)

      paths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`)
    }
  }

  // Final -> Winner connector
  if (showWinnerColumn) {
    const finalX1 = colX(5) + COL_WIDTH
    const winX2 = colX(6)
    const y = cardCenterY(ROUND_INDEX.F, 1)
    const midX = (finalX1 + winX2) / 2
    paths.push(`M ${finalX1} ${y} H ${midX} H ${winX2}`)
  }

  // Winner card data
  const finalMatch = (roundMap.F || [])[0]
  const actualWinnerId = winnerTeamId(finalMatch)
  const pickedWinnerId = finalMatch?.id && selections ? selections[finalMatch.id] : null

  const winnerName =
    getWinnerNameFromFinal(finalMatch, actualWinnerId) ||
    getWinnerNameFromFinal(finalMatch, pickedWinnerId) ||
    'TBD'

  function renderMatchCard(colIndex, roundKey, roundIndex, matchObj) {
    const matchId = matchObj?.id
    const matchNo = matchObj?.match_no || 1
    const home = matchObj?.home
    const away = matchObj?.away

    const isPlaceholder = typeof matchId === 'string'
    const canPick = !!home?.id && !!away?.id && !isPlaceholder

    const pick = matchId && selections ? selections[matchId] : null
    const actual = winnerTeamId(matchObj)

    const isPickedCorrect = pick && actual && pick === actual
    const isPickedWrong = pick && actual && pick !== actual

    const cardBg = isPickedCorrect
      ? 'rgba(34,197,94,.14)'
      : isPickedWrong
      ? 'rgba(248,113,113,.10)'
      : 'rgba(255,255,255,.05)'

    const cardBorder = isPickedCorrect
      ? '1px solid rgba(34,197,94,.28)'
      : isPickedWrong
      ? '1px solid rgba(248,113,113,.22)'
      : '1px solid rgba(255,255,255,.10)'

    const isR32 = roundKey === 'R32'
    const showMatchLabel = !isR32
    const showPending = !isR32 // ✅ hide Pending for R32

    return (
      <div
        key={`${roundKey}-${matchNo}-${colIndex}`}
        style={{
          position: 'absolute',
          left: colX(colIndex),
          top: cardY(roundIndex, matchNo),
          width: COL_WIDTH,
          height: CARD_H,
          padding: 12,
          borderRadius: 16,
          background: cardBg,
          border: cardBorder,
          boxShadow: '0 10px 30px rgba(0,0,0,.25)'
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, minHeight: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            {showMatchLabel ? `Match ${matchNo}` : ''}
          </div>

          {matchObj?.is_final ? (
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}>✅ Final</div>
          ) : showPending ? (
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.55 }}>Pending</div>
          ) : (
            <div style={{ width: 1 }} />
          )}
        </div>

        {/* Teams */}
        <div style={{ marginTop: showMatchLabel ? 8 : 2, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontWeight: 900 }}>{getTeamName(home)}</div>
            {matchObj?.home_score !== null && matchObj?.home_score !== undefined && (
              <div style={{ fontWeight: 900, opacity: 0.9 }}>{matchObj.home_score}</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontWeight: 900 }}>{getTeamName(away)}</div>
            {matchObj?.away_score !== null && matchObj?.away_score !== undefined && (
              <div style={{ fontWeight: 900, opacity: 0.9 }}>{matchObj.away_score}</div>
            )}
          </div>
        </div>

        {/* ✅ Picks dropdown for ALL rounds (including R32) */}
        {mode === 'picks' && (
          <div style={{ marginTop: 10 }}>
            <select
              className="field"
              disabled={locked || !canPick}
              value={pick ?? ''}
              onChange={e => onSelect && onSelect(matchId, e.target.value)}
            >
              <option value="">{canPick ? 'Pick winner…' : 'Teams not set'}</option>
              {canPick && (
                <>
                  <option value={home.id}>{home.name}</option>
                  <option value={away.id}>{away.name}</option>
                </>
              )}
            </select>
          </div>
        )}

        {mode === 'view' && pick && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
            Pick:{' '}
            {home?.id === pick ? home?.name : away?.id === pick ? away?.name : '—'}
            {isPickedCorrect && <span style={{ marginLeft: 8 }}>✅</span>}
            {isPickedWrong && <span style={{ marginLeft: 8 }}>❌</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 18, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div>
          <div className="cardTitle" style={{ marginBottom: 4 }}>Knockout Bracket</div>
          {subtitle ? <div style={{ fontSize: 13, opacity: 0.8 }}>{subtitle}</div> : null}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
          Scroll → (and ↓ if needed)
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          overflowX: 'auto',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,.10)',
          background: 'rgba(0,0,0,.12)',
          maxHeight: '70vh'
        }}
      >
        <div style={{ position: 'relative', width: innerWidth, height: HEIGHT }}>
          {/* Round of 32 header spans BOTH R32 columns */}
          <div
            style={{
              position: 'absolute',
              left: colX(0),
              top: PAD,
              width: COL_WIDTH * 2 + COL_GAP,
              fontWeight: 900,
              opacity: 0.9
            }}
          >
            {ROUND_LABEL.R32}
          </div>

          {/* Other round headers */}
          {['R16', 'QF', 'SF', 'F', ...(showWinnerColumn ? ['W'] : [])].map(r => {
            const colIndex =
              r === 'R16' ? 2 :
              r === 'QF' ? 3 :
              r === 'SF' ? 4 :
              r === 'F' ? 5 :
              6

            return (
              <div
                key={`hdr-${r}`}
                style={{
                  position: 'absolute',
                  left: colX(colIndex),
                  top: PAD,
                  width: COL_WIDTH,
                  fontWeight: 900,
                  opacity: 0.9
                }}
              >
                {ROUND_LABEL[r] || r}
              </div>
            )
          })}

          {/* Connector lines */}
          <svg
            width={innerWidth}
            height={HEIGHT}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', opacity: 0.55 }}
          >
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="rgba(255,255,255,.22)"
                strokeWidth="2"
              />
            ))}
          </svg>

          {/* R32 split across two columns */}
          {(roundMap.R32 || []).map(m => {
            const n = m.match_no || 1
            const colIndex = n <= 8 ? 0 : 1
            return renderMatchCard(colIndex, 'R32', ROUND_INDEX.R32, m)
          })}

          {/* Other rounds */}
          {(roundMap.R16 || []).map(m => renderMatchCard(2, 'R16', ROUND_INDEX.R16, m))}
          {(roundMap.QF || []).map(m => renderMatchCard(3, 'QF', ROUND_INDEX.QF, m))}
          {(roundMap.SF || []).map(m => renderMatchCard(4, 'SF', ROUND_INDEX.SF, m))}
          {(roundMap.F || []).map(m => renderMatchCard(5, 'F', ROUND_INDEX.F, m))}

          {/* Winner column */}
          {showWinnerColumn && (
            <div
              style={{
                position: 'absolute',
                left: colX(6),
                top: cardY(ROUND_INDEX.F, 1),
                width: COL_WIDTH,
                height: CARD_H,
                padding: 12,
                borderRadius: 16,
                background: actualWinnerId
                  ? 'rgba(34,197,94,.14)'
                  : pickedWinnerId
                  ? 'rgba(56,189,248,.12)'
                  : 'rgba(255,255,255,.05)',
                border: actualWinnerId
                  ? '1px solid rgba(34,197,94,.28)'
                  : pickedWinnerId
                  ? '1px solid rgba(56,189,248,.22)'
                  : '1px solid rgba(255,255,255,.10)',
                boxShadow: '0 10px 30px rgba(0,0,0,.25)'
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Winner</div>
              <div style={{ marginTop: 8, fontWeight: 900, fontSize: 16 }}>{winnerName}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                {actualWinnerId ? 'Based on final result' : pickedWinnerId ? 'Based on pick' : 'TBD'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
