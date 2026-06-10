"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { apiGetInbox } from "@/lib/api";
import { eciesDecrypt } from "@/lib/crypto";
import { loadFromIDB } from "@/lib/idb";
import styles from "./InboxList.module.css";

interface InboxEntry {
  contactNickname: string;
  profilePictureBase64?: string;
  unreadCount: number;
  snippet: string;
}

const BLANK_PIC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export default function InboxList() {
  const { auth } = useAuthStore();
  const { activeChat, setActiveChat, refreshInboxRef } = useChatStore();
  const [inbox, setInbox] = useState<InboxEntry[]>([]);

  async function decryptSnippet(msg: {
    senderNickname: string;
    receiverNickname: string;
    senderEncryptedPayload: string;
    receiverEncryptedPayloads: Record<string, string>;
    isDeleted: boolean;
  } | undefined | null, nickname: string, email: string): Promise<string> {
    if (!msg) return "[Mesaj Yok]";
    if (msg.isDeleted) return "🚫 Bu mesaj silindi.";
    let payloadStr: string | null = null;
    if (msg.senderNickname === nickname) {
      payloadStr = msg.senderEncryptedPayload ? ((msg as any).commonEncryptedPayload ? `${msg.senderEncryptedPayload}||${(msg as any).commonEncryptedPayload}` : msg.senderEncryptedPayload) : null;
    } else if (msg.receiverNickname === nickname) {
      payloadStr = msg.receiverEncryptedPayloads?.["STATIC"] ? ((msg as any).commonEncryptedPayload ? `${msg.receiverEncryptedPayloads["STATIC"]}||${(msg as any).commonEncryptedPayload}` : msg.receiverEncryptedPayloads["STATIC"]) : null;
    }
    if (!payloadStr) return "[Şifreli Mesaj]";
    try {
      const spkPriv = await loadFromIDB<string>(`spk_priv_${email}`);
      if (!spkPriv) return "[Şifreli Mesaj]";

      const parts = payloadStr.split("||");
      if (parts.length !== 2) return "[Şifreli Mesaj]";
      const msgAesKeyBase64 = await eciesDecrypt(spkPriv, parts[0]);
      if (!msgAesKeyBase64) return "[Şifreli Mesaj]";

      const { base64ToBytes } = await import("@/lib/crypto");
      const msgAesKey = base64ToBytes(msgAesKeyBase64);
      const combined = base64ToBytes(parts[1]);
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const importedKey = await crypto.subtle.importKey("raw", msgAesKey as unknown as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, importedKey, data as unknown as BufferSource);
      const text = new TextDecoder().decode(decrypted);
      if (text.startsWith("[IMAGE]")) return "📷 Fotoğraf";
      if (text.startsWith("[AUDIO]")) return "🎤 Sesli Mesaj";
      if (text.startsWith("[WEBRTC_")) return "📞 Sesli Çağrı";
      return text.length > 40 ? text.substring(0, 40) + "..." : text;
    } catch {
      return "[Şifreli Mesaj]";
    }
  }

  async function load() {
    if (!auth) return;
    const data = await apiGetInbox(auth.token);
    const entries: InboxEntry[] = [];
    for (const item of data) {
      const snippet = await decryptSnippet(item.lastMessage, auth.nickname, auth.email);
      entries.push({
        contactNickname: item.contactNickname,
        profilePictureBase64: item.profilePictureBase64,
        unreadCount: item.unreadCount,
        snippet,
      });
    }
    setInbox(entries);
  }

  useEffect(() => {
    const { setRefreshInboxRef } = useChatStore.getState();
    setRefreshInboxRef(load);
    load();
  }, [auth]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span>Sohbetler</span>
        <button className={styles.refreshBtn} id="inbox-refresh" onClick={load} title="Yenile">↻</button>
      </div>
      <div className={styles.list}>
        {inbox.length === 0 && <p className={styles.empty}>Henüz sohbet yok.</p>}
        {inbox.map((item) => (
          <div
            key={item.contactNickname}
            id={`inbox-item-${item.contactNickname}`}
            className={`${styles.item} ${activeChat === item.contactNickname ? styles.active : ""}`}
            onClick={() => setActiveChat(item.contactNickname)}
          >
            <img
              className={styles.avatar}
              src={item.profilePictureBase64 || BLANK_PIC}
              alt={item.contactNickname}
            />
            <div className={styles.details}>
              <span className={styles.name}>
                {item.contactNickname}
                {item.unreadCount > 0 && activeChat !== item.contactNickname && (
                  <span className={styles.badge}>{item.unreadCount}</span>
                )}
              </span>
              <span className={styles.snippet}>{item.snippet}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
