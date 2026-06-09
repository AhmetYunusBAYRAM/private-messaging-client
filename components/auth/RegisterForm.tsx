import React from "react";
import { apiRegister } from "@/lib/api";
import {
  generateExtractableECDHKeyPair,
  generateExtractableECDSAKeyPair,
  exportKeyToBase64,
  encryptWithPin,
  signData,
  saveToIDB,
} from "@/lib/crypto";
import styles from "../AuthForm.module.css";

interface Props {
  email: string;
  setEmail: (val: string) => void;
  nickname: string;
  setNickname: (val: string) => void;
  loading: boolean;
  setLoading: (val: boolean) => void;
  onRegisterSuccess: () => void;
  onGoToLogin: () => void;
}

export default function RegisterForm({ email, setEmail, nickname, setNickname, loading, setLoading, onRegisterSuccess, onGoToLogin }: Props) {
  async function handleRegister() {
    if (!email || !nickname) return alert("Email ve nickname zorunlu!");
    const pin = prompt("Eski mesajlarınızı cihaz değiştirince kurtarmak için bir Kurtarma Parolası (PIN) belirleyin:");
    if (!pin) return alert("PIN zorunludur!");

    setLoading(true);
    try {
      const identityKeyPair = await generateExtractableECDHKeyPair();
      const ipk = await exportKeyToBase64(identityKeyPair.publicKey);
      const iprivK = await exportKeyToBase64(identityKeyPair.privateKey, "pkcs8");
      const eipk = await encryptWithPin(pin, iprivK, email);

      const signedPreKeyPair = await generateExtractableECDHKeyPair();
      const spk = await exportKeyToBase64(signedPreKeyPair.publicKey);
      const sprivK = await exportKeyToBase64(signedPreKeyPair.privateKey, "pkcs8");
      const esppk = await encryptWithPin(pin, sprivK, email);

      const signKeyPair = await generateExtractableECDSAKeyPair();
      const spkSig = await signData(signKeyPair.privateKey, spk);
      const signPub = await exportKeyToBase64(signKeyPair.publicKey);
      const combinedIpk = JSON.stringify({ ecdh: ipk, ecdsa: signPub });

      const oneTimePreKeys: { keyId: string; publicKey: string }[] = [];
      const rawPreKeys: { keyId: string; privateKey: string }[] = [];
      for (let i = 0; i < 100; i++) {
        const pair = await generateExtractableECDHKeyPair();
        const pub = await exportKeyToBase64(pair.publicKey);
        const priv = await exportKeyToBase64(pair.privateKey, "pkcs8");
        const keyId = crypto.randomUUID();
        oneTimePreKeys.push({ keyId, publicKey: pub });
        rawPreKeys.push({ keyId, privateKey: priv });
      }

      await saveToIDB(`id_priv_${email}`, iprivK);
      await saveToIDB(`spk_priv_${email}`, sprivK);
      await saveToIDB(`otpk_privs_${email}`, rawPreKeys);

      const keys = {
        identityPublicKey: combinedIpk,
        encryptedIdentityPrivateKey: eipk,
        signedPreKeyPublic: spk,
        signedPreKeySignature: spkSig,
        encryptedSignedPrePrivateKey: esppk,
        oneTimePreKeys,
      };

      const res = await apiRegister(email, nickname, keys);
      if (res.ok) {
        alert("OTP gönderildi (Terminal ekranına bakınız).");
        onRegisterSuccess();
      } else {
        const data = await res.json();
        alert("Hata: " + data.message);
      }
    } catch (e: unknown) {
      alert("Kayıt hatası: " + (e instanceof Error ? e.message : "Bilinmeyen hata"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.inputGroup}>
        <label className={styles.label}>Email Adresi</label>
        <input
          id="auth-email"
          type="email"
          className={styles.input}
          placeholder="ornek@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.label}>Nickname</label>
        <input
          id="auth-nickname"
          type="text"
          className={styles.input}
          placeholder="kullaniciadi"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
        />
      </div>

      <button id="btn-register" className={styles.btnPrimary} onClick={handleRegister} disabled={loading} style={{ width: "100%" }}>
        {loading ? "Bekleniyor..." : "Kayıt Ol"}
      </button>
      
      <div className={styles.divider}><span>Zaten hesabınız var mı?</span></div>
      <button className={styles.btnSecondary} onClick={onGoToLogin} disabled={loading}>
        Giriş Yap
      </button>
    </div>
  );
}
