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

// ✅ Layout tuning (roomy + readable)
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

  // ✅ Connector lines
  const paths = []

  // R32 -> R16 (split)
  const r32 = roundMap.R32 || []
  for (const m of r32) {
    const n = m.match_no || 1

    const fromCol = n <= 8 ? 0 : 1
    const toCol = 2 // R16 column

    const x1 = colX(fromCol) + COL_WIDTH
    const x2 = colX(toCol)
    const midX = (x1 + x2) / 2

    const y1 = cardCenterY(ROUND_INDEX.R32, n)

    let r16No
    if (n <= 8) {
      r16No = Math.ceil(n / 2) // 1..4
    } else {
      r16No = 4 + Math.ceil((n - 8) / 2) // 5..8
    }
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
