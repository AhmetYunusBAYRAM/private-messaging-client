import React, { forwardRef, useState } from "react";
import styles from "../ChatWindow.module.css";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  reactions: Record<string, string>;
  replyToId?: string;
  isDeleted: boolean;
  isRead: boolean;
}

interface Props {
  msgList: Message[];
  reactionMenu: { msgId: string } | null;
  setReactionMenu: (val: { msgId: string } | null) => void;
  renderMessageContent: (text: string) => React.ReactNode;
  sendReaction: (msgId: string, emoji: string) => void;
  handleDeleteMessage: (msgId: string) => void;
}

const ChatMessageList = forwardRef<HTMLDivElement, Props>(({
  msgList,
  reactionMenu,
  setReactionMenu,
  renderMessageContent,
  sendReaction,
  handleDeleteMessage
}, ref) => {
  const { auth } = useAuthStore();
  const { messages: msgStore, activeReplyId, setActiveReplyId } = useChatStore();
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent, msgId: string, isDeleted: boolean) => {
    if (touchStart === null || isDeleted) return;
    const touchEnd = e.changedTouches[0].clientX;
    const distance = touchEnd - touchStart;
    if (distance > 50) {
      setActiveReplyId(msgId);
    }
    setTouchStart(null);
  };

  return (
    <>
      <div className={styles.messages} ref={ref}>
        {msgList.map((msg) => {
          const isMe = msg.sender === auth?.nickname;
          const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const emojiCounts: Record<string, number> = {};
          Object.values(msg.reactions).forEach((e) => { emojiCounts[e] = (emojiCounts[e] || 0) + 1; });
          const totalRx = Object.keys(emojiCounts).length;

          const replyText = msg.replyToId ? (msgStore[msg.replyToId] || "Eski mesaj") : null;

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`${styles.msgContainer} ${isMe ? styles.msgOut : styles.msgIn}`}
              onDoubleClick={() => !msg.isDeleted && setActiveReplyId(msg.id)}
              onTouchStart={handleTouchStart}
              onTouchEnd={(e) => handleTouchEnd(e, msg.id, msg.isDeleted)}
            >
              {!msg.isDeleted && (
                <div className={styles.msgActions}>
                  <button className={styles.msgActionBtn} onClick={() => setReactionMenu({ msgId: msg.id })} title="Reaksiyon Ekle">😀</button>
                  <button className={styles.msgActionBtn} onClick={() => setActiveReplyId(msg.id)} title="Cevapla">↩️</button>
                  {isMe && <button className={styles.msgActionBtn} onClick={() => handleDeleteMessage(msg.id)} title="Sil">🗑️</button>}
                </div>
              )}
              {replyText && !msg.isDeleted && (
                <div className={styles.replyQuote} onClick={() => document.getElementById(`msg-${msg.replyToId}`)?.scrollIntoView({ behavior: "smooth" })}>
                  {replyText.startsWith("[IMAGE]") ? "📷 Fotoğraf" : replyText.startsWith("[AUDIO]") ? "🎤 Sesli Mesaj" : replyText.substring(0, 60)}
                </div>
              )}
              <div className={styles.msgBubble} onContextMenu={(e) => { e.preventDefault(); if (!msg.isDeleted) setReactionMenu({ msgId: msg.id }); }}>
                {msg.isDeleted ? (
                  <span className={styles.deletedMsg}>🚫 Bu mesaj gönderen tarafından silindi.</span>
                ) : (
                  renderMessageContent(msg.text)
                )}
                <span className={styles.msgTime}>
                  {timeStr}
                  {isMe && <span className={msg.isRead ? styles.tickRead : styles.tick}>{msg.isRead ? "✓✓" : "✓"}</span>}
                </span>
                {totalRx > 0 && (
                  <span className={styles.reactionBadge}>{Object.keys(emojiCounts).join(" ")} {totalRx > 1 ? totalRx : ""}</span>
                )}
              </div>
              {reactionMenu?.msgId === msg.id && !msg.isDeleted && (
                <div className={styles.reactionMenu}>
                  {["👍", "❤️", "😂", "😮", "😢"].map((e) => (
                    <span key={e} onClick={() => sendReaction(msg.id, e)}>{e}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {activeReplyId && (
        <div className={styles.replyPreview}>
          <div className={styles.replyLabel}>Yanıtlanıyor:</div>
          <div className={styles.replyText}>{(msgStore[activeReplyId] || "").substring(0, 60)}</div>
          <button className={styles.replyClose} onClick={() => setActiveReplyId(null)}>✕</button>
        </div>
      )}
    </>
  );
});

ChatMessageList.displayName = "ChatMessageList";
export default ChatMessageList;
