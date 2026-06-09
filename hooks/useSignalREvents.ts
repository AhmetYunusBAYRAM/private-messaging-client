import { useEffect, useRef } from "react";
import { startConnection, stopConnection, invokeMarkRead } from "@/lib/signalr";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { useCryptoStore } from "@/store/useCryptoStore";
import { eciesDecrypt } from "@/lib/crypto";

export function useSignalREvents(
  loadHistory: () => Promise<void>,
  setIncomingCall: (call: { from: string; offer: any }) => void,
  handleWebRTC: (from: string, payload: string) => void,
  setPresence: (presence: { isOnline: boolean; lastSeen?: string }) => void,
  setMsgList: (updater: (prev: any[]) => any[]) => void
) {
  const { auth, blocked } = useAuthStore();
  const { activeChat, setMessages, refreshInboxRef } = useChatStore();
  const { ephemeralPrivateKey, ephemeralPublicKey } = useCryptoStore();

  const activeChatRef = useRef(activeChat);
  const loadHistoryRef = useRef(loadHistory);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { loadHistoryRef.current = loadHistory; }, [loadHistory]);

  useEffect(() => {
    if (!auth || !ephemeralPublicKey || !ephemeralPrivateKey) return;

    startConnection(auth.token, ephemeralPublicKey, auth.deviceId, {
      onMessage: async (msgId, from, payloadBase64, signature, replyToId) => {
        if (blocked.includes(from)) return;
        try {
          const parts = payloadBase64.split("||");
          if (parts.length !== 2) return;
          
          const msgAesKeyBase64 = await eciesDecrypt(ephemeralPrivateKey, parts[0]);
          if (!msgAesKeyBase64) return;
          
          const msgAesKey = await import("@/lib/crypto").then(m => m.base64ToBytes(msgAesKeyBase64));
          const combined = await import("@/lib/crypto").then(m => m.base64ToBytes(parts[1]));
          const iv = combined.slice(0, 12);
          const data = combined.slice(12);
          const importedKey = await crypto.subtle.importKey("raw", msgAesKey as unknown as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
          const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, importedKey, data as unknown as BufferSource);
          const text = new TextDecoder().decode(decrypted);

          if (text.startsWith("[WEBRTC_")) {
            handleWebRTC(from, text);
            return;
          }

          setMessages((prev) => ({ ...prev, [msgId]: text }));

          if (from === activeChatRef.current || from === auth.nickname) {
            setMsgList((prev) => [...prev, { id: msgId, sender: from, text, timestamp: new Date().toISOString(), reactions: {}, replyToId: replyToId ?? undefined, isDeleted: false, isRead: false }]);
          }

          if (from === activeChatRef.current) {
            loadHistoryRef.current();
            invokeMarkRead(from).then(() => refreshInboxRef?.());
          } else {
            refreshInboxRef?.();
          }
        } catch { }
      },
      onReaction: () => loadHistoryRef.current(),
      onDeleted: () => { loadHistoryRef.current(); refreshInboxRef?.(); },
      onRead: () => loadHistoryRef.current(),
      onPresence: (nick, isOnline, lastSeen) => {
        if (nick === activeChatRef.current) setPresence({ isOnline, lastSeen: lastSeen ?? undefined });
      },
      onWebRTC: () => {}
    });

    return () => { stopConnection(); };
  }, [auth, ephemeralPublicKey, ephemeralPrivateKey, blocked]);
}
