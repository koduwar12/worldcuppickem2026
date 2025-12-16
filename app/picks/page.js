'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Deadline: March 11, 2026, 12:00 AM EST
 * EST is UTC-5, so that's 2026-03-11T05:00:00Z in UTC.
 */
const DEADLINE_UTC = '2026-03-11T05:00:00Z'

// UUID-safe helpers
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

  // Lock animation state
  const [savingState, setSavingState] = useState('idle') // idle | saving | saved | submitted | error

  // Mobile tap-to-move fallback
  const [tapPick, setTapPick] = useState(null) // { groupId, fromIndex } or null

  // Drag visual feedback
  const [flashKey, setFlashKey] = useState(null)
  const flashTimerRef = useRef(null)

  // True touch drag (Pointer Events)
  const [dragState, setDragState] = useState(null)
  // { groupId, fromIndex, overIndex, pointerId, active }

  const scrollRef = useRef(null)

  const deadline = useMemo(() => new Date(DEADLINE_UTC), [])
  const locked = Date.now() >= deadline.getTime()

  useEffect(() => {
    load()
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      // remove any stray listeners if component unmounts mid-drag
      cleanupPointerListeners()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const map = {}
    let sub = null
    ;(pickData || []).forEach(p => {
      const pos = p.position ?? p.rank
      if (p.group_id && pos != null) map[makeKey(p.group_id, pos)] = p.team_id
      if (p.submitted_at) sub = p.submitted_at
    })

    setGroups(groupData || [])
    setPicks(map)
    setSubmittedAt(sub)
    setLoading(false)
  }

  function flash(groupId, index) {
    const k = `${groupId}::${index}`
    setFlashKey(k)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashKey(null), 380)
  }

  function teamNameById(group, id) {
    const t = (group.teams || []).find(x => String(x.id) === String(id))
    return t?.name || 'TBD'
  }

  // Build an ordered list for a group:
  // 1) from saved picks (1..n)
  // 2) append missing teams (ensures exactly once)
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
      // clear keys for this group
      for (let i = 1; i <= 50; i++) {
        const k = makeKey(groupId, i)
        if (k in next) delete next[k]
      }
      // set new
      for (let i = 0; i < orderIds.length; i++) {
        next[makeKey(groupId, i + 1)] = orderIds[i]
      }
      return next
    })
  }

  // ---------- Save / Submit (DB-safe for UNIQUE(user_id,group_id,team_id)) ----------
  async function saveDraft() {
    if (!user) return
    if (locked) {
      setMsg('Group picks are locked (deadline passed).')
      return
    }
    if (savingState === 'saving') return

    setSavingState('saving')
    setMsg('')

    try {
      const delRes = await supabase.from('group_picks').delete().eq('user_id', user.id)
      if (delRes.error) throw delRes.error

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
            team_id: teamId,
            position,
            rank: position,
            submitted_at: keepSubmittedAt
          }
        })
        .filter(Boolean)

      if (rows.length === 0) {
        setSavingState('idle')
        setMsg('Make at least one pick before saving.')
        return
      }

      const insRes = await supabase.from('group_picks').insert(rows)
      if (insRes.error) throw insRes.error

      setSavingState('saved')
      setTimeout(() => setSavingState('idle'), 1400)
    } catch (e) {
      setSavingState('error')
      setMsg(e?.message || 'Save failed.')
      setTimeout(() => setSavingState('idle'), 1600)
    }
  }

  async function submit() {
    if (!user) return
    if (locked) {
      setMsg('Group picks are locked (deadline passed).')
      return
    }
    if (savingState === 'saving') return

    // Require full rankings
    for (const g of groups) {
      for (let pos = 1; pos <= g.teams.length; pos++) {
        if (!picks[makeKey(g.id, pos)]) {
          setMsg('Please complete all group rankings before submitting.')
          return
        }
      }
    }

    setSavingState('saving')
    setMsg('')

    try {
      const delRes = await supabase.from('group_picks').delete().eq('user_id', user.id)
      if (delRes.error) throw delRes.error

      const now = new Date().toISOString()
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
        setSavingState('idle')
        setMsg('Internal error: some picks were missing. Please refresh and try again.')
        return
      }

      const insRes = await supabase.from('group_picks').insert(rows)
      if (insRes.error) throw insRes.error

      setSubmittedAt(now)
      setSavingState('submitted')
      setTimeout(() => setSavingState('idle'), 1800)
    } catch (e) {
      setSavingState('error')
      setMsg(e?.message || 'Submit failed.')
      setTimeout(() => setSavingState('idle'), 1600)
    }
  }

  // ---------- Per group controls ----------
  function resetGroup(group) {
    const defaultOrder = (group.teams || []).map(t => String(t.id))
    applyOrderToPicks(group.id, defaultOrder)
    setTapPick(null)
  }

  function moveUp(group, index) {
    if (locked) return
    if (index <= 0) return
    const order = getOrderForGroup(group)
    applyOrderToPicks(group.id, arrayMove(order, index, index - 1))
    flash(group.id, index - 1)
  }

  function moveDown(group, index) {
    if (locked) return
    const order = getOrderForGroup(group)
    if (index >= order.length - 1) return
    applyOrderToPicks(group.id, arrayMove(order, index, index + 1))
    flash(group.id, index + 1)
  }

  // ---------- Mobile tap-to-move ----------
  function onTapItem(group, index) {
    if (locked) return
    // if currently dragging with pointer, ignore taps
    if (dragState?.active) return

    if (!tapPick) {
      setTapPick({ groupId: group.id, fromIndex: index })
      return
    }

    if (tapPick.groupId !== group.id) {
      setTapPick({ groupId: group.id, fromIndex: index })
      return
    }

    if (tapPick.fromIndex === index) {
      setTapPick(null)
      return
    }

    const order = getOrderForGroup(group)
    applyOrderToPicks(group.id, arrayMove(order, tapPick.fromIndex, index))
    flash(group.id, index)
    setTapPick({ groupId: group.id, fromIndex: index }) // keep holding the moved item
  }

  // ---------- True touch drag (pointer events) ----------
  function cleanupPointerListeners() {
    window.removeEventListener('pointermove', onWindowPointerMove, { passive: false })
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('pointercancel', onWindowPointerUp)
  }

  function startPointerDrag(e, groupId, fromIndex) {
    if (locked) return
    e.preventDefault()
    e.stopPropagation()

    setTapPick(null)

    setDragState({
      groupId,
      fromIndex,
      overIndex: fromIndex,
      pointerId: e.pointerId,
      active: true
    })

    cleanupPointerListeners()
    window.addEventListener('pointermove', onWindowPointerMove, { passive: false })
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
  }

  function autoScrollIfNeeded(clientY) {
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const edge = 80
    const maxSpeed = 20

    let delta = 0
    if (clientY < rect.top + edge) {
      const pct = Math.max(0, (rect.top + edge - clientY) / edge)
      delta = -Math.ceil(pct * maxSpeed)
    } else if (clientY > rect.bottom - edge) {
      const pct = Math.max(0, (clientY - (rect.bottom - edge)) / edge)
      delta = Math.ceil(pct * maxSpeed)
    }
    if (delta !== 0) el.scrollTop += delta
  }

  function findRankItemIndexAtPoint(x, y) {
    const el = document.elementFromPoint(x, y)
    const item = el?.closest?.('[data-rank-item="1"]')
    if (!item) return null
    const idx = item.getAttribute('data-index')
    const gid = item.getAttribute('data-group')
    if (idx == null || gid == null) return null
    return { groupId: gid, index: Number(idx) }
  }

  function onWindowPointerMove(e) {
    if (!dragState?.active) return
    // prevent page scroll while dragging
    e.preventDefault()

    autoScrollIfNeeded(e.clientY)

    const hit = findRankItemIndexAtPoint(e.clientX, e.clientY)
    if (!hit) return
    if (hit.groupId !== dragState.groupId) return

    if (hit.index !== dragState.overIndex) {
      setDragState(prev => (prev ? { ...prev, overIndex: hit.index } : prev))
      setFlashKey(`${dragState.groupId}::${hit.index}`)
    }
  }

  function onWindowPointerUp() {
    if (!dragState?.active) return

    const { groupId, fromIndex, overIndex } = dragState

    // Apply the reorder on release
    const group = groups.find(g => String(g.id) === String(groupId))
    if (group) {
      const order = getOrderForGroup(group)
      if (fromIndex !== overIndex) {
        applyOrderToPicks(groupId, arrayMove(order, fromIndex, overIndex))
        flash(groupId, overIndex)
      }
    }

    setDragState(null)
    setFlashKey(null)
    cleanupPointerListeners()
  }

  // ---------- Render ----------
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
        Drag using the <b>⠿</b> handle, or use <b>↑ ↓</b> on mobile. Deadline: <strong>{deadlineLabelEST()}</strong>
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
          📌 Tap-move mode: tapped a team. Tap another rank to drop it (tap again to cancel).
        </div>
      )}

      {msg && (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0, opacity: 0.9 }}>{msg}</p>
        </div>
      )}

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
                    Drag from ⠿, or use ↑ ↓. (Tapping a row also supports tap-to-move.)
                  </p>
                </div>

                <button className="btn" disabled={locked} onClick={() => resetGroup(group)}>
                  Reset
                </button>
              </div>

              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {order.map((teamId, index) => {
                  const isTapSelected = tapPick?.groupId === group.id && tapPick?.fromIndex === index
                  const isDraggingThis =
                    dragState?.active && dragState.groupId === group.id && dragState.fromIndex === index
                  const isOver =
                    dragState?.active && dragState.groupId === group.id && dragState.overIndex === index
                  const isFlash = flashKey === `${group.id}::${index}`

                  return (
                    <div
                      key={`${group.id}-${teamId}`}
                      data-rank-item="1"
                      data-group={group.id}
                      data-index={index}
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
                        transform: isDraggingThis ? 'scale(1.01)' : isFlash ? 'scale(1.01)' : 'scale(1)',
                        opacity: isDraggingThis ? 0.7 : 1,
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
                      title={locked ? 'Locked' : 'Tap to move (or drag using handle)'}
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
                            {locked
                              ? 'Locked'
                              : isTapSelected
                              ? 'Selected (tap a new rank)'
                              : 'Drag handle ⠿ or use ↑ ↓'}
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

                        {/* Dotted handle: true mobile drag starts here */}
                        <div
                          onPointerDown={e => startPointerDrag(e, String(group.id), index)}
                          title="Drag"
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
                            opacity: locked ? 0.4 : 0.95,
                            // critical for mobile drag
                            touchAction: 'none'
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

      {/* ACTION BAR with lock animation */}
      <div className="row" style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
            : 'Save'}
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
            : 'Submit'}
        </button>
      </div>

      <style jsx>{`
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
