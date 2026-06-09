import React from "react";
import InboxList from "../InboxList";
import styles from "../ChatWindow.module.css";
import { useAuthStore } from "@/store/useAuthStore";

const BLANK_PIC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

interface Props {
  searchQuery: string;
  handleSearchInput: (query: string) => void;
  showSearch: boolean;
  setShowSearch: (show: boolean) => void;
  searchResults: { nickname: string; profilePictureBase64?: string }[];
  startChatWith: (nickname: string) => void;
  handleShowSessions: () => void;
  handleShowBlocked: () => void;
  handleUploadPic: (file: File) => void;
  myProfilePic: string | null;
}

export default function ChatSidebar({
  searchQuery,
  handleSearchInput,
  showSearch,
  setShowSearch,
  searchResults,
  startChatWith,
  handleShowSessions,
  handleShowBlocked,
  handleUploadPic,
  myProfilePic
}: Props) {
  const { auth, sysLogs } = useAuthStore();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarTop}>
        {auth && (
          <div className={styles.profileSection}>
            <div className={styles.profileRow}>
              <label htmlFor="pic-upload" className={styles.avatarWrapper} title="Fotoğraf değiştir">
                <img src={myProfilePic || BLANK_PIC} alt="me" className={styles.myAvatar} id="my-avatar" />
                <span className={styles.avatarEdit}>✏️</span>
                <input id="pic-upload" type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleUploadPic(e.target.files[0])} />
              </label>
              <div>
                <p className={styles.myName}>{auth.nickname}</p>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button className={styles.sessionsBtn} id="btn-sessions" onClick={handleShowSessions}>📱 Cihazlarım</button>
                  <button className={styles.sessionsBtn} id="btn-blocked" onClick={handleShowBlocked}>🚫 Engellenenler</button>
                </div>
              </div>
              <button
                className={styles.logoutBtn}
                id="btn-logout"
                onClick={() => {
                  localStorage.removeItem("token");
                  localStorage.removeItem("nickname");
                  localStorage.removeItem("email");
                  window.location.reload();
                }}
              >
                Çıkış
              </button>
            </div>
          </div>
        )}

        <div className={styles.searchWrapper}>
          <input
            id="contact-search"
            className={styles.searchInput}
            placeholder="Kullanıcı ara..."
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onBlur={() => setTimeout(() => setShowSearch(false), 200)}
          />
          {showSearch && (
            <div className={styles.searchDropdown}>
              {searchResults.length === 0 ? (
                <p className={styles.noResult}>Sonuç bulunamadı.</p>
              ) : (
                searchResults.map((u) => (
                  <div key={u.nickname} className={styles.searchItem} onMouseDown={() => startChatWith(u.nickname)}>
                    <img src={u.profilePictureBase64 || BLANK_PIC} alt="" className={styles.searchAvatar} />
                    <span>{u.nickname}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.inboxArea}>
        <InboxList />
      </div>

      <div className={styles.sysLogArea}>
        <p className={styles.sysLogTitle}>Sistem Logları</p>
        <div className={styles.sysLogList}>
          {sysLogs.map((l, i) => (
            <div key={i} className={l.isError ? styles.errLog : styles.sysLog}>{l.text}</div>
          ))}
        </div>
      </div>
    </aside>
  );
}
