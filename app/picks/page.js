'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

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

  // 🔒 animation state
  const [savingState, setSavingState] = useState('idle') 
  // idle | saving | saved | submitted

  const deadline = useMemo(() => new Date(DEADLINE_UTC), [])
  const locked = Date.now() >= deadline.getTime()

  useEffect(() => {
    load()
  }, [])

  function deadlineLabelEST() {
    return new Date(DEADLINE_UTC).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }) + ' ET'
  }

  async function load() {
    setLoading(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) {
      setLoading(false)
      return
    }
    setUser(auth.user)

    const { data: groupData } = await supabase
      .from('groups')
      .select('id, name, teams(id, name)')
      .order('name')

    const { data: pickData } = await supabase
      .from('group_picks')
      .select('group_id, team_id, position, rank, submitted_at')
      .eq('user_id', auth.user.id)

    const map = {}
    let sub = null

    pickData?.forEach(p => {
      const pos = p.position ?? p.rank
      if (p.group_id && pos) {
        map[makeKey(p.group_id, pos)] = p.team_id
      }
      if (p.submitted_at) sub = p.submitted_at
    })

    setGroups(groupData || [])
    setPicks(map)
    setSubmittedAt(sub)
    setLoading(false)
  }

  function getOrderForGroup(group) {
    const ids = []
    for (let i = 1; i <= group.teams.length; i++) {
      const v = picks[makeKey(group.id, i)]
      if (v) ids.push(String(v))
    }
    const used = new Set(ids)
    const rest = group.teams.map(t => String(t.id)).filter(id => !used.has(id))
    return [...ids, ...rest]
  }

  function applyOrder(groupId, order) {
    setPicks(prev => {
      const next = { ...prev }
      Object.keys(next)
        .filter(k => k.startsWith(groupId))
        .forEach(k => delete next[k])
      order.forEach((id, i) => {
        next[makeKey(groupId, i + 1)] = id
      })
      return next
    })
  }

  async function saveDraft() {
    if (locked || !user) return

    setSavingState('saving')

    await supabase.from('group_picks').delete().eq('user_id', user.id)

    const rows = Object.entries(picks).map(([key, teamId]) => {
      const { group_id, position } = parseKey(key)
      return {
        user_id: user.id,
        group_id,
        team_id: teamId,
        position,
        rank: position,
        submitted_at: submittedAt || null
      }
    })

    await supabase.from('group_picks').insert(rows)

    setSavingState('saved')
    setTimeout(() => setSavingState('idle'), 1400)
  }

  async function submit() {
    if (locked || !user) return

    setSavingState('saving')

    await supabase.from('group_picks').delete().eq('user_id', user.id)

    const now = new Date().toISOString()
    const rows = Object.entries(picks).map(([key, teamId]) => {
      const { group_id, position } = parseKey(key)
      return {
        user_id: user.id,
        group_id,
        team_id: teamId,
        position,
        rank: position,
        submitted_at: now
      }
    })

    await supabase.from('group_picks').insert(rows)

    setSubmittedAt(now)
    setSavingState('submitted')
    setTimeout(() => setSavingState('idle'), 1800)
  }

  if (loading) {
    return <div className="container"><div className="card">Loading…</div></div>
  }

  return (
    <div className="container">
      <h1 className="h1">Group Picks</h1>
      <p className="sub">Drag teams to rank them. Deadline: <b>{deadlineLabelEST()}</b></p>

      {groups.map(group => {
        const order = getOrderForGroup(group)
        return (
          <div key={group.id} className="card">
            <h2 className="cardTitle">{group.name}</h2>
            {order.map((teamId, i) => (
              <div
                key={teamId}
                draggable={!locked}
                onDragStart={e => e.dataTransfer.setData('text/plain', i)}
                onDrop={e => {
                  const from = Number(e.dataTransfer.getData('text/plain'))
                  applyOrder(group.id, arrayMove(order, from, i))
                }}
                onDragOver={e => e.preventDefault()}
                className="rankRow"
              >
                <span className="rankNum">#{i + 1}</span>
                <span>{group.teams.find(t => String(t.id) === teamId)?.name}</span>
              </div>
            ))}
          </div>
        )
      })}

      {/* 🔒 ACTION BAR */}
      <div className="row" style={{ marginTop: 24 }}>
        <button
          className={`btn ${savingState !== 'idle' ? 'btnLocked' : ''}`}
          disabled={locked || savingState === 'saving'}
          onClick={saveDraft}
        >
          {savingState === 'saving'
            ? '🔒 Saving…'
            : savingState === 'saved'
            ? '✓ Saved'
            : 'Save'}
        </button>

        <button
          className={`btn btnPrimary ${savingState === 'submitted' ? 'btnGlow' : ''}`}
          disabled={locked || savingState === 'saving'}
          onClick={submit}
        >
          {savingState === 'saving'
            ? '🔒 Submitting…'
            : savingState === 'submitted'
            ? '🏁 Submitted!'
            : 'Submit'}
        </button>
      </div>

      {/* ✨ inline animation styles */}
      <style jsx>{`
        .rankRow {
          display: flex;
          gap: 12px;
          padding: 12px;
          border-radius: 14px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.12);
          margin-bottom: 8px;
          cursor: grab;
        }
        .rankNum {
          font-weight: 900;
          opacity: .7;
        }
        .btnLocked {
          opacity: .7;
        }
        .btnGlow {
          animation: glow 1.2s ease-out;
        }
        @keyframes glow {
          0% { box-shadow: 0 0 0 rgba(34,197,94,0); }
          50% { box-shadow: 0 0 24px rgba(34,197,94,.6); }
          100% { box-shadow: 0 0 0 rgba(34,197,94,0); }
        }
      `}</style>
    </div>
  )
}
