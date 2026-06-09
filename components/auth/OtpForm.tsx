import React, { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useCryptoStore } from "@/store/useCryptoStore";
import { apiVerifyOtp, apiGetBundle } from "@/lib/api";
import {
  generateExtractableECDHKeyPair,
  exportKeyToBase64,
  saveToIDB,
} from "@/lib/crypto";
import { startConnection } from "@/lib/signalr";
import styles from "../AuthForm.module.css";

interface Props {
  email: string;
  loading: boolean;
  setLoading: (val: boolean) => void;
  onBack: () => void;
}

export default function OtpForm({ email, loading, setLoading, onBack }: Props) {
  const { setAuth, setBlocked, addSysLog } = useAuthStore();
  const { setBundleCache, setEphemeralPrivateKey, setEphemeralPublicKey } = useCryptoStore();
  const [otp, setOtp] = useState("");

  async function handleVerifyOtp() {
    if (!email || !otp) return alert("Email ve OTP zorunlu!");
    setLoading(true);
    try {
      let deviceId = localStorage.getItem("deviceId");
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem("deviceId", deviceId);
      }
      const deviceName = navigator.userAgent;

      const res = await apiVerifyOtp(email, otp, deviceId, deviceName);
      if (!res.ok) { alert("Geçersiz OTP!"); setLoading(false); return; }

      const data = await res.json();

      if (!data.encryptedIdentityPrivateKey) {
        alert("Sunucuda anahtar bulunamadı. Lütfen tekrar kayıt olun.");
        setLoading(false);
        return;
      }

      const savedSpkPriv = await import("@/lib/idb").then(m => m.loadFromIDB<string>(`spk_priv_${email}`));
      if (!savedSpkPriv) {
        const pin = prompt("Bu cihazda anahtar bulunamadı. Kurtarma Parolanızı girin:");
        if (pin) {
          try {
            const { decryptWithPin } = await import("@/lib/crypto");
            const decryptedSpkPriv = await decryptWithPin(pin, data.encryptedSignedPrePrivateKey, email);
            await saveToIDB(`spk_priv_${email}`, decryptedSpkPriv);
            addSysLog("✅ Anahtarlar kurtarıldı.");
          } catch {
            alert("Parola hatalı! Şifreli veriler kurtarılamadı.");
            setLoading(false);
            return;
          }
        } else {
          alert("PIN girilmedi. Lütfen önce kayıt olun.");
          setLoading(false);
          return;
        }
      }


      localStorage.setItem("token", data.token);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("nickname", data.nickname);
      localStorage.setItem("email", email);

      const ephPair = await generateExtractableECDHKeyPair();
      const ephPub = await exportKeyToBase64(ephPair.publicKey);
      const ephPriv = await exportKeyToBase64(ephPair.privateKey, "pkcs8");

      setEphemeralPublicKey(ephPub);
      setEphemeralPrivateKey(ephPriv);

      const authState = { token: data.token, refreshToken: data.refreshToken, nickname: data.nickname, email, deviceId };
      setAuth(authState);

      const blockedRes = await import("@/lib/api").then(m => m.apiGetBlocked(data.token));
      setBlocked(blockedRes);

      const myBundle = await apiGetBundle(data.token, data.nickname);
      if (myBundle) setBundleCache(prev => ({ ...prev, [data.nickname]: myBundle }));

      addSysLog("✅ E2EE Bağlantısı Sağlandı");
    } catch (e: unknown) {
      alert("Doğrulama hatası: " + (e instanceof Error ? e.message : "Bilinmeyen hata"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.form}>
      <p style={{ textAlign: "center", marginBottom: "20px", color: "var(--color-text-muted)" }}>
        <strong>{email}</strong> adresine gönderilen 6 haneli kodu girin.
      </p>

      <div className={styles.inputGroup}>
        <label className={styles.label}>6 Haneli OTP</label>
        <input
          id="auth-otp"
          type="text"
          className={styles.input}
          placeholder="Terminale gelen kodu girin"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => { if (e.key === "Enter") handleVerifyOtp(); }}
        />
      </div>

      <button id="btn-verify" className={styles.btnAccent} onClick={handleVerifyOtp} disabled={loading} style={{ width: "100%" }}>
        {loading ? "İşleniyor..." : "Doğrula & Giriş Yap"}
      </button>

      <div className={styles.divider}></div>
      <button className={styles.btnSecondary} onClick={onBack} disabled={loading} style={{ background: "transparent", border: "1px solid var(--color-border)" }}>
        Geri Dön
      </button>
    </div>
  );
}
