'use client'

import React from 'react'

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'F']
const ROUND_LABEL = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  F: 'Final',
  W: 'Winner'
}
const ROUND_MATCH_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 }

// ✅ Layout tuning (less congested)
const COL_WIDTH = 270
const COL_GAP = 100

const UNIT = 44            // vertical unit (bigger = more spacing)
const TOTAL_ROWS = 32      // scaffold rows for R32
const CARD_H = 86          // card height

const PAD = 16
const HEADER_H = 44        // reserve space for round headers
const HEIGHT = TOTAL_ROWS * UNIT + HEADER_H + PAD * 2

function buildRoundMap(matches) {
  const map = {}
  for (const r of ROUND_ORDER) map[r] = []
  for (const m of matches || []) {
    if (!map[m.round]) map[m.round] = []
    map[m.round].push(m)
  }
  for (const r of ROUND_ORDER) {
    map[r].sort((a, b) => (a.match_no ?? 0) - (b.match_no ?? 0))
  }
  return map
}

function ensureSlots(roundMap) {
  const out = {}
  for (const r of ROUND_ORDER) {
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

function colX(roundIndex) {
  return PAD + roundIndex * (COL_WIDTH + COL_GAP)
}

function centerRow(roundIndex, matchNo) {
  // matchNo starts at 1, roundIndex 0=R32
  const mult = Math.pow(2, roundIndex)
  return (2 * matchNo - 1) * mult
}

function cardCenterY(roundIndex, matchNo) {
  // push everything down by HEADER_H
  return PAD + HEADER_H + centerRow(roundIndex, matchNo) * UNIT
}

function cardY(roundIndex, matchNo) {
  return cardCenterY(roundIndex, matchNo) - CARD_H / 2
}

function getTeamName(obj) {
  return obj?.name || 'TBD'
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
  const roundsToRender = showWinnerColumn ? [...ROUND_ORDER, 'W'] : [...ROUND_ORDER]
  const totalCols = roundsToRender.length
  const innerWidth = PAD * 2 + (totalCols - 1) * (COL_WIDTH + COL_GAP) + COL_WIDTH

  // Connector lines
  const paths = []
  for (let rIndex = 0; rIndex < ROUND_ORDER.length - 1; rIndex++) {
    const fromRound = ROUND_ORDER[rIndex]
    const x1 = colX(rIndex) + COL_WIDTH
    const x2 = colX(rIndex + 1)
    const midX = x1 + COL_GAP / 2

    const fromMatches = roundMap[fromRound] || []
    for (const m of fromMatches) {
      const fromNo = m.match_no || 1
      const toNo = Math.ceil(fromNo / 2)
      const y1 = cardCenterY(rIndex, fromNo)
      const y2 = cardCenterY(rIndex + 1, toNo)
      paths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`)
    }
  }

  // Final -> Winner connector
  if (showWinnerColumn) {
    const finalX1 = colX(ROUND_ORDER.length - 1) + COL_WIDTH
    const winX2 = colX(ROUND_ORDER.length)
    const y = cardCenterY(ROUND_ORDER.length - 1, 1)
    const midX = finalX1 + COL_GAP / 2
    paths.push(`M ${finalX1} ${y} H ${midX} H ${winX2}`)
  }

  // Winner card data
  const finalMatch = (roundMap.F || [])[0]
  const actualWinnerId = winnerTeamId(finalMatch)
  const pickedWinnerId = finalMatch?.id && selections ? selections[finalMatch.id] : null

  const winnerName =
    (actualWinnerId &&
      (finalMatch?.home?.id === actualWinnerId
        ? finalMatch?.home?.name
        : finalMatch?.away?.id === actualWinnerId
        ? finalMatch?.away?.name
        : null)) ||
    (!actualWinnerId && pickedWinnerId
      ? (finalMatch?.home?.id === pickedWinnerId
          ? finalMatch?.home?.name
          : finalMatch?.away?.id === pickedWinnerId
          ? finalMatch?.away?.name
          : null)
      : null) ||
    'TBD'

  function renderMatchCard(roundKey, roundIndex, matchObj) {
    const matchId = matchObj?.id
    const matchNo = matchObj?.match_no || 1
    const home = matchObj?.home
    const away = matchObj?.away
    const canPick = !!home?.id && !!away?.id && typeof matchId !== 'string'

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

    return (
      <div
        key={`${roundKey}-${matchNo}`}
        style={{
          position: 'absolute',
          left: colX(roundIndex),
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
            Match {matchNo}
          </div>
          {matchObj?.is_final ? (
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}>✅ Final</div>
          ) : (
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.55 }}>Pending</div>
          )}
        </div>

        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
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

      {/* ✅ Let it scroll vertically too (brackets are tall) */}
      <div
        style={{
          marginTop: 12,
          overflowX: 'auto',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,.10)',
          background: 'rgba(0,0,0,.12)',
          maxHeight: '70vh' // key: prevents “everything squished”
        }}
      >
        <div style={{ position: 'relative', width: innerWidth, height: HEIGHT }}>
          {/* Round headers */}
          {roundsToRender.map((r, idx) => (
            <div
              key={`hdr-${r}`}
              style={{
                position: 'absolute',
                left: colX(idx),
                top: PAD,
                width: COL_WIDTH,
                fontWeight: 900,
                opacity: 0.9
              }}
            >
              {ROUND_LABEL[r] || r}
            </div>
          ))}

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

          {/* Match cards */}
          {ROUND_ORDER.map((r, rIndex) => {
            const list = roundMap[r] || []
            return list.map(m => renderMatchCard(r, rIndex, m))
          })}

          {/* Winner column */}
          {showWinnerColumn && (
            <div
              style={{
                position: 'absolute',
                left: colX(ROUND_ORDER.length),
                top: cardY(ROUND_ORDER.length - 1, 1),
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
