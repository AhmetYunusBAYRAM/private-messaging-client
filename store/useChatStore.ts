import { create } from 'zustand';

interface ChatStore {
  activeChat: string;
  setActiveChat: (nick: string) => void;
  messages: Record<string, string>;
  setMessages: (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  activeReplyId: string | null;
  setActiveReplyId: (id: string | null) => void;
  refreshInboxRef: (() => void) | null;
  setRefreshInboxRef: (ref: (() => void) | null) => void;
  refreshHistoryRef: (() => void) | null;
  setRefreshHistoryRef: (ref: (() => void) | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  activeChat: "",
  setActiveChat: (nick) => set({ activeChat: nick }),
  messages: {},
  setMessages: (updater) => set((state) => ({
    messages: typeof updater === "function" ? updater(state.messages) : updater
  })),
  activeReplyId: null,
  setActiveReplyId: (id) => set({ activeReplyId: id }),
  refreshInboxRef: null,
  setRefreshInboxRef: (ref) => set({ refreshInboxRef: ref }),
  refreshHistoryRef: null,
  setRefreshHistoryRef: (ref) => set({ refreshHistoryRef: ref }),
}));
