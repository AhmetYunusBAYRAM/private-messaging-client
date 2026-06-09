import React, { useState } from "react";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import OtpForm from "./OtpForm";
import styles from "../AuthForm.module.css";

type AuthStep = "login" | "register" | "otp";

export default function AuthContainer() {
  const [step, setStep] = useState<AuthStep>("login");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.lockIcon}>🔒</span>
          <h1 className={styles.title}>Stealth Chat</h1>
          <p className={styles.subtitle}>Uçtan Uca Şifreli Mesajlaşma</p>
        </div>

        {step === "login" && (
          <LoginForm
            email={email}
            setEmail={setEmail}
            loading={loading}
            setLoading={setLoading}
            onLoginSuccess={() => setStep("otp")}
            onGoToRegister={() => setStep("register")}
          />
        )}

        {step === "register" && (
          <RegisterForm
            email={email}
            setEmail={setEmail}
            nickname={nickname}
            setNickname={setNickname}
            loading={loading}
            setLoading={setLoading}
            onRegisterSuccess={() => setStep("otp")}
            onGoToLogin={() => setStep("login")}
          />
        )}

        {step === "otp" && (
          <OtpForm
            email={email}
            loading={loading}
            setLoading={setLoading}
            onBack={() => setStep("login")}
          />
        )}
      </div>
    </div>
  );
}
