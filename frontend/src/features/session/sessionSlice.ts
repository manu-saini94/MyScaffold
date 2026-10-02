import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

const PROFILE_KEY = 'our-story-profile'

export type SessionStatus = 'unknown' | 'locked' | 'unlocked'
export type ProfileId = 'her'

export interface SessionState {
  status: SessionStatus
  profile: ProfileId | null
}

function readStoredProfile(): ProfileId | null {
  try {
    return sessionStorage.getItem(PROFILE_KEY) === 'her' ? 'her' : null
  } catch {
    return null // storage blocked: the choice simply does not survive a reload
  }
}

function writeStoredProfile(profile: ProfileId | null): void {
  try {
    if (profile) sessionStorage.setItem(PROFILE_KEY, profile)
    else sessionStorage.removeItem(PROFILE_KEY)
  } catch {
    /* storage blocked: keep the in-memory choice */
  }
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: (): SessionState => ({ status: 'unknown', profile: readStoredProfile() }),
  reducers: {
    statusResolved(state, action: PayloadAction<boolean>) {
      if (action.payload) {
        state.status = 'unlocked'
      } else {
        state.status = 'locked'
        state.profile = null
        writeStoredProfile(null)
      }
    },
    unlocked(state) {
      state.status = 'unlocked'
    },
    sessionLost(state) {
      state.status = 'locked'
      state.profile = null
      writeStoredProfile(null)
    },
    chooseProfile(state, action: PayloadAction<ProfileId>) {
      state.profile = action.payload
      writeStoredProfile(action.payload)
    },
  },
})

export const { statusResolved, unlocked, sessionLost, chooseProfile } = sessionSlice.actions
export const selectSessionStatus = (s: { session: SessionState }) => s.session.status
export const selectProfile = (s: { session: SessionState }) => s.session.profile
export default sessionSlice.reducer
