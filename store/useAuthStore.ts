import { create } from 'zustand';

interface AuthState {
  token: string;
  refreshToken: string;
  nickname: string;
  email: string;
  deviceId: string;
}

interface AuthStore {
  auth: AuthState | null;
  setAuth: (auth: AuthState | null) => void;
  blocked: string[];
  setBlocked: (blocked: string[]) => void;
  sysLogs: { text: string; isError: boolean }[];
  addSysLog: (text: string, isError?: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  auth: null,
  setAuth: (auth) => set({ auth }),
  blocked: [],
  setBlocked: (blocked) => set({ blocked }),
  sysLogs: [],
  addSysLog: (text, isError = false) => set((state) => ({
    sysLogs: [...state.sysLogs.slice(-99), { text, isError }]
  }))
}));
