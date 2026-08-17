/**
 * Cryptographic utilities for hashing emails and OTPs
 * Uses Web Crypto API available in Cloudflare Workers
 */

/**
 * Hash an email using SHA-256
 * @param email - The email address to hash
 * @returns Promise<string> - The hashed email as a hex string
 */
export async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash an OTP using SHA-256 with salt
 * @param otp - The OTP to hash
 * @param salt - Optional salt (if not provided, generates random salt)
 * @returns Promise<{hash: string, salt: string}> - The hashed OTP and salt
 */
export async function hashOTP(otp: string, salt?: string): Promise<{hash: string, salt: string}> {
  if (!salt) {
    // Generate a random salt
    const saltArray = new Uint8Array(16);
    crypto.getRandomValues(saltArray);
    salt = Array.from(saltArray).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  const encoder = new TextEncoder();
  const otpData = encoder.encode(otp + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', otpData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return { hash, salt };
}

/**
 * Verify an OTP against its hash
 * @param otp - The OTP to verify
 * @param hash - The stored hash
 * @param salt - The salt used for hashing
 * @returns Promise<boolean> - True if OTP matches
 */
export async function verifyOTP(otp: string, hash: string, salt: string): Promise<boolean> {
  const { hash: computedHash } = await hashOTP(otp, salt);
  return computedHash === hash;
}

/**
 * Generate a random OTP
 * @param length - Length of the OTP (default: 6)
 * @returns string - The generated OTP
 */
export function generateOTP(length: number = 6): string {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    otp += digits[randomIndex];
  }
  
  return otp;
}

/**
 * Generate a secure random token for session management
 * @param length - Length of the token in bytes (default: 32)
 * @returns string - The generated token as hex string
 */
export function generateSecureToken(length: number = 32): string {
  const tokenArray = new Uint8Array(length);
  crypto.getRandomValues(tokenArray);
  return Array.from(tokenArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a time-based expiration timestamp
 * @param minutes - Minutes from now for expiration (default: 5)
 * @returns number - Unix timestamp in milliseconds
 */
export function createExpirationTime(minutes: number = 5): number {
  return Date.now() + (minutes * 60 * 1000);
}

/**
 * Check if a timestamp has expired
 * @param timestamp - Unix timestamp in milliseconds
 * @returns boolean - True if expired
 */
export function isExpired(timestamp: number): boolean {
  return Date.now() >= timestamp;
}

/**
 * Email encryption for passkey sign-in.
 *
 * A discoverable passkey identifies its owner by user handle, which is the
 * SHA-256 email hash — a one-way value. The session token still has to carry
 * the address, so the encrypted form is kept on the user row and decrypted at
 * sign-in. AES-GCM authenticates the ciphertext, so tampering fails to decrypt
 * rather than yielding a different address.
 */
const EMAIL_CIPHER = 'AES-GCM';
const EMAIL_IV_BYTES = 12;

async function importEmailKey(keyMaterial: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(keyMaterial), (character) => character.charCodeAt(0));
  if (raw.byteLength !== 32) throw new Error('EMAIL_ENCRYPTION_KEY must decode to 32 bytes');
  return crypto.subtle.importKey('raw', raw, EMAIL_CIPHER, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt an email address for storage on the user row
 * @param email - The email address to encrypt
 * @param keyMaterial - Base64-encoded 32-byte key (EMAIL_ENCRYPTION_KEY)
 * @returns Promise<string> - Base64 of iv||ciphertext
 */
export async function encryptEmail(email: string, keyMaterial: string): Promise<string> {
  const key = await importEmailKey(keyMaterial);
  const iv = new Uint8Array(EMAIL_IV_BYTES);
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: EMAIL_CIPHER, iv }, key, new TextEncoder().encode(email.toLowerCase().trim())),
  );

  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(ciphertext, iv.byteLength);
  let binary = '';
  for (const byte of packed) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Decrypt an email address stored by encryptEmail
 * @param payload - Base64 of iv||ciphertext
 * @param keyMaterial - Base64-encoded 32-byte key (EMAIL_ENCRYPTION_KEY)
 * @returns Promise<string | null> - The address, or null if it cannot be recovered
 */
export async function decryptEmail(payload: string, keyMaterial: string): Promise<string | null> {
  try {
    const packed = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
    if (packed.byteLength <= EMAIL_IV_BYTES) return null;
    const key = await importEmailKey(keyMaterial);
    const plaintext = await crypto.subtle.decrypt(
      { name: EMAIL_CIPHER, iv: packed.subarray(0, EMAIL_IV_BYTES) },
      key,
      packed.subarray(EMAIL_IV_BYTES),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // A rotated key or a corrupted value must not authenticate anyone.
    return null;
  }
}
