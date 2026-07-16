import { create } from 'zustand'

/**
 * Rest-Store neben stores/paper.ts: nur noch die zwei Overlays, die nicht am
 * Papier-Layout hängen. Alles Weitere (View, Selektion, Suche, Composer)
 * wohnt in usePaper — hier nichts neu anbauen.
 */
interface UiState {
  overrideMenuOpen: boolean
  setOverrideMenuOpen: (open: boolean) => void

  addAccountOpen: boolean
  setAddAccountOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  overrideMenuOpen: false,
  setOverrideMenuOpen: (open) => set({ overrideMenuOpen: open }),

  addAccountOpen: false,
  setAddAccountOpen: (open) => set({ addAccountOpen: open })
}))
