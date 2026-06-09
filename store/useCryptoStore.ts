import { create } from 'zustand';
import type { KeyBundle } from "@/lib/api";

interface CryptoStore {
  bundleCache: Record<string, KeyBundle>;
  setBundleCache: (updater: Record<string, KeyBundle> | ((prev: Record<string, KeyBundle>) => Record<string, KeyBundle>)) => void;
  ephemeralPrivateKey: string;
  setEphemeralPrivateKey: (key: string) => void;
  ephemeralPublicKey: string;
  setEphemeralPublicKey: (key: string) => void;
}

export const useCryptoStore = create<CryptoStore>((set) => ({
  bundleCache: {},
  setBundleCache: (updater) => set((state) => ({
    bundleCache: typeof updater === "function" ? updater(state.bundleCache) : updater
  })),
  ephemeralPrivateKey: "",
  setEphemeralPrivateKey: (key) => set({ ephemeralPrivateKey: key }),
  ephemeralPublicKey: "",
  setEphemeralPublicKey: (key) => set({ ephemeralPublicKey: key }),
}));
