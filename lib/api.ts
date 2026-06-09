import API_BASE from "./apiBase";

export interface KeyBundle {
  identityPublicKey: string;
  encryptedIdentityPrivateKey?: string;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  encryptedSignedPrePrivateKey?: string;
  oneTimePreKeys?: { keyId: string; publicKey: string }[];
}

export interface InboxItem {
  contactNickname: string;
  profilePictureBase64?: string;
  unreadCount: number;
  lastMessage: ChatMessage;
}

export interface ChatMessage {
  id: string;
  senderNickname: string;
  receiverNickname: string;
  senderEncryptedPayload: string;
  receiverEncryptedPayloads: Record<string, string>;
  commonEncryptedPayload: string;
  timestamp: string;
  isDeleted: boolean;
  reactions: Record<string, string>;
  replyToMessageId?: string;
  isRead: boolean;
}

export interface ProfileData {
  profilePictureBase64?: string;
  isOnline: boolean;
  lastSeen?: string;
  hasBlockedYou?: boolean;
}

async function authFetch(url: string, token: string, options?: RequestInit): Promise<Response> {
  let res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    const refreshTokenStr = localStorage.getItem("refreshToken");
    if (refreshTokenStr) {
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh-token`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiredToken: token, refreshToken: refreshTokenStr }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        localStorage.setItem("token", data.token);
        localStorage.setItem("refreshToken", data.refreshToken);
        
        const { useAuthStore } = await import("@/store/useAuthStore");
        const authStore = useAuthStore.getState();
        if (authStore.auth) {
          authStore.setAuth({ ...authStore.auth, token: data.token, refreshToken: data.refreshToken });
        }

        res = await fetch(url, {
          ...options,
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.token}`,
            ...(options?.headers ?? {}),
          },
        });
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        window.location.reload();
      }
    } else {
      localStorage.removeItem("token");
      window.location.reload();
    }
  }

  return res;
}

export async function apiRegister(email: string, nickname: string, keys: object) {
  return fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, nickname, keys }),
  });
}

export async function apiLogin(email: string) {
  return fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function apiVerifyOtp(email: string, otp: string, deviceId: string, deviceName: string) {
  return fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp, deviceId, deviceName }),
  });
}

export async function apiRefreshToken(token: string, refreshToken: string) {
  return fetch(`${API_BASE}/api/auth/refresh-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiredToken: token, refreshToken }),
  });
}

export async function apiGetBundle(token: string, nickname: string): Promise<KeyBundle | null> {
  const res = await authFetch(`${API_BASE}/api/auth/publickey-bundle/${nickname}`, token);
  if (!res.ok) return null;
  return res.json();
}

export async function apiGetInbox(token: string): Promise<InboxItem[]> {
  const res = await authFetch(`${API_BASE}/api/user/inbox`, token);
  if (!res.ok) return [];
  return res.json();
}

export async function apiGetHistory(token: string, target: string, limit = 50): Promise<ChatMessage[]> {
  const res = await authFetch(`${API_BASE}/api/message/history/${target}?limit=${limit}`, token);
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

export async function apiGetProfile(token: string, nickname: string): Promise<ProfileData | null> {
  const res = await authFetch(`${API_BASE}/api/user/${nickname}/profile`, token);
  if (!res.ok) return null;
  return res.json();
}

export async function apiUploadProfilePic(token: string, base64Image: string) {
  return authFetch(`${API_BASE}/api/user/profile-picture`, token, {
    method: "POST",
    body: JSON.stringify({ base64Image }),
  });
}

export async function apiSearchContacts(token: string, query: string) {
  const res = await authFetch(`${API_BASE}/api/user/contacts?query=${encodeURIComponent(query)}`, token);
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

export async function apiBlock(token: string, target: string) {
  return authFetch(`${API_BASE}/api/user/block/${target}`, token, { method: "POST" });
}

export async function apiUnblock(token: string, target: string) {
  return authFetch(`${API_BASE}/api/user/unblock/${target}`, token, { method: "POST" });
}

export async function apiGetBlocked(token: string): Promise<string[]> {
  const res = await authFetch(`${API_BASE}/api/user/blocked`, token);
  if (!res.ok) return [];
  return res.json();
}

export async function apiDeleteHistory(token: string, target: string) {
  return authFetch(`${API_BASE}/api/message/history/${target}`, token, { method: "DELETE" });
}

export async function apiGetSessions(token: string) {
  const res = await authFetch(`${API_BASE}/api/user/sessions`, token);
  if (!res.ok) return [];
  return res.json();
}

export async function apiResetKeys(token: string, keys: object) {
  return authFetch(`${API_BASE}/api/auth/reset-keys`, token, {
    method: "POST",
    body: JSON.stringify({ keys }),
  });
}
