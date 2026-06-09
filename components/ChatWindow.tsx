"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { useCryptoStore } from "@/store/useCryptoStore";
import {
  apiGetHistory,
  apiGetBundle,
  apiGetProfile,
  apiDeleteHistory,
  apiSearchContacts,
  apiBlock,
  apiUnblock,
  apiUploadProfilePic,
} from "@/lib/api";
import {
  eciesEncrypt,
  eciesDecrypt,
  generateExtractableECDHKeyPair,
  exportKeyToBase64,
  bytesToBase64,
  base64ToBytes,
} from "@/lib/crypto";
import { loadFromIDB } from "@/lib/idb";
import {
  invokeGetEphemeralKeys,
  invokeSendMessage,
  invokeAddReaction,
  invokeDeleteMessage,
  invokeMarkRead,
} from "@/lib/signalr";
import { useSignalREvents } from "@/hooks/useSignalREvents";
import styles from "./ChatWindow.module.css";
import InboxList from "./InboxList";
import ChatSidebar from "./chat/ChatSidebar";
import ChatHeader from "./chat/ChatHeader";
import ChatMessageList, { Message } from "./chat/ChatMessageList";
import ChatInput from "./chat/ChatInput";
import CallModal from "./chat/CallModal";

const BLANK_PIC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export default function ChatWindow() {
  const { auth, blocked, setBlocked, sysLogs, addSysLog } = useAuthStore();
  const {
    activeChat,
    setActiveChat,
    messages: msgStore,
    setMessages: setMsgStore,
    activeReplyId,
    setActiveReplyId,
    refreshInboxRef,
    refreshHistoryRef,
    setRefreshHistoryRef,
  } = useChatStore();
  const {
    bundleCache,
    setBundleCache,
    ephemeralPrivateKey,
    ephemeralPublicKey,
    setEphemeralPrivateKey,
    setEphemeralPublicKey,
  } = useCryptoStore();

  const [msgList, setMsgList] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [presence, setPresence] = useState<{ isOnline: boolean; lastSeen?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ nickname: string; profilePictureBase64?: string }[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [reactionMenu, setReactionMenu] = useState<{ msgId: string } | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);

  const [myProfilePic, setMyProfilePic] = useState<string | null>(null);
  const [activeChatProfilePic, setActiveChatProfilePic] = useState<string | null>(null);

  const [callState, setCallState] = useState<"idle" | "calling" | "in-call">("idle");
  const [callPeer, setCallPeer] = useState("");
  const [incomingCall, setIncomingCall] = useState<{ from: string; offer: RTCSessionDescriptionInit } | null>(null);
  const [muted, setMuted] = useState(false);

  const logsRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iceServers =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? { iceServers: [] }
      : {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
          ],
        };

  async function decryptPayload(
    payloadStr: string,
    privKeyBase64: string
  ): Promise<string | null> {
    const parts = payloadStr.split("||");
    if (parts.length !== 2) return null;
    try {
      const msgAesKeyBase64 = await eciesDecrypt(privKeyBase64, parts[0]);
      if (!msgAesKeyBase64) return null;
      const msgAesKey = base64ToBytes(msgAesKeyBase64);
      const combined = base64ToBytes(parts[1]);
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const importedKey = await crypto.subtle.importKey("raw", msgAesKey as unknown as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
      const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, importedKey, data as unknown as BufferSource);
      return new TextDecoder().decode(dec);
    } catch {
      return null;
    }
  }

  const loadHistory = useCallback(async () => {
    if (!auth || !activeChat) return;
    try {
      const spkPriv = await loadFromIDB<string>(`spk_priv_${auth.email}`);
      if (!spkPriv) return;
      const history = await apiGetHistory(auth.token, activeChat);
      const profile = await apiGetProfile(auth.token, activeChat);
      if (profile && profile.profilePictureBase64 && !blocked.includes(activeChat) && !profile.hasBlockedYou) {
        setActiveChatProfilePic(profile.profilePictureBase64);
      } else {
        setActiveChatProfilePic(null);
      }
      if (profile) {
        setHasBlockedMe(profile.hasBlockedYou === true);
      }
      const newStore: Record<string, string> = {};
      const rendered: Message[] = [];

      for (const msg of history) {
        if (msg.isDeleted) {
          rendered.push({ id: msg.id, sender: msg.senderNickname, text: "", timestamp: msg.timestamp, reactions: {}, replyToId: msg.replyToMessageId, isDeleted: true, isRead: msg.isRead });
          continue;
        }

        let payloadStr: string | null = null;
        if (msg.senderNickname === auth.nickname) {
          payloadStr = msg.senderEncryptedPayload ? (msg.commonEncryptedPayload ? `${msg.senderEncryptedPayload}||${msg.commonEncryptedPayload}` : msg.senderEncryptedPayload) : null;
        } else {
          payloadStr = msg.receiverEncryptedPayloads?.["STATIC"] ? (msg.commonEncryptedPayload ? `${msg.receiverEncryptedPayloads["STATIC"]}||${msg.commonEncryptedPayload}` : msg.receiverEncryptedPayloads["STATIC"]) : null;
        }

        if (!payloadStr) {
          addSysLog("[ŞİFRELİ GEÇMİŞ] Mesaj çözülemedi", true);
          continue;
        }

        const text = await decryptPayload(payloadStr, spkPriv);
        if (!text) {
          addSysLog("[ŞİFRELİ GEÇMİŞ] Mesaj çözülemedi", true);
          continue;
        }
        if (text.startsWith("[WEBRTC_")) continue;
        newStore[msg.id] = text;
        rendered.push({ id: msg.id, sender: msg.senderNickname, text, timestamp: msg.timestamp, reactions: msg.reactions || {}, replyToId: msg.replyToMessageId, isDeleted: false, isRead: msg.isRead });
      }

      setMsgStore((prev) => ({ ...prev, ...newStore }));
      setMsgList(rendered);
      await invokeMarkRead(activeChat);
      refreshInboxRef?.();
      if (profile) setPresence({ isOnline: profile.isOnline, lastSeen: profile.lastSeen });
    } catch (e) {
      console.error(e);
    }
  }, [auth, activeChat]);

  useEffect(() => {
    setRefreshHistoryRef(loadHistory);
  }, [loadHistory, setRefreshHistoryRef]);

  useEffect(() => {
    if (!auth || !activeChat) return;
    loadHistory();
  }, [auth, activeChat, loadHistory]);

  useEffect(() => {
    if (!auth) return;
    const init = async () => {
      const ephPair = await generateExtractableECDHKeyPair();
      const ephPub = await exportKeyToBase64(ephPair.publicKey);
      const ephPriv = await exportKeyToBase64(ephPair.privateKey, "pkcs8");
      setEphemeralPublicKey(ephPub);
      setEphemeralPrivateKey(ephPriv);

      apiGetProfile(auth.token, auth.nickname).then(p => {
        if (p && p.profilePictureBase64) setMyProfilePic(p.profilePictureBase64);
      });
    };
    init();
  }, [auth]);

  useSignalREvents(loadHistory, setIncomingCall, handleWebRTC, setPresence as any, setMsgList);

  async function getBundle(target: string) {
    if (bundleCache[target]) return bundleCache[target];
    if (!auth) return null;
    const b = await apiGetBundle(auth.token, target);
    if (b) setBundleCache((prev) => ({ ...prev, [target]: b }));
    return b;
  }

  async function processAndSendMessage(payloadText: string) {
    if (!auth || !activeChat) return;
    if (blocked.includes(activeChat)) { alert("Bu kullanıcıyı engellediniz."); return; }

    try {
      const targetBundle = await getBundle(activeChat);
      if (!targetBundle?.signedPreKeyPublic) return alert(`Alıcı (${activeChat}) bulunamadı!`);

      const activeDevices = await invokeGetEphemeralKeys(activeChat);

      const msgAesKey = crypto.getRandomValues(new Uint8Array(32));
      const msgAesKeyBase64 = bytesToBase64(msgAesKey);

      const msgIv = crypto.getRandomValues(new Uint8Array(12));
      const importedKey = await crypto.subtle.importKey("raw", msgAesKey, { name: "AES-GCM" }, false, ["encrypt"]);
      const encryptedPayloadBytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv: msgIv }, importedKey, new TextEncoder().encode(payloadText));
      const payloadBytes = new Uint8Array(msgIv.length + encryptedPayloadBytes.byteLength);
      payloadBytes.set(msgIv, 0);
      payloadBytes.set(new Uint8Array(encryptedPayloadBytes), msgIv.length);
      const encryptedPayload = bytesToBase64(payloadBytes);

      const ephemeralSymKeys: Record<string, string> = {};
      const staticEnc = await eciesEncrypt(targetBundle.signedPreKeyPublic, msgAesKeyBase64);
      ephemeralSymKeys["STATIC"] = staticEnc;

      if (activeDevices) {
        for (const [deviceId, ephemeralKey] of Object.entries(activeDevices)) {
          const devEnc = await eciesEncrypt(ephemeralKey, msgAesKeyBase64);
          ephemeralSymKeys[deviceId] = devEnc;
        }
      }

      const spkPriv = await loadFromIDB<string>(`spk_priv_${auth.email}`);
      if (!spkPriv) return alert("Kendi anahtarlarınız eksik.");
      const myBundle = await getBundle(auth.nickname);
      if (!myBundle?.signedPreKeyPublic) return alert("Kendi anahtarlarınız sunucuda bulunamadı.");

      const senderEnc = await eciesEncrypt(myBundle.signedPreKeyPublic, msgAesKeyBase64);
      const senderSymKey = senderEnc;

      const signature = "dummy-signature-for-poc";
      const msgId = await invokeSendMessage(activeChat, senderSymKey, ephemeralSymKeys, encryptedPayload, signature, activeReplyId);

      setMsgStore((prev) => ({ ...prev, [msgId]: payloadText }));
      setMsgList((prev) => [...prev, { id: msgId, sender: auth.nickname, text: payloadText, timestamp: new Date().toISOString(), reactions: {}, replyToId: activeReplyId ?? undefined, isDeleted: false, isRead: false }]);
      setActiveReplyId(null);
      refreshInboxRef?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      addSysLog(`❌ HATA: ${message}`, true);
      alert("Mesaj gönderilemedi: " + message);
    }
  }

  async function sendMessage() {
    const msg = inputText.trim();
    if (!msg) return;
    await processAndSendMessage(msg);
    setInputText("");
  }

  async function sendImage(file: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (file.type === "image/gif") {
        await processAndSendMessage(`[IMAGE]${e.target?.result}`);
        return;
      }
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const MAX = 1600;
        if (width > height && width > MAX) { height *= MAX / width; width = MAX; }
        else if (height > MAX) { width *= MAX / height; height = MAX; }
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        await processAndSendMessage(`[IMAGE]${canvas.toDataURL("image/jpeg", 0.9)}`);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function toggleRecording() {
    if (!isRecording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => { alert("Mikrofon izni alınamadı"); return null; });
      if (!stream) return;
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = async () => { await processAndSendMessage(`[AUDIO]${reader.result}`); };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } else {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
  }

  async function sendReaction(msgId: string, emoji: string) {
    if (blocked.includes(activeChat)) return alert("Engellediğiniz kişiye tepki veremezsiniz.");
    await invokeAddReaction(msgId, emoji).catch((e) => addSysLog(`❌ İfade Hatası: ${e.message}`, true));
    setReactionMenu(null);
    await loadHistory();
  }

  async function handleDeleteMessage(msgId: string) {
    if (!confirm("Bu mesajı herkes için silmek istiyor musunuz?")) return;
    await invokeDeleteMessage(msgId);
    await loadHistory();
  }

  async function handleToggleBlock() {
    if (!auth) return;
    const isBlocked = blocked.includes(activeChat);
    if (isBlocked) {
      const res = await apiUnblock(auth.token, activeChat);
      if (res) setBlocked(blocked.filter((b) => b !== activeChat));
    } else {
      const res = await apiBlock(auth.token, activeChat);
      if (res) setBlocked([...blocked, activeChat]);
    }
  }

  async function handleClearHistory() {
    if (!auth || !activeChat) return;
    if (!confirm(`${activeChat} ile olan sohbeti silmek istiyor musunuz?`)) return;
    const res = await apiDeleteHistory(auth.token, activeChat);
    if (res) { setMsgList([]); setMsgStore({}); setActiveChat(""); refreshInboxRef?.(); }
  }

  async function handleVerifySecurityCode() {
    if (!auth) return;
    const targetBundle = await getBundle(activeChat);
    const myBundle = await getBundle(auth.nickname);
    if (!targetBundle?.identityPublicKey || !myBundle?.identityPublicKey) return alert("Public key bulunamadı!");
    const keys = [targetBundle.identityPublicKey, myBundle.identityPublicKey].sort();
    const encoded = new TextEncoder().encode(keys[0] + keys[1]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const fingerprint = hashHex.match(/.{1,5}/g)!.join("-");
    alert(`🔒 GÜVENLİK KODU (${activeChat} ile):\n\n${fingerprint}\n\nBu kodu karşı tarafla karşılaştırın. Eşleşiyorsa bağlantı güvenlidir.`);
  }

  function handleSearchInput(query: string) {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query) { setShowSearch(false); return; }
    searchTimerRef.current = setTimeout(async () => {
      if (!auth) return;
      const results = await apiSearchContacts(auth.token, query);
      setSearchResults(results);
      setShowSearch(true);
    }, 300);
  }

  async function startChatWith(nickname: string) {
              setSearchQuery(""); setShowSearch(false); setActiveChat(nickname);
  }

  async function handleShowSessions() {
    if (!auth) return;
    const s = await import("@/lib/api").then(m => m.apiGetSessions(auth.token));
    setSessions(s);
    setShowSessionsModal(true);
  }

  function handleShowBlocked() {
    setShowBlockedModal(true);
  }

  async function handleUnblockFromModal(nickname: string) {
    if (!auth) return;
    const { apiUnblock } = await import("@/lib/api");
    const res = await apiUnblock(auth.token, nickname);
    if (res) {
      setBlocked(blocked.filter(b => b !== nickname));
    }
  }

  async function handleUploadPic(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const r = await apiUploadProfilePic(auth!.token, base64);
      if (r) {
        alert("Profil resmi güncellendi!");
        setMyProfilePic(base64);
      }
    };
    reader.readAsDataURL(file);
  }

  async function initPeerConnection(targetNick: string) {
    if (pcRef.current) pcRef.current.close();
    pcRef.current = new RTCPeerConnection(iceServers);
    iceQueueRef.current = [];

    pcRef.current.onicecandidate = async (e) => {
      if (e.candidate) {
        addSysLog("📤 ICE adresi gönderiliyor");
        await processAndSendMessage(`[WEBRTC_ICE]${JSON.stringify(e.candidate)}`);
      }
    };
    pcRef.current.onconnectionstatechange = () => {
      addSysLog(`⚡ WebRTC: ${pcRef.current?.connectionState}`);
      if (pcRef.current?.connectionState === "connected") {
        addSysLog("🟢 Bağlantı Kuruldu!");
        remoteAudioRef.current?.play().catch(console.error);
      }
    };
    pcRef.current.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams?.[0] ?? new MediaStream([e.track]);
        remoteAudioRef.current.play().catch(console.error);
      }
    };
    localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current.getTracks().forEach((t) => pcRef.current!.addTrack(t, localStreamRef.current!));
  }

  async function startCall() {
    if (!activeChat) return alert("Önce sohbet seçin.");
    if (blocked.includes(activeChat)) return alert("Engellediğiniz kişiyi arayamazsınız.");
    setCallState("calling"); setCallPeer(activeChat);
    await initPeerConnection(activeChat);
    const offer = await pcRef.current!.createOffer();
    await pcRef.current!.setLocalDescription(offer);
    await processAndSendMessage(`[WEBRTC_OFFER]${JSON.stringify({ type: offer.type, sdp: offer.sdp })}`);
    addSysLog(`📞 ${activeChat} aranıyor...`);
  }

  async function answerCall() {
    if (!incomingCall) return;
    setIncomingCall(null);
    setCallState("in-call"); setCallPeer(incomingCall.from);
    await initPeerConnection(incomingCall.from);
    await pcRef.current!.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
    const answer = await pcRef.current!.createAnswer();
    await pcRef.current!.setLocalDescription(answer);
    await processAndSendMessage(`[WEBRTC_ANSWER]${JSON.stringify({ type: answer.type, sdp: answer.sdp })}`);
    for (const cand of iceQueueRef.current) {
      await pcRef.current!.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    }
    iceQueueRef.current = [];
    addSysLog(`📞 ${incomingCall.from} ile çağrı başladı.`);
  }

  function rejectCall() { setIncomingCall(null); iceQueueRef.current = []; }

  function endCall() {
    pcRef.current?.close(); pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop()); localStreamRef.current = null;
    setCallState("idle"); setCallPeer("");
    addSysLog("📞 Çağrı sonlandırıldı.");
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMuted(!track.enabled); }
  }

  async function handleWebRTC(from: string, payload: string) {
    if (payload.startsWith("[WEBRTC_OFFER]")) {
      const offer = JSON.parse(payload.replace("[WEBRTC_OFFER]", "")) as RTCSessionDescriptionInit;
      setIncomingCall({ from, offer });
      addSysLog(`📞 ${from} arıyor...`);
    } else if (payload.startsWith("[WEBRTC_ANSWER]")) {
      const answer = JSON.parse(payload.replace("[WEBRTC_ANSWER]", "")) as RTCSessionDescriptionInit;
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState("in-call");
        for (const cand of iceQueueRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        iceQueueRef.current = [];
      }
    } else if (payload.startsWith("[WEBRTC_ICE]")) {
      const cand = JSON.parse(payload.replace("[WEBRTC_ICE]", "")) as RTCIceCandidateInit;
      if (pcRef.current?.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      } else {
        iceQueueRef.current.push(cand);
      }
    }
  }

  function renderMessageContent(text: string) {
    if (text.startsWith("[IMAGE]")) {
      const src = text.replace("[IMAGE]", "");
      return <img src={src} className={styles.msgImg} onClick={() => setShowImageModal(src)} alt="img" />;
    }
    if (text.startsWith("[AUDIO]")) {
      const src = text.replace("[AUDIO]", "");
      return <audio controls src={src} className={styles.msgAudio} />;
    }
    return <span>{text}</span>;
  }

  const presenceText = presence
    ? presence.isOnline
      ? "🟢 Çevrimiçi"
      : `Son görülme: ${presence.lastSeen ? new Date(presence.lastSeen).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "Bilinmiyor"}`
    : "";

  const isBlocked = blocked.includes(activeChat);

  return (
    <div className={styles.layout}>
      <ChatSidebar 
        searchQuery={searchQuery}
        handleSearchInput={handleSearchInput}
        showSearch={showSearch}
        setShowSearch={setShowSearch}
        searchResults={searchResults}
        startChatWith={startChatWith}
        handleShowSessions={handleShowSessions}
        handleShowBlocked={handleShowBlocked}
        handleUploadPic={handleUploadPic}
        myProfilePic={myProfilePic}
      />

      <main className={styles.chatArea}>
        {!activeChat ? (
          <div className={styles.noChat}>
            <span className={styles.noChatIcon}>💬</span>
            <p>Bir sohbet seçin veya kişi arayın</p>
          </div>
        ) : (
          <>
            <ChatHeader 
              presenceText={presenceText}
              isBlocked={isBlocked}
              startCall={startCall}
              handleToggleBlock={handleToggleBlock}
              handleVerifySecurityCode={handleVerifySecurityCode}
              handleClearHistory={handleClearHistory}
              activeChatProfilePic={activeChatProfilePic}
            />

            <ChatMessageList 
              ref={logsRef}
              msgList={msgList}
              reactionMenu={reactionMenu}
              setReactionMenu={setReactionMenu}
              renderMessageContent={renderMessageContent}
              sendReaction={sendReaction}
              handleDeleteMessage={handleDeleteMessage}
            />
            {blocked.includes(activeChat) && (
              <div className={styles.blockedOverlay}>
                <p>Bu kullanıcıyı engellediniz. Mesajlaşmaya devam etmek için engeli kaldırın.</p>
                <button className={styles.unblockBtnLarge} onClick={handleToggleBlock}>Engeli Kaldır</button>
              </div>
            )}
            {!blocked.includes(activeChat) && hasBlockedMe && (
              <div className={styles.blockedOverlay}>
                <p>Bu kullanıcı sizi engelledi.</p>
              </div>
            )}

            <ChatInput 
              isBlocked={isBlocked}
              inputText={inputText}
              setInputText={setInputText}
              sendMessage={sendMessage}
              sendImage={sendImage}
              isRecording={isRecording}
              toggleRecording={toggleRecording}
            />
          </>
        )}
      </main>

      {showImageModal && (
        <div className={styles.imageModal} onClick={() => setShowImageModal(null)}>
          <img src={showImageModal} alt="enlarged" />
        </div>
      )}

      <CallModal 
        ref={remoteAudioRef}
        incomingCall={incomingCall}
        callState={callState}
        callPeer={callPeer}
        muted={muted}
        answerCall={answerCall}
        rejectCall={rejectCall}
        endCall={endCall}
        toggleMute={toggleMute}
      />

      {showSessionsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSessionsModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Cihaz Kayıtlarım</h3>
            {(sessions as {ipAddress: string; deviceName: string; lastActiveAt: string}[]).length === 0 ? (
              <p className={styles.modalEmpty}>Kayıt bulunamadı.</p>
            ) : (
              [...(sessions as {ipAddress: string; deviceName: string; lastActiveAt: string}[])].reverse().map((s, i) => (
                <div key={i} className={styles.sessionItem}>
                  <p><strong>IP:</strong> {s.ipAddress}</p>
                  <p><strong>Cihaz:</strong> {s.deviceName}</p>
                  <p><strong>Son:</strong> {new Date(s.lastActiveAt).toLocaleString()}</p>
                </div>
              ))
            )}
            <button className={styles.modalClose} onClick={() => setShowSessionsModal(false)}>Kapat</button>
          </div>
        </div>
      )}

      {showBlockedModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>🚫 Engellenen Kullanıcılar</h3>
            {blocked.length === 0 ? (
              <p className={styles.modalEmpty}>Engellediğiniz kimse yok.</p>
            ) : (
              blocked.map((nick, i) => (
                <div key={i} className={styles.blockedItem}>
                  <span>{nick}</span>
                  <button className={styles.unblockSmall} onClick={() => handleUnblockFromModal(nick)}>Engeli Kaldır</button>
                </div>
              ))
            )}
            <button className={styles.modalClose} onClick={() => setShowBlockedModal(false)}>Kapat</button>
          </div>
        </div>
      )}
    </div>
  );
}
