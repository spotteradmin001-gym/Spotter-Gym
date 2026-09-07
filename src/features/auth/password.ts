import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password storage for Spotter. Uses Node's built-in `crypto.scryptSync`
 * rather than adding bcrypt / argon2 — no native bindings to build on Vercel's
 * serverless Node runtime, and scrypt is a solid memory-hard KDF. Stored
 * format: "saltHex:hashHex". A plaintext password is never written to the
 * database or its history.
 */

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

/** Constant-time compare — never short-circuits on the first differing byte. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

const PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

/**
 * A one-time password that staff hand to a new account (owner creates an
 * employee, admin creates an owner). No visually ambiguous characters
 * (0/O, 1/l/I) so it can be read aloud or copied off a screen.
 */
export function generatePassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[bytes[i]! % PASSWORD_CHARS.length];
  }
  return out;
}

const MIN_PASSWORD_LENGTH = 8;

export function isPasswordStrongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export { MIN_PASSWORD_LENGTH };
