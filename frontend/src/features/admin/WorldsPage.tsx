import { NavLink, Route, Routes, useParams } from 'react-router-dom'
import { useListWorldsQuery, useReorderWorldsMutation } from '../../services/adminApi'
import { move } from './momentsModel'
import { ProblemAlert } from './ui'
import { WorldEditor } from './WorldEditor'
import styles from './Admin.module.scss'

function EditById() {
  const { id } = useParams()
  const { data: worlds, error } = useListWorldsQuery()
  if (error) return <ProblemAlert error={error} />
  if (!worlds) return <p className={styles.muted}>Loading world...</p>
  const world = worlds.find((w) => w.id === id)
  if (!world) return <p role="alert" className={styles.alert}>That world does not exist.</p>
  return <WorldEditor key={world.id} world={world} />
}

export function WorldsPage() {
  const { data: worlds, error } = useListWorldsQuery()
  const [reorder, reordering] = useReorderWorldsMutation()
  const shift = (from: number, to: number) => {
    if (worlds) void reorder(move(worlds, from, to).map((w) => w.id))
  }

  return (
    <section className={styles.page} aria-labelledby="worlds-h">
      <h1 id="worlds-h">Worlds</h1>
      <div className={styles.split}>
        <nav aria-label="Worlds">
          <NavLink to="/admin/worlds/new" className={styles.btn} end>
            New world
          </NavLink>
          <ProblemAlert error={error ?? reordering.error} />
          <ul className={styles.list} style={{ marginTop: 'var(--space-3)' }}>
            {worlds?.map((w, i) => (
              <li key={w.id}>
                <NavLink to={`/admin/worlds/${w.id}`} className={styles.listLink}>
                  {w.title}
                  <span className={styles.muted}>
                    {' '}
                    {w.published ? '' : '(draft) '}
                    {w.momentCount} photos
                  </span>
                </NavLink>
                <button type="button" className={styles.btnGhost} aria-label={`Move ${w.title} up`} disabled={i === 0 || reordering.isLoading} onClick={() => shift(i, i - 1)}>
                  Up
                </button>
                <button type="button" className={styles.btnGhost} aria-label={`Move ${w.title} down`} disabled={i === worlds.length - 1 || reordering.isLoading} onClick={() => shift(i, i + 1)}>
                  Down
                </button>
              </li>
            ))}
          </ul>
          {worlds?.length === 0 && <p className={styles.muted}>No worlds yet.</p>}
        </nav>
        <Routes>
          <Route index element={<p className={styles.muted}>Choose a world, or create a new one.</p>} />
          <Route path="new" element={<WorldEditor key="new" />} />
          <Route path=":id" element={<EditById />} />
        </Routes>
      </div>
    </section>
  )
}
