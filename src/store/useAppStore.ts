import { create } from 'zustand'; import { persist } from 'zustand/middleware';
type S = 'hoz' | 'mwsal' | null;
interface T { selectedSystem: S; showWelcome: boolean; setSelectedSystem: (s: S) => void; setShowWelcome: (b: boolean) => void; resetWelcome: () => void }
export const useAppStore = create<T>()(persist((set) => ({
  selectedSystem: null, showWelcome: true,
  setSelectedSystem: (s) => set({ selectedSystem: s, showWelcome: false }),
  setShowWelcome: (b) => set({ showWelcome: b }),
  resetWelcome: () => set({ showWelcome: true, selectedSystem: null }),
}), { name: 'inventory-storage' }))
