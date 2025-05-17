import { keccak256, toUtf8Bytes } from 'ethers';
import { hkdfDeriveKey } from './hkdf';

// Derive an AES-GCM CryptoKey from two Ethereum addresses and a salt (e.g. documentId) using HKDF
export async function deriveSymmetricKeyHKDF(address1: string, address2: string, salt: string|Uint8Array): Promise<CryptoKey> {
  // Sort and concatenate addresses to ensure consistency
  const [a, b] = [address1.toLowerCase(), address2.toLowerCase()].sort();
  const ikm = new Uint8Array(keccak256(toUtf8Bytes(a + b)).slice(2).match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  let saltBytes: Uint8Array;
  if (typeof salt === 'string') {
    saltBytes = new TextEncoder().encode(salt);
  } else {
    saltBytes = salt;
  }
  const info = new TextEncoder().encode('TUMA-Document-Key');
  const hkdfKey = await hkdfDeriveKey(ikm, saltBytes, info, 32);
  return crypto.subtle.importKey(
    'raw',
    hkdfKey,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  );
}

// Helper to create a random salt (e.g. for documentId or per-file salt)
export function generateRandomSalt(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}


// Encrypt a file buffer using AES-GCM with a key derived from sender & recipient addresses and a salt (documentId)
export async function encryptFileBufferHKDF(
  buffer: ArrayBuffer,
  senderAddress: string,
  recipientAddress: string,
  salt: string
): Promise<{ ciphertext: string; iv: string }> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveSymmetricKeyHKDF(senderAddress, recipientAddress, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    buffer
  );
  // Encode ciphertext and iv as base64
  const cipherArr = new Uint8Array(encrypted);
  const ciphertext = uint8ArrayToBase64(cipherArr);
  const iv = uint8ArrayToBase64(ivBytes);
  return { ciphertext, iv };
}

// Decrypt a file buffer using AES-GCM with a key derived from sender & recipient addresses and a salt (documentId)
export async function decryptFileBufferHKDF(
  ciphertextBase64: string,
  ivBase64: string,
  senderAddress: string,
  recipientAddress: string,
  salt: string
): Promise<Uint8Array> {
  const key = await deriveSymmetricKeyHKDF(senderAddress, recipientAddress, salt);
  const ciphertext = base64ToUint8Array(ciphertextBase64);
  const iv = base64ToUint8Array(ivBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new Uint8Array(decrypted);
}


// Decrypt a file buffer using AES-GCM with a key derived from sender & recipient addresses (LEGACY, not used)
// export async function decryptFileBuffer(
//   ciphertextBase64: string,
//   ivBase64: string,
//   senderAddress: string,
//   recipientAddress: string
// ): Promise<Uint8Array> {
//   const key = await deriveSymmetricKey(senderAddress, recipientAddress);
//   const ciphertext = base64ToUint8Array(ciphertextBase64);
//   const iv = base64ToUint8Array(ivBase64);
//   const decrypted = await crypto.subtle.decrypt(
//     { name: 'AES-GCM', iv },
//     key,
//     ciphertext
//   );
//   return new Uint8Array(decrypted);
// }

// Helper function to convert Uint8Array to base64 without using spread operator
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper function to convert base64 to Uint8Array without using spread operator
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
