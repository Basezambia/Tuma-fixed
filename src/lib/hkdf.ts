// HKDF key derivation using WebCrypto
// RFC 5869, SHA-256
export async function hkdfDeriveKey(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number = 32 // 32 bytes = 256 bits
): Promise<Uint8Array> {
  // Import IKM as a raw key
  const baseKey = await crypto.subtle.importKey(
    'raw', ikm, { name: 'HKDF' }, false, ['deriveBits']
  );
  // Derive bits
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info
    },
    baseKey,
    length * 8
  );
  return new Uint8Array(derivedBits);
}
