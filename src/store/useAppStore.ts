import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type System = 'hoz' | 'mwsal' | null

interface AppState {
  selectedSystem: System
  showWelcome: boolean
  setSelectedSystem: (system: System) => void
  setShowWelcome: (show: boolean) => void
  resetWelcome: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedSystem: null,
      showWelcome: true,
      setSelectedSystem: (s) => set({ selectedSystem: s, showWelcome: false }),
      setShowWelcome: (b) => set({ showWelcome: b }),
      resetWelcome: () => set({ showWelcome: true, selectedSystem: null }),
    }),
    { name: 'inventory-storage' }
  )
)
