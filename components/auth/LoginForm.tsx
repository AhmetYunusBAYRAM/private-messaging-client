import React from "react";
import { apiLogin } from "@/lib/api";
import styles from "../AuthForm.module.css";

interface Props {
  email: string;
  setEmail: (val: string) => void;
  loading: boolean;
  setLoading: (val: boolean) => void;
  onLoginSuccess: () => void;
  onGoToRegister: () => void;
}

export default function LoginForm({ email, setEmail, loading, setLoading, onLoginSuccess, onGoToRegister }: Props) {
  async function handleLogin() {
    if (!email) return alert("Email zorunlu!");
    setLoading(true);
    try {
      const res = await apiLogin(email);
      if (res.ok) {
        alert("OTP gönderildi (Terminal ekranına bakınız).");
        onLoginSuccess();
      } else {
        const data = await res.json();
        alert("Hata: " + data.message);
      }
    } catch (e: unknown) {
      alert("Giriş hatası: " + (e instanceof Error ? e.message : "Bilinmeyen hata"));
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
          onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
        />
      </div>

      <button id="btn-login" className={styles.btnPrimary} onClick={handleLogin} disabled={loading} style={{ width: "100%" }}>
        {loading ? "Bekleniyor..." : "Giriş Yap"}
      </button>
      
      <div className={styles.divider}><span>Hesabınız yok mu?</span></div>
      <button className={styles.btnSecondary} onClick={onGoToRegister} disabled={loading}>
        Kayıt Ol
      </button>
    </div>
  );
}
