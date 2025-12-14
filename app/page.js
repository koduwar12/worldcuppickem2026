'use client'

import { useState } from 'react'

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)

  return (
    <main style={{ padding: 24 }}>
      <h1>World Cup Pick’em 2026</h1>

      {!loggedIn ? (
        <button onClick={() => setLoggedIn(true)}>
          Fake Login (Test)
        </button>
      ) : (
        <>
          <p>Welcome! ⚽</p>
          <button onClick={() => setLoggedIn(false)}>
            Log out
          </button>
        </>
      )}
    </main>
  )
}
