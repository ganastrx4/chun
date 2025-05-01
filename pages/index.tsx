"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session")
        const session = await response.json()
        setIsLoggedIn(session && Object.keys(session).length > 0)
      } catch (error) {
        console.error("Error checking session:", error)
        setIsLoggedIn(false)
      }
    }
    checkSession()
  }, [])

  return (
    <div>
      <header>
        <noscript>
          <style>{`.nojs-show { opacity: 1; top: 0; }`}</style>
        </noscript>

        <div className="signedInStatus">
          {!isLoggedIn ? (
            <p className="nojs-show loaded">
              <span className="notSignedInText">You are not signed in</span><br />
              <a
                href="https://dane-sound-seahorse.ngrok-free.app/api/auth/signin"
                className="buttonPrimary"
              >
                Sign in
              </a>
            </p>
          ) : (
            <p className="nojs-show loaded">
              <span
                className="avatar"
                style={{ backgroundImage: `url('https://via.placeholder.com/40')` }}
              />
              <span className="signedInText">
                <small>Signed in</small><br />
                <strong>Worldcoin User</strong>
              </span><br /><br />
              <a href="/api/auth/signout" className="button">
                Sign out
              </a>
            </p>
          )}
        </div>

        <nav>
          <ul className="navItems">
            <li className="navItem"><Link href="/">Home</Link></li>
            <li className="navItem"><Link href="/client">Client</Link></li>
            <li className="navItem"><Link href="/server">Server</Link></li>
            <li className="navItem"><Link href="/protected">Protected</Link></li>
            <li className="navItem"><Link href="/api-example">API</Link></li>
            <li className="navItem"><Link href="/admin">Admin</Link></li>
            <li className="navItem"><Link href="/me">Me</Link></li>
          </ul>
        </nav>

        <style jsx>{`
          .nojs-show { opacity: 1; top: 0; }
          .signedInStatus { margin-bottom: 20px; }
          .buttonPrimary, .button { padding: 10px 20px; background: blue; color: white; text-decoration: none; border-radius: 5px; }
          .avatar { width: 40px; height: 40px; border-radius: 50%; background-size: cover; display: inline-block; vertical-align: middle; }
          .signedInText { margin-left: 10px; display: inline-block; vertical-align: middle; }
          .navItems { list-style: none; padding: 0; display: flex; gap: 10px; }
          .navItem a { text-decoration: none; color: black; }
        `}</style>
      </header>
    </div>
  )
}

