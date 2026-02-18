import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      rpcUrl: '',
      setRpcUrl: (url: string) => set({ rpcUrl: url }),
    }),
    { name: 'trenchable-settings' }
  )
);
