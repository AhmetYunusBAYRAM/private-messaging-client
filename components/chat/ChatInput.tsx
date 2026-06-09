import React from "react";
import styles from "../ChatWindow.module.css";

interface Props {
  isBlocked: boolean;
  inputText: string;
  setInputText: (val: string) => void;
  sendMessage: () => void;
  sendImage: (file: File) => void;
  isRecording: boolean;
  toggleRecording: () => void;
}

export default function ChatInput({
  isBlocked,
  inputText,
  setInputText,
  sendMessage,
  sendImage,
  isRecording,
  toggleRecording
}: Props) {
  return (
    <div className={styles.inputRow}>
      <label htmlFor="img-upload" className={styles.attachBtn} title="Resim ekle">📎
        <input id="img-upload" type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && sendImage(e.target.files[0])} />
      </label>
      <button
        id="btn-mic"
        className={`${styles.micBtn} ${isRecording ? styles.micRecording : ""}`}
        onClick={toggleRecording}
        title="Sesli mesaj"
      >
        {isRecording ? "⏹️" : "🎙️"}
      </button>
      <input
        id="msg-input"
        className={styles.msgInput}
        placeholder={isBlocked ? "Engellendi" : "Gizli mesajınız..."}
        value={inputText}
        disabled={isBlocked}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
      />
      <button id="btn-send" className={styles.sendBtn} onClick={sendMessage} disabled={isBlocked}>Gönder</button>
    </div>
  );
}
