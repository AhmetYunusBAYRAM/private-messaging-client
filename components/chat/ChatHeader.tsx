import React from "react";
import styles from "../ChatWindow.module.css";
import { useChatStore } from "@/store/useChatStore";

const BLANK_PIC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

interface Props {
  presenceText: string;
  isBlocked: boolean;
  startCall: () => void;
  handleToggleBlock: () => void;
  handleVerifySecurityCode: () => void;
  handleClearHistory: () => void;
  activeChatProfilePic: string | null;
}

export default function ChatHeader({
  presenceText,
  isBlocked,
  startCall,
  handleToggleBlock,
  handleVerifySecurityCode,
  handleClearHistory,
  activeChatProfilePic
}: Props) {
  const { activeChat } = useChatStore();

  if (!activeChat) return null;

  return (
    <div className={styles.chatHeader}>
      <div className={styles.chatHeaderLeft}>
        <img src={activeChatProfilePic || BLANK_PIC} alt={activeChat} className={styles.chatAvatar} />
        <div>
          <p className={styles.chatName}>{activeChat}</p>
          <p className={styles.presence}>{presenceText}</p>
        </div>
      </div>
      <div className={styles.chatHeaderActions}>
        <button id="btn-call" className={styles.iconBtn} onClick={startCall} title="Sesli Ara">📞</button>
        <button
          id="btn-block"
          className={`${styles.iconBtn} ${isBlocked ? styles.unblockBtn : styles.blockBtn}`}
          onClick={handleToggleBlock}
        >
          {isBlocked ? "Engeli Kaldır" : "Engelle"}
        </button>
        <button id="btn-security" className={styles.iconBtn} onClick={handleVerifySecurityCode} title="Güvenlik Kodu">🔒</button>
        <button id="btn-clear" className={`${styles.iconBtn} ${styles.dangerBtn}`} onClick={handleClearHistory} title="Sohbeti Sil">🗑️</button>
      </div>
    </div>
  );
}
