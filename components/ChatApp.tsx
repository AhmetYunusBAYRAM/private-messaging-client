"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import AuthContainer from "./auth/AuthContainer";
import ChatWindow from "./ChatWindow";

function App() {
  const { auth, setAuth } = useAuthStore();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const nickname = localStorage.getItem("nickname");
    const email = localStorage.getItem("email");
    const refreshToken = localStorage.getItem("refreshToken") ?? "";
    let deviceId = localStorage.getItem("deviceId");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("deviceId", deviceId);
    }
    if (token && nickname && email) {
      setAuth({ token, refreshToken, nickname, email, deviceId });
    }
  }, []);

  if (!auth) return <AuthContainer />;
  return <ChatWindow />;
}

export default function ChatApp() {
  return <App />;
}
