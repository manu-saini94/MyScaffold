import { Component, type ReactNode } from 'react'
import styles from './World.module.scss'

interface State {
  failed: boolean
}

/** Catches a layout that fails to load or render (for example a stale chunk after a deploy) and offers a reload. */
export class LayoutBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className={styles.notice}>
        <p>This chapter could not be shown.</p>
        <button type="button" className={styles.cta} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
