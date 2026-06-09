import React, { forwardRef } from "react";
import styles from "../ChatWindow.module.css";

interface Props {
  incomingCall: { from: string; offer: RTCSessionDescriptionInit } | null;
  callState: "idle" | "calling" | "in-call";
  callPeer: string;
  muted: boolean;
  answerCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
}

const CallModal = forwardRef<HTMLAudioElement, Props>(({
  incomingCall,
  callState,
  callPeer,
  muted,
  answerCall,
  rejectCall,
  endCall,
  toggleMute
}, ref) => {
  return (
    <>
      {incomingCall && (
        <div className={styles.incomingCall}>
          <p>📞 {incomingCall.from} arıyor...</p>
          <div className={styles.callButtons}>
            <button id="btn-answer" onClick={answerCall} className={styles.answerBtn}>Cevapla</button>
            <button id="btn-reject" onClick={rejectCall} className={styles.rejectBtn}>Reddet</button>
          </div>
        </div>
      )}

      {callState !== "idle" && (
        <div className={styles.callModal}>
          <p>{callState === "calling" ? `Aranıyor: ${callPeer}...` : `Konuşuluyor: ${callPeer}`}</p>
          <audio ref={ref} autoPlay controls className={styles.remoteAudio} />
          <div className={styles.callButtons}>
            <button onClick={toggleMute} className={styles.muteBtn}>{muted ? "🔊 Sesi Aç" : "🔇 Sustur"}</button>
            <button onClick={endCall} className={styles.rejectBtn}>Kapat</button>
          </div>
        </div>
      )}
    </>
  );
});

CallModal.displayName = "CallModal";
export default CallModal;
