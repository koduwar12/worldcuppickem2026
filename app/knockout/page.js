'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'F']
const ROUND_LABEL = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals', F: 'Final' }

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
