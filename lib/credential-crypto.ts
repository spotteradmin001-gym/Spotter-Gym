import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Symmetric encryption for the retrievable staff-credential vault (CR-6).
 *
 * AES-256-GCM using Node's built-in `crypto` — no dependency. The 32-byte key
 * comes from the `CREDENTIAL_ENC_KEY` env var (base64-encoded), and never
 * touches the database. GCM gives us authenticated encryption: a tampered
 * ciphertext, IV, or tag fails `decrypt` rather than returning garbage.
 *
 * Graceful degrade (mirrors `lib/mail.ts`): when `CREDENTIAL_ENC_KEY` is unset
 * or malformed the vault is "not configured" — `isCredentialVaultEnabled()`
 * returns false, `encryptCredential` returns null (callers skip storing), and
 * `decryptCredential` returns null (callers show "not available"). Preview and
 * the un-cutover production keep building and testing green with no new secret.
 *
 * This is a convenience layer only. The scrypt hash in `users.password_hash`
 * remains the sole value used to authenticate; a vault row is purged the moment
 * the account holder sets their own password.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type SealedCredential = {
  /** Base64 ciphertext. */
  ciphertext: string;
  /** Base64 initialisation vector (12 bytes, unique per encryption). */
  iv: string;
  /** Base64 GCM authentication tag (16 bytes). */
  authTag: string;
};

/**
 * The decoded 32-byte key, or null when `CREDENTIAL_ENC_KEY` is unset or is not
 * exactly 32 bytes of base64. `Buffer.from(x, "base64")` never throws — it just
 * decodes what it can — so the length check is what rejects a bad value.
 */
function readKey(): Buffer | null {
  const raw = process.env.CREDENTIAL_ENC_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === KEY_BYTES ? key : null;
}

/**
 * True when a usable `CREDENTIAL_ENC_KEY` is configured. UI uses this to decide
 * whether to offer "Show temp password" or a "set CREDENTIAL_ENC_KEY to enable"
 * note.
 */
export function isCredentialVaultEnabled(): boolean {
  return readKey() !== null;
}

/**
 * Encrypt a plaintext credential. Returns null when the vault is not configured
 * — the caller then simply does not persist anything.
 */
export function encryptCredential(plaintext: string): SealedCredential | null {
  const key = readKey();
  if (!key) return null;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Decrypt a sealed credential. Returns null when the vault is not configured or
 * when authentication fails (tampering, wrong key, corrupt row) — never throws.
 */
export function decryptCredential(sealed: SealedCredential): string | null {
  const key = readKey();
  if (!key) return null;

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(sealed.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
