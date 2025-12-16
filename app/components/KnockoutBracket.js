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

// Layout tuning
const COL_WIDTH = 270
const COL_GAP = 110

const UNIT = 44
const TOTAL_ROWS = 32
const CARD_H = 86

const PAD = 16
const HEADER_H = 44
const HEIGHT = TOTAL_ROWS * UNIT + HEADER_H + PAD * 2

const COLS = ['R32_L', 'R32_R', 'R16', 'QF', 'SF', 'F', 'W']
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
  if (hs == null || as == null) return null
  if (hs === as) return null
  return hs > as ? match.home?.id || match.home_team_id : match.away?.id || match.away_team_id
}

function colX(i) {
  return PAD + i * (COL_WIDTH + COL_GAP)
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

function getTeamName(t) {
  return t?.name || 'TBD'
}

function getWinnerName(finalMatch, teamId) {
  if (!finalMatch || !teamId) return null
  if (finalMatch.home?.id === teamId) return finalMatch.home.name
  if (finalMatch.away?.id === teamId) return finalMatch.away.name
  return null
}

export default function KnockoutBracket({
  matches,
  selections,
  locked = false,
  onSelect,
  mode = 'picks',
  subtitle,
  showWinnerColumn = true
}) {
  const roundMap = ensureSlots(buildRoundMap(matches))
  const totalCols = showWinnerColumn ? COLS.length : COLS.length - 1
  const innerWidth = PAD * 2 + (totalCols - 1) * (COL_WIDTH + COL_GAP) + COL_WIDTH

  const paths = []

  // R32 → R16 (split)
  for (const m of roundMap.R32) {
    const n = m.match_no
    const fromCol = n <= 8 ? 0 : 1
    const toCol = 2

    const x1 = colX(fromCol) + COL_WIDTH
    const x2 = colX(toCol)
    const midX = (x1 + x2) / 2

    const y1 = cardCenterY(ROUND_INDEX.R32, n)
    const r16No = n <= 8 ? Math.ceil(n / 2) : 4 + Math.ceil((n - 8) / 2)
    const y2 = cardCenterY(ROUND_INDEX.R16, r16No)

    paths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`)
  }

  const chain = [
    { f: 'R16', t: 'QF', fc: 2, tc: 3, fi: 1, ti: 2 },
    { f: 'QF', t: 'SF', fc: 3, tc: 4, fi: 2, ti: 3 },
    { f: 'SF', t: 'F', fc: 4, tc: 5, fi: 3, ti: 4 }
  ]

  for (const s of chain) {
    for (const m of roundMap[s.f]) {
      const fromNo = m.match_no
      const toNo = Math.ceil(fromNo / 2)

      const x1 = colX(s.fc) + COL_WIDTH
      const x2 = colX(s.tc)
      const midX = (x1 + x2) / 2

      const y1 = cardCenterY(s.fi, fromNo)
      const y2 = cardCenterY(s.ti, toNo)

      paths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`)
    }
  }

  if (showWinnerColumn) {
    const x1 = colX(5) + COL_WIDTH
    const x2 = colX(6)
    const midX = (x1 + x2) / 2
    const y = cardCenterY(ROUND_INDEX.F, 1)
    paths.push(`M ${x1} ${y} H ${midX} H ${x2}`)
  }

  const finalMatch = roundMap.F[0]
  const actualWinnerId = winnerTeamId(finalMatch)
  const pickedWinnerId = finalMatch?.id && selections?.[finalMatch.id]

  const winnerName =
    getWinnerName(finalMatch, actualWinnerId) ||
    getWinnerName(finalMatch, pickedWinnerId) ||
    'TBD'

  function renderCard(col, roundKey, roundIdx, m) {
    const isR32 = roundKey === 'R32'
    const matchId = m.id
    const home = m.home
    const away = m.away

    const pick = selections?.[matchId]
    const actual = winnerTeamId(m)

    const cardBg =
      pick && actual && pick === actual
        ? 'rgba(34,197,94,.14)'
        : pick && actual
        ? 'rgba(248,113,113,.10)'
        : 'rgba(255,255,255,.05)'

    return (
      <div
        key={`${roundKey}-${m.match_no}-${col}`}
        style={{
          position: 'absolute',
          left: colX(col),
          top: cardY(roundIdx, m.match_no),
          width: COL_WIDTH,
          height: CARD_H,
          padding: 12,
          borderRadius: 16,
          background: cardBg,
          border: '1px solid rgba(255,255,255,.10)',
          boxShadow: '0 10px 30px rgba(0,0,0,.25)'
        }}
      >
        {/* Header row */}
        {!isR32 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
            <span>Match {m.match_no}</span>
            {m.is_final ? <span>✅ Final</span> : <span>Pending</span>}
          </div>
        )}

        {/* Teams */}
        <div style={{ marginTop: isR32 ? 4 : 8, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 900 }}>{getTeamName(home)}</span>
            {m.home_score != null && <span>{m.home_score}</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 900 }}>{getTeamName(away)}</span>
            {m.away_score != null && <span>{m.away_score}</span>}
          </div>
        </div>

        {mode === 'picks' && !isR32 && (
          <select
            className="field"
            disabled={locked || !home?.id || !away?.id}
            value={pick ?? ''}
            onChange={e => onSelect(matchId, e.target.value)}
            style={{ marginTop: 10 }}
          >
            <option value="">Pick winner…</option>
            <option value={home?.id}>{home?.name}</option>
            <option value={away?.id}>{away?.name}</option>
          </select>
        )}
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 18, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div className="cardTitle">Knockout Bracket</div>
          {subtitle && <div style={{ fontSize: 13, opacity: 0.8 }}>{subtitle}</div>}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Scroll → ↓</div>
      </div>

      <div style={{ marginTop: 12, overflow: 'auto', maxHeight: '70vh' }}>
        <div style={{ position: 'relative', width: innerWidth, height: HEIGHT }}>
          {/* Headers */}
          <div style={{ position: 'absolute', left: colX(0), top: PAD, width: COL_WIDTH * 2 + COL_GAP, fontWeight: 900 }}>
            {ROUND_LABEL.R32}
          </div>

          {['R16', 'QF', 'SF', 'F', ...(showWinnerColumn ? ['W'] : [])].map(r => {
            const col =
              r === 'R16' ? 2 :
              r === 'QF' ? 3 :
              r === 'SF' ? 4 :
              r === 'F' ? 5 :
              6

            return (
              <div key={r} style={{ position: 'absolute', left: colX(col), top: PAD, width: COL_WIDTH, fontWeight: 900 }}>
                {ROUND_LABEL[r]}
              </div>
            )
          })}

          {/* Lines */}
          <svg width={innerWidth} height={HEIGHT} style={{ position: 'absolute', top: 0, left: 0, opacity: 0.55 }}>
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="2" />
            ))}
          </svg>

          {/* Cards */}
          {roundMap.R32.map(m => renderCard(m.match_no <= 8 ? 0 : 1, 'R32', 0, m))}
          {roundMap.R16.map(m => renderCard(2, 'R16', 1, m))}
          {roundMap.QF.map(m => renderCard(3, 'QF', 2, m))}
          {roundMap.SF.map(m => renderCard(4, 'SF', 3, m))}
          {roundMap.F.map(m => renderCard(5, 'F', 4, m))}

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
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.10)'
              }}
            >
              <div style={{ fontWeight: 900 }}>Winner</div>
              <div style={{ marginTop: 8, fontWeight: 900, fontSize: 16 }}>{winnerName}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
