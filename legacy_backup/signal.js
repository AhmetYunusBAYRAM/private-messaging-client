// Signal Protocol implementation using WebCrypto API (ECDH, ECDSA, AES-GCM)

const DB_NAME = 'StealthChatDB';
const DB_VERSION = 1;
const STORE_NAME = 'CryptoKeys';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveToIDB(keyName, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(data, keyName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function loadFromIDB(keyName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(keyName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Key Generation
async function generateECDHKeyPair() {
    return await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false, // Extractable = false for private key in memory, but we need true to export public
        ["deriveKey", "deriveBits"]
    );
}

// We generate extractable: true because we need to encrypt them with a PIN for server backup
async function generateExtractableECDHKeyPair() {
    return await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"]
    );
}

async function generateExtractableECDSAKeyPair() {
    return await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );
}

async function exportKeyToBase64(key, type = 'spki') {
    const exported = await crypto.subtle.exportKey(type, key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

async function importPublicKeyFromBase64(base64, algorithm = "ECDH") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const usage = algorithm === "ECDH" ? [] : ["verify"];
    return await crypto.subtle.importKey(
        "spki",
        bytes.buffer,
        { name: algorithm, namedCurve: "P-256" },
        true,
        usage
    );
}

async function importPrivateKeyFromBase64(base64, algorithm = "ECDH") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const usage = algorithm === "ECDH" ? ["deriveBits"] : ["sign"];
    return await crypto.subtle.importKey(
        "pkcs8",
        bytes.buffer,
        { name: algorithm, namedCurve: "P-256" },
        true,
        usage
    );
}

// AES-GCM Encrypt/Decrypt helper for backups
async function getPinKey(pin) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(pin), {name: "PBKDF2"}, false, ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode("stealth_salt"), iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptWithPin(pin, base64Data) {
    const key = await getPinKey(pin);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(base64Data)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
}

async function decryptWithPin(pin, encryptedBase64) {
    const key = await getPinKey(pin);
    const binary = atob(encryptedBase64);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
    return new TextDecoder().decode(decrypted);
}

// Signing
async function signData(privateKey, dataString) {
    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        privateKey,
        new TextEncoder().encode(dataString)
    );
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifySignature(publicKey, signatureBase64, dataString) {
    const binary = atob(signatureBase64);
    const signatureBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) signatureBytes[i] = binary.charCodeAt(i);
    
    return await crypto.subtle.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        publicKey,
        signatureBytes,
        new TextEncoder().encode(dataString)
    );
}

// X3DH & HKDF
async function hkdf(secretBits, saltBytes, infoString) {
    const keyMaterial = await crypto.subtle.importKey(
        "raw", secretBits, { name: "HKDF" }, false, ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: saltBytes,
            info: new TextEncoder().encode(infoString)
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

class RatchetSession {
    constructor(rootKey, remoteIdentityKey) {
        this.rootKey = rootKey;
        this.remoteIdentityKey = remoteIdentityKey;
        this.sendChain = null;
        this.receiveChain = null;
    }

    async encrypt(plaintext) {
        // Simple Symmetric Ratchet
        if (!this.sendChain) this.sendChain = this.rootKey;
        
        // Ratchet the chain key
        const newChain = await hkdf(await crypto.subtle.exportKey("raw", this.sendChain), new Uint8Array(32), "chain");
        const msgKey = await hkdf(await crypto.subtle.exportKey("raw", this.sendChain), new Uint8Array(32), "message");
        this.sendChain = newChain;

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            msgKey,
            new TextEncoder().encode(plaintext)
        );

        const payload = new Uint8Array(iv.length + ciphertext.byteLength);
        payload.set(iv, 0);
        payload.set(new Uint8Array(ciphertext), iv.length);
        return btoa(String.fromCharCode(...payload));
    }

    async decrypt(ciphertextBase64) {
        if (!this.receiveChain) this.receiveChain = this.rootKey;
        
        const newChain = await hkdf(await crypto.subtle.exportKey("raw", this.receiveChain), new Uint8Array(32), "chain");
        const msgKey = await hkdf(await crypto.subtle.exportKey("raw", this.receiveChain), new Uint8Array(32), "message");
        this.receiveChain = newChain;

        const binary = atob(ciphertextBase64);
        const combined = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            msgKey,
            data
        );
        return new TextDecoder().decode(decrypted);
    }
}

// Global active sessions map
const activeSessions = {}; // Map of nickname -> RatchetSession

window.SignalCrypto = {
    generateExtractableECDHKeyPair,
    generateExtractableECDSAKeyPair,
    exportKeyToBase64,
    importPublicKeyFromBase64,
    importPrivateKeyFromBase64,
    encryptWithPin,
    decryptWithPin,
    signData,
    verifySignature,
    saveToIDB,
    loadFromIDB,
    activeSessions,
    hkdf,
    RatchetSession
};
