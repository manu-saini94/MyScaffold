import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useGetAdminMeQuery } from '../../services/adminApi'
import { ImportPage } from './ImportPage'
import { LettersPage } from './LettersPage'
import { LibraryPage } from './LibraryPage'
import { SettingsPage } from './SettingsPage'
import { WorldsPage } from './WorldsPage'
import { errorStatus } from './problem'
import { useAdminSignOutMutation } from './sessionApi'
import styles from './Admin.module.scss'

const GOOGLE_LOGIN = '/oauth2/authorization/google'

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.root}>
      <div className={styles.center}>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  )
}

/** The admin app, mounted at /admin/*. A Google session, not a viewer session: it has its own sign-in states. */
export default function AdminApp() {
  const { data: me, error, isLoading, refetch } = useGetAdminMeQuery()
  const [signOut, signingOut] = useAdminSignOutMutation()

  if (isLoading) return <Notice title="Admin"><p role="status">Checking sign-in...</p></Notice>
  if (!me || errorStatus(error) === 401) {
    const status = errorStatus(error)
    // 401: no session. 403: a viewer (unlock) session. The server never keeps a session for a non-admin Google
    // account (it is signed out at login and shown a 403 page), so both mean "not signed in with Google as admin".
    if (status === 401 || status === 403)
      return (
        <Notice title="Admin sign-in">
          {status === 403 && <p className={styles.muted}>You're viewing as a guest.</p>}
          <p>Sign in with the admin Google account to curate the gallery.</p>
          <p>
            <a className={styles.btn} href={GOOGLE_LOGIN}>
              Sign in with Google
            </a>
          </p>
        </Notice>
      )
    return (
      <Notice title="Admin">
        <p role="alert">Cannot reach the server.</p>
        <p>
          <button type="button" className={styles.btn} onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      </Notice>
    )
  }

  return (
    <div className={styles.root}>
      <header className={styles.bar}>
        <span className={styles.brand}>Our Story admin</span>
        <nav className={styles.nav} aria-label="Admin sections">
          <NavLink to="/admin/import">Import</NavLink>
          <NavLink to="/admin/library">Library</NavLink>
          <NavLink to="/admin/worlds">Worlds</NavLink>
          <NavLink to="/admin/letters">Letters</NavLink>
          <NavLink to="/admin/settings">Settings</NavLink>
        </nav>
        <span className={styles.who}>{me.name ?? me.email}</span>
        <button type="button" className={styles.btnGhost} disabled={signingOut.isLoading} onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <Routes>
          <Route index element={<Navigate to="import" replace />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="worlds/*" element={<WorldsPage />} />
          <Route path="letters" element={<LettersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/admin/import" replace />} />
        </Routes>
      </main>
    </div>
  )
}
