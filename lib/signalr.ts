"use client";

import * as signalR from "@microsoft/signalr";
import API_BASE from "./apiBase";

type MessageHandler = (
  msgId: string,
  from: string,
  payload: string,
  signature: string,
  replyToId: string | null
) => void;

type ReactionHandler = (msgId: string, reactorNick: string, emoji: string) => void;
type DeletedHandler = (msgId: string) => void;
type ReadHandler = (readerNick: string) => void;
type PresenceHandler = (nick: string, isOnline: boolean, lastSeen: string | null) => void;
type WebRTCHandler = (from: string, payload: string) => void;

let connection: signalR.HubConnection | null = null;

export function getConnection() {
  return connection;
}

export async function startConnection(
  token: string,
  ephemeralKey: string,
  deviceId: string,
  handlers: {
    onMessage: MessageHandler;
    onReaction: ReactionHandler;
    onDeleted: DeletedHandler;
    onRead: ReadHandler;
    onPresence: PresenceHandler;
    onWebRTC: WebRTCHandler;
  }
) {
  if (connection) {
    await connection.stop();
  }

  connection = new signalR.HubConnectionBuilder()
    .withUrl(
      `${API_BASE}/chat?ephemeralKey=${encodeURIComponent(ephemeralKey)}&deviceId=${deviceId}`,
      { 
        accessTokenFactory: () => localStorage.getItem("token") || "",
        withCredentials: true
      }
    )
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.None)
    .build();

  connection.on("ReceiveMessage", handlers.onMessage);
  connection.on("ReceiveReaction", handlers.onReaction);
  connection.on("MessageDeleted", handlers.onDeleted);
  connection.on("MessagesRead", handlers.onRead);
  connection.on("UserPresenceUpdate", handlers.onPresence);
  connection.on("ReceiveWebRTCSignal", handlers.onWebRTC);

  try {
    await connection.start();
  } catch (err) {
    if (err instanceof Error && err.message.includes("stopped during negotiation")) {
      console.warn("SignalR connection stopped during negotiation (React Strict Mode / HMR).");
    } else {
      console.error("SignalR connection start failed:", err);
    }
  }
}

export async function stopConnection() {
  if (connection) {
    await connection.stop();
    connection = null;
  }
}

export async function invokeGetEphemeralKeys(to: string): Promise<Record<string, string>> {
  if (!connection) return {};
  try {
    return await connection.invoke("GetEphemeralPublicKeys", to);
  } catch {
    return {};
  }
}

export async function invokeSendMessage(
  to: string,
  senderSymKey: string,
  ephemeralSymKeys: Record<string, string>,
  commonEncryptedPayload: string,
  signature: string,
  replyToId: string | null
): Promise<string> {
  if (!connection) throw new Error("SignalR bağlantısı yok");
  return connection.invoke("SendPrivateMessage", to, senderSymKey, ephemeralSymKeys, commonEncryptedPayload, signature, replyToId);
}

export async function invokeAddReaction(msgId: string, emoji: string) {
  if (!connection) return;
  return connection.invoke("AddReaction", msgId, emoji);
}

export async function invokeDeleteMessage(msgId: string) {
  if (!connection) return;
  return connection.invoke("DeleteMessage", msgId);
}

export async function invokeMarkRead(from: string) {
  if (!connection) return;
  return connection.invoke("MarkMessagesAsRead", from).catch(console.error);
}

export async function invokeSyncMessages(lastMessageId: string) {
  if (!connection) return;
  return connection.invoke("SyncMessages", lastMessageId).catch(console.error);
}
