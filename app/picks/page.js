'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Deadline: March 11, 2026, 12:00 AM EST
 * EST is UTC-5, so that's 2026-03-11T05:00:00Z in UTC.
 */
const DEADLINE_UTC = '2026-03-11T05:00:00Z'

// UUID-safe key separator (UUIDs contain "-")
const KEY_SEP = '::'
const makeKey = (groupId, position) => `${groupId}${KEY_SEP}${position}`
const parseKey = key => {
  const [group_id, posStr] = String(key).split(KEY_SEP)
  return { group_id, position: Number(posStr) }
}

function arrayMove(arr, from, to) {
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export default function PicksPage() {
  const [user, setUser] = useState(null)
  const [groups, setGroups] = useState([])
  const [picks, setPicks] = useState({})
  const [submittedAt, setSubmittedAt] = useState(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const deadline = useMemo(() => new Date(DEADLINE_UTC), [])
  const locked = Date.now() >= deadline.getTime()

  // Drag state
  const dragFromRef = useRef(null)
  const [dragOverKey, setDragOverKey] = useState(null) // `${groupId}::${index}`

  // Auto-scroll while dragging
  const scrollRef = useRef(null)
  const autoScrollRef = useRef({ active: false, lastY: 0 })
  const rafRef = useRef(null)

  // Mobile tap-to-move state
  // { groupId, fromIndex } means "picked up" item
  const [tapPick, setTapPick] = useState(null)

  // Little "flash" animation after drop/move
  const [flashKey, setFlashKey] = useState(null)
  const flashTimerRef = useRef(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // cleanup
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  function deadlineLabelEST() {
    return (
      new Date(DEADLINE_UTC).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }) + ' ET'
    )
  }

  async function load() {
    setLoading(true)
    setMsg('')

    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) {
      setUser(null)
      setLoading(false)
      return
    }
    setUser(auth.user)

    const { data: groupData, error: gErr } = await supabase
      .from('groups')
      .select('id, name, teams(id, name)')
      .order('name')

    if (gErr) {
      setMsg(gErr.message)
      setLoading(false)
      return
    }

    const { data: pickData, error: pErr } = await supabase
      .from('group_picks')
      .select('group_id, team_id, position, rank, submitted_at')
      .eq('user_id', auth.user.id)

    if (pErr) {
      setMsg(pErr.message)
      setLoading(false)
      return
    }

    setGroups(groupData || [])

    const map = {}
    let sub = null

    ;(pickData || []).forEach(p => {
      const pos = p.position ?? p.rank
      if (p.group_id && pos != null) {
        map[makeKey(p.group_id, pos)] = p.team_id
      }
      if (p.submitted_at) sub = p.submitted_at
    })

    setPicks(map)
    setSubmittedAt(sub)
    setLoading(false)
  }

  // Build an ordered list of team IDs for a group:
  // 1) Use saved picks order (1..n) if present
  // 2) Append any missing teams (so list always contains all teams exactly once)
  function getOrderForGroup(group) {
    const groupId = group.id
    const n = group?.teams?.length || 0

    const pickedInOrder = []
    for (let pos = 1; pos <= n; pos++) {
      const v = picks[makeKey(groupId, pos)]
      if (v) pickedInOrder.push(String(v))
    }

    const used = new Set(pickedInOrder)
    const remaining = (group.teams || [])
      .map(t => String(t.id))
      .filter(id => !used.has(id))

    return [...pickedInOrder, ...remaining].slice(0, n)
  }

  function applyOrderToPicks(groupId, orderIds) {
    setPicks(prev => {
      const next = { ...prev }
      // Clear existing keys for this group (prevents stale duplicates)
      for (let i = 1; i <= 50; i++) {
        const k = makeKey(groupId, i)
        if (k in next) delete next[k]
      }
      for (let i = 0; i < orderIds.length; i++) {
        next[makeKey(groupId, i + 1)] = orderIds[i]
      }
      return next
    })
  }

  function flash(groupId, index) {
    const k = `${groupId}::${index}`
    setFlashKey(k)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashKey(null), 380)
  }

  async function saveDraft() {
    if (!user) return
    if (locked) {
      setMsg('Group picks are locked (deadline passed).')
      return
    }

    setMsg('Saving...')

    const keepSubmittedAt = submittedAt || null

    const rows = Object.entries(picks)
      .map(([key, teamId]) => {
        const { group_id, position } = parseKey(key)
        if (!group_id) return null
        if (!Number.isFinite(position)) return null
        if (!teamId) return null

        return {
          user_id: user.id,
          group_id,
          team_id: teamId, // UUID string
          position,
          rank: position, // satisfy NOT NULL rank too
          submitted_at: keepSubmittedAt
        }
      })
      .filter(Boolean)

    if (rows.length === 0) {
      setMsg('Make at least one pick before saving.')
      return
    }

    const { error } = await supabase
      .from('group_picks')
      .upsert(rows, { onConflict: 'user_id,group_id,position' })

    setMsg(error ? error.message : 'Saved ✅')
  }

  async function submit() {
    if (!user) return
    if (locked) {
      setMsg('Group picks are locked (deadline passed).')
      return
    }

    // Require full rankings before submit
    for (const g of groups) {
      for (let pos = 1; pos <= g.teams.length; pos++) {
        if (!picks[makeKey(g.id, pos)]) {
          setMsg('Please complete all group rankings before submitting.')
          return
        }
      }
    }

    const now = new Date().toISOString()
    setMsg('Submitting...')

    const rows = Object.entries(picks)
      .map(([key, teamId]) => {
        const { group_id, position } = parseKey(key)
        if (!group_id) return null
        if (!Number.isFinite(position)) return null
        if (!teamId) return null

        return {
          user_id: user.id,
          group_id,
          team_id: teamId,
          position,
          rank: position,
          submitted_at: now
        }
      })
      .filter(Boolean)

    const expected = groups.reduce((sum, g) => sum + (g?.teams?.length || 0), 0)
    if (rows.length !== expected) {
      setMsg('Internal error: some picks were missing. Please refresh and try again.')
      return
    }

    const { error } = await supabase
      .from('group_picks')
      .upsert(rows, { onConflict: 'user_id,group_id,position' })

    if (error) {
      setMsg(error.message)
      return
    }

    setSubmittedAt(now)
    setMsg('Submitted ✅ (You can still edit until the deadline)')
  }

  function resetGroup(group) {
    const defaultOrder = (group.teams || []).map(t => String(t.id))
    applyOrderToPicks(group.id, defaultOrder)
    setTapPick(null)
  }

  function teamNameById(group, id) {
    const t = (group.teams || []).find(x => String(x.id) === String(id))
    return t?.name || 'TBD'
  }

  // ---------- AUTO SCROLL ----------
  function startAutoScroll(yClient) {
    autoScrollRef.current.active = true
    autoScrollRef.current.lastY = yClient

    const step = () => {
      if (!autoScrollRef.current.active) return
      const el = scrollRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const y = autoScrollRef.current.lastY
        const edge = 80 // px
        const maxSpeed = 18

        let delta = 0
        if (y < rect.top + edge) {
          const pct = Math.max(0, (rect.top + edge - y) / edge)
          delta = -Math.ceil(pct * maxSpeed)
        } else if (y > rect.bottom - edge) {
          const pct = Math.max(0, (y - (rect.bottom - edge)) / edge)
          delta = Math.ceil(pct * maxSpeed)
        }
        if (delta !== 0) el.scrollTop += delta
      }
      rafRef.current = requestAnimationFrame(step)
    }

    if (!rafRef.current) rafRef.current = requestAnimationFrame(step)
  }

  function updateAutoScroll(yClient) {
    autoScrollRef.current.lastY = yClient
  }

  function stopAutoScroll() {
    autoScrollRef.current.active = false
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  // ---------- DRAG HANDLERS ----------
  function onDragStart(groupId, fromIndex) {
    dragFromRef.current = { groupId, fromIndex }
    // when dragging, clear tap mode
    setTapPick(null)
  }

  function onDragOver(e, groupId, toIndex) {
    e.preventDefault()
    setDragOverKey(`${groupId}::${toIndex}`)
    startAutoScroll(e.clientY)
    updateAutoScroll(e.clientY)
  }

  function onDragEnd() {
    stopAutoScroll()
    setDragOverKey(null)
    dragFromRef.current = null
  }

  function onDrop(group, toIndex) {
    stopAutoScroll()
    const info = dragFromRef.current
    dragFromRef.current = null
    setDragOverKey(null)

    if (!info) return
    if (info.groupId !== group.id) return
    if (info.fromIndex === toIndex) return

    const order = getOrderForGroup(group)
    const moved = arrayMove(order, info.fromIndex, toIndex)
    applyOrderToPicks(group.id, moved)
    flash(group.id, toIndex)
  }

  // ---------- MOBILE TAP-TO-MOVE ----------
  function onTapItem(group, index) {
    if (locked) return

    // If nothing selected, pick it up
    if (!tapPick) {
      setTapPick({ groupId: group.id, fromIndex: index })
      return
    }

    // If different group, switch to new pick-up
    if (tapPick.groupId !== group.id) {
      setTapPick({ groupId: group.id, fromIndex: index })
      return
    }

    // If tapping the same item, cancel
    if (tapPick.fromIndex === index) {
      setTapPick(null)
      return
    }

    // Drop onto tapped index
    const order = getOrderForGroup(group)
    const moved = arrayMove(order, tapPick.fromIndex, index)
    applyOrderToPicks(group.id, moved)
    flash(group.id, index)
    setTapPick({ groupId: group.id, fromIndex: index }) // keep "holding" the moved item (feels fast)
  }

  function moveUp(group, index) {
    if (index <= 0) return
    const order = getOrderForGroup(group)
    applyOrderToPicks(group.id, arrayMove(order, index, index - 1))
    flash(group.id, index - 1)
  }

  function moveDown(group, index) {
    const order = getOrderForGroup(group)
    if (index >= order.length - 1) return
    applyOrderToPicks(group.id, arrayMove(order, index, index + 1))
    flash(group.id, index + 1)
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card"><p>Loading...</p></div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="pill" href="/">🏠 Main Menu</a>
        <a className="pill" href="/standings">📊 Standings</a>
        <a className="pill" href="/leaderboard">🏆 Leaderboard</a>
        <a className="pill" href="/profile">👤 My Profile</a>
      </div>

      <h1 className="h1" style={{ marginTop: 14 }}>Group Picks</h1>
      <p className="sub">
        Drag teams to rank them. On mobile you can also tap a team, then tap where to drop it. Deadline:{' '}
        <strong>{deadlineLabelEST()}</strong>
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        {locked ? (
          <p style={{ margin: 0, fontWeight: 800 }}>🔒 Locked — deadline has passed.</p>
        ) : submittedAt ? (
          <p style={{ margin: 0, fontWeight: 800 }}>
            ✅ Submitted (counts for scoring). You can still edit and re-submit until the deadline.
          </p>
        ) : (
          <p style={{ margin: 0, fontWeight: 800 }}>
            ⏳ Not submitted yet — make sure you submit before the deadline.
          </p>
        )}
      </div>

      {tapPick && !locked && (
        <div className="badge" style={{ marginTop: 10 }}>
          📌 Tap-move mode: selected a team. Tap another rank to drop it (tap again to cancel).
        </div>
      )}

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      {/* Scroll container used for auto-scroll while dragging */}
      <div
        ref={scrollRef}
        style={{
          marginTop: 10,
          maxHeight: '75vh',
          overflowY: 'auto',
          paddingRight: 2
        }}
      >
        {groups.map(group => {
          const order = getOrderForGroup(group)

          return (
            <div key={group.id} className="card" style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                  <h2 className="cardTitle" style={{ marginBottom: 4 }}>{group.name}</h2>
                  <p className="cardSub" style={{ marginTop: 0 }}>
                    Drag to reorder. Mobile: tap-to-move or ↑ ↓.
                  </p>
                </div>

                <button className="btn" disabled={locked} onClick={() => resetGroup(group)}>
                  Reset
                </button>
              </div>

              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {order.map((teamId, index) => {
                  const isOver = dragOverKey === `${group.id}::${index}`
                  const isTapSelected = tapPick?.groupId === group.id && tapPick?.fromIndex === index
                  const isFlash = flashKey === `${group.id}::${index}`

                  return (
                    <div
                      key={`${group.id}-${teamId}`}
                      draggable={!locked}
                      onDragStart={() => onDragStart(group.id, index)}
                      onDragOver={e => onDragOver(e, group.id, index)}
                      onDragEnd={onDragEnd}
                      onDrop={() => onDrop(group, index)}
                      onClick={() => onTapItem(group, index)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        alignItems: 'center',
                        padding: 12,
                        borderRadius: 14,
                        cursor: locked ? 'default' : 'pointer',
                        transition: 'transform 140ms ease, background 140ms ease, border-color 140ms ease',
                        transform: isFlash ? 'scale(1.01)' : 'scale(1)',
                        background: isTapSelected
                          ? 'rgba(56,189,248,.16)'
                          : isOver
                          ? 'rgba(56,189,248,.12)'
                          : 'rgba(255,255,255,.06)',
                        border: isTapSelected
                          ? '1px solid rgba(56,189,248,.35)'
                          : isOver
                          ? '1px solid rgba(56,189,248,.28)'
                          : '1px solid rgba(255,255,255,.12)',
                        boxShadow: isOver || isTapSelected ? '0 10px 30px rgba(0,0,0,.25)' : 'none',
                        userSelect: 'none'
                      }}
                      title={!locked ? 'Drag or tap to move' : 'Locked'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 36,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 10,
                            background: 'rgba(0,0,0,.22)',
                            border: '1px solid rgba(255,255,255,.10)',
                            fontWeight: 900
                          }}
                          title="Rank"
                        >
                          #{index + 1}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontWeight: 900 }}>{teamNameById(group, teamId)}</div>
                          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                            {locked ? 'Locked' : isTapSelected ? 'Selected (tap a new rank)' : 'Drag or tap to move'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          className="btn"
                          disabled={locked || index === 0}
                          onClick={e => {
                            e.stopPropagation()
                            moveUp(group, index)
                          }}
                          title="Move up"
                        >
                          ↑
                        </button>

                        <button
                          className="btn"
                          disabled={locked || index === order.length - 1}
                          onClick={e => {
                            e.stopPropagation()
                            moveDown(group, index)
                          }}
                          title="Move down"
                        >
                          ↓
                        </button>

                        <div
                          title="Drag handle"
                          style={{
                            width: 42,
                            height: 34,
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,.20)',
                            border: '1px solid rgba(255,255,255,.10)',
                            fontWeight: 900,
                            opacity: locked ? 0.4 : 0.9
                          }}
                        >
                          ⠿
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" disabled={locked} onClick={saveDraft}>
          Save
        </button>
        <button className="btn btnPrimary" disabled={locked} onClick={submit}>
          Submit (Required before deadline)
        </button>
      </div>
    </div>
  )
}

