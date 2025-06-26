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

// Add new function for multi-recipient encryption
export async function encryptFileForMultipleRecipients(
  buffer: ArrayBuffer,
  senderAddress: string,
  recipientAddresses: string[],
  documentId: string
): Promise<{
  masterCiphertext: string;
  iv: string;
  recipientKeys: { [address: string]: string };
}> {
  // Generate a random master key for the file
  const masterKey = crypto.getRandomValues(new Uint8Array(32));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  
  // Import master key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    masterKey,
    'AES-GCM',
    false,
    ['encrypt']
  );
  
  // Encrypt file with master key
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    cryptoKey,
    buffer
  );
  
  const masterCiphertext = uint8ArrayToBase64(new Uint8Array(encrypted));
  const iv = uint8ArrayToBase64(ivBytes);
  
  // Encrypt master key for each recipient (including sender)
  const recipientKeys: { [address: string]: string } = {};
  const allAddresses = [senderAddress, ...recipientAddresses];
  
  for (const recipientAddr of allAddresses) {
    const keyEncryptionKey = await deriveSymmetricKeyHKDF(
      senderAddress,
      recipientAddr,
      documentId
    );
    
    const keyIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedMasterKey = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: keyIv },
      keyEncryptionKey,
      masterKey
    );
    
    // Store encrypted key with its IV
    const keyData = new Uint8Array(keyIv.length + encryptedMasterKey.byteLength);
    keyData.set(keyIv);
    keyData.set(new Uint8Array(encryptedMasterKey), keyIv.length);
    
    recipientKeys[recipientAddr.toLowerCase()] = uint8ArrayToBase64(keyData);
  }
  
  return { masterCiphertext, iv, recipientKeys };
}

export async function decryptFileForMultipleRecipients(
  masterCiphertext: string,
  iv: string,
  recipientKeys: { [address: string]: string },
  senderAddress: string,
  userAddress: string,
  documentId: string
): Promise<Uint8Array> {
  const userKey = userAddress.toLowerCase();
  
  // Try to find the user's key with flexible matching
  let userKeyData = recipientKeys[userKey];
  
  if (!userKeyData) {
    // Try original case
    userKeyData = recipientKeys[userAddress];
  }
  
  if (!userKeyData) {
    // Try to find any key that matches (case-insensitive)
    const availableKeys = Object.keys(recipientKeys);
    const matchingKey = availableKeys.find(key => 
      key.toLowerCase() === userAddress.toLowerCase()
    );
    if (matchingKey) {
      userKeyData = recipientKeys[matchingKey];
    }
  }
  
  if (!userKeyData) {
    console.error('Available recipient keys:', Object.keys(recipientKeys));
    console.error('Looking for user:', userAddress);
    throw new Error(`No decryption key found for user ${userAddress}. Available keys: ${Object.keys(recipientKeys).join(', ')}`);
  }
  
  // Decrypt the master key
  const keyData = base64ToUint8Array(userKeyData);
  const keyIv = keyData.slice(0, 12);
  const encryptedMasterKey = keyData.slice(12);
  
  const keyEncryptionKey = await deriveSymmetricKeyHKDF(
    senderAddress,
    userAddress,
    documentId
  );
  
  const masterKeyBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: keyIv },
    keyEncryptionKey,
    encryptedMasterKey
  );
  
  // Import master key and decrypt file
  const masterKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBuffer,
    'AES-GCM',
    false,
    ['decrypt']
  );
  
  const ciphertext = base64ToUint8Array(masterCiphertext);
  const ivBytes = base64ToUint8Array(iv);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    masterKey,
    ciphertext
  );
  
  return new Uint8Array(decrypted);
}

// Add metadata encryption
export async function encryptMetadata(
  metadata: any,
  senderAddress: string,
  recipientAddress: string,
  documentId: string
): Promise<string> {
  const key = await deriveSymmetricKeyHKDF(senderAddress, recipientAddress, documentId + '_meta');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    metadataBytes
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return uint8ArrayToBase64(combined);
}

export async function decryptMetadata(
  encryptedMetadata: string,
  senderAddress: string,
  recipientAddress: string,
  documentId: string
): Promise<any> {
  const key = await deriveSymmetricKeyHKDF(senderAddress, recipientAddress, documentId + '_meta');
  const combined = base64ToUint8Array(encryptedMetadata);
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  const metadataJson = new TextDecoder().decode(decrypted);
  return JSON.parse(metadataJson);
}
