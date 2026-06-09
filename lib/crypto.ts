import { saveToIDB, loadFromIDB } from "./idb";

export { saveToIDB, loadFromIDB };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateExtractableECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
}

export async function generateExtractableECDSAKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

export async function exportKeyToBase64(key: CryptoKey, type: "spki" | "pkcs8" = "spki"): Promise<string> {
  const exported = await crypto.subtle.exportKey(type, key);
  return bytesToBase64(new Uint8Array(exported));
}

export async function importPublicKeyFromBase64(base64: string, algorithm: "ECDH" | "ECDSA" = "ECDH"): Promise<CryptoKey> {
  const bytes = base64ToBytes(base64);
  return crypto.subtle.importKey(
    "spki",
    bytes.buffer as ArrayBuffer,
    { name: algorithm, namedCurve: "P-256" },
    true,
    algorithm === "ECDH" ? [] : ["verify"]
  );
}

export async function importPrivateKeyFromBase64(base64: string, algorithm: "ECDH" | "ECDSA" = "ECDH"): Promise<CryptoKey> {
  const bytes = base64ToBytes(base64);
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer as ArrayBuffer,
    { name: algorithm, namedCurve: "P-256" },
    true,
    algorithm === "ECDH" ? ["deriveBits"] : ["sign"]
  );
}

function toFixedBuffer(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(input.length);
  const view = new Uint8Array(buf);
  view.set(input);
  return view;
}

async function getPinKey(pin: string, saltBase64?: string): Promise<{ key: CryptoKey; saltBase64: string }> {
  const enc = new TextEncoder();
  let saltBytes: Uint8Array<ArrayBuffer>;
  if (saltBase64) {
    saltBytes = toFixedBuffer(base64ToBytes(saltBase64));
  } else {
    const buf = new ArrayBuffer(16);
    saltBytes = new Uint8Array(buf);
    crypto.getRandomValues(saltBytes);
  }
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 200000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return { key, saltBase64: bytesToBase64(saltBytes) };
}

export async function encryptWithPin(pin: string, base64Data: string, userId: string): Promise<string> {
  let storedSalt = await loadFromIDB<string>(`pin_salt_${userId}`);
  const { key, saltBase64 } = await getPinKey(pin, storedSalt);
  if (!storedSalt) {
    await saveToIDB(`pin_salt_${userId}`, saltBase64);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(base64Data));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64(combined);
}

export async function decryptWithPin(pin: string, encryptedBase64: string, userId: string): Promise<string> {
  const storedSalt = await loadFromIDB<string>(`pin_salt_${userId}`);
  const { key } = await getPinKey(pin, storedSalt);
  const combined = base64ToBytes(encryptedBase64);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

export async function signData(privateKey: CryptoKey, dataString: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    new TextEncoder().encode(dataString)
  );
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifySignature(publicKey: CryptoKey, signatureBase64: string, dataString: string): Promise<boolean> {
  const signatureBytes = base64ToBytes(signatureBase64);
  return crypto.subtle.verify(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    publicKey,
    signatureBytes as unknown as BufferSource,
    new TextEncoder().encode(dataString)
  );
}

export async function hkdf(secretBits: ArrayBuffer, saltInput: Uint8Array, infoString: string): Promise<CryptoKey> {
  const saltBytes = toFixedBuffer(saltInput);
  const keyMaterial = await crypto.subtle.importKey("raw", secretBits, { name: "HKDF" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: saltBytes, info: new TextEncoder().encode(infoString) },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function eciesEncrypt(targetPubKeyBase64: string, plaintext: string): Promise<string> {
  const ephemeralPair = await generateExtractableECDHKeyPair();
  const targetPubKey = await importPublicKeyFromBase64(targetPubKeyBase64, "ECDH");
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: targetPubKey }, ephemeralPair.privateKey, 256);
  const aesKey = await hkdf(sharedSecret, new Uint8Array(32), "ECIES");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(plaintext));
  const payload = new Uint8Array(iv.length + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), iv.length);
  const ephPubBase64 = await exportKeyToBase64(ephemeralPair.publicKey);
  const payloadObj = { ephPub: ephPubBase64, ciphertext: bytesToBase64(payload) };
  return btoa(JSON.stringify(payloadObj));
}

export async function eciesDecrypt(myPrivKeyBase64: string, eciesBase64: string): Promise<string | null> {
  try {
    const payloadObj = JSON.parse(atob(eciesBase64)) as { ephPub: string; ciphertext: string };
    const myPrivKey = await importPrivateKeyFromBase64(myPrivKeyBase64, "ECDH");
    const ephPubKey = await importPublicKeyFromBase64(payloadObj.ephPub, "ECDH");
    const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: ephPubKey }, myPrivKey, 256);
    const aesKey = await hkdf(sharedSecret, new Uint8Array(32), "ECIES");
    const combined = base64ToBytes(payloadObj.ciphertext);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}
