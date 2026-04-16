import Link from "next/link"
import { signIn, signOut, useSession } from "next-auth/react"
import styles from "./header.module.css"

export default function Header() {
  const { data: session, status } = useSession()
  const loading = status === "loading"

  return (
    <header>
      <noscript>
        <style>{`.nojs-show { opacity: 1; top: 0; }`}</style>
      </noscript>
      <div className={styles.signedInStatus}>
        <p
          className={`nojs-show ${
            !session && loading ? styles.loading : styles.loaded
          }`}
        >
          {!session && (
            <>
              <span className={styles.notSignedInText}>
                No has iniciado sesión
              </span>
              <a
                href={`/api/auth/signin`}
                className={styles.buttonPrimary}
                onClick={(e) => {
                  e.preventDefault()
                  // Forzamos el inicio de sesión con el proveedor "worldcoin"
                  signIn("worldcoin") 
                }}
              >
                Entrar con World ID
              </a>
            </>
          )}
          {session?.user && (
            <>
              {session.user.image && (
                <span
                  style={{ backgroundImage: `url('${session.user.image}')` }}
                  className={styles.avatar}
                />
              )}
              <span className={styles.signedInText}>
                <small>Sesión iniciada como</small>
                <br />
                <strong>{session.user.name ?? "Usuario Worldcoin"}</strong>
                {/* Mostramos el nivel de verificación que configuramos en el paso 2 */}
                {(session.user as any).verificationLevel && (
                  <span style={{ 
                    fontSize: '10px', 
                    marginLeft: '8px', 
                    padding: '2px 5px', 
                    backgroundColor: '#000', 
                    color: '#fff', 
                    borderRadius: '4px' 
                  }}>
                    {(session.user as any).verificationLevel.toUpperCase()}
                  </span>
                )}
              </span>
              <a
                href={`/api/auth/signout`}
                className={styles.button}
                onClick={(e) => {
                  e.preventDefault()
                  signOut()
                }}
              >
                Cerrar sesión
              </a>
            </>
          )}
        </p>
      </div>
      <nav>
        <ul className={styles.navItems}>
          <li className={styles.navItem}><Link href="/">Inicio</Link></li>
          <li className={styles.navItem}><Link href="/client">Cliente</Link></li>
          <li className={styles.navItem}><Link href="/server">Servidor</Link></li>
          <li className={styles.navItem}><Link href="/protected">Protegido</Link></li>
          <li className={styles.navItem}><Link href="/admin">Panel Admin</Link></li>
        </ul>
      </nav>
    </header>
  )
}
