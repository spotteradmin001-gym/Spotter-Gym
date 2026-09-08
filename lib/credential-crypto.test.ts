import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decryptCredential,
  encryptCredential,
  isCredentialVaultEnabled,
  type SealedCredential,
} from "./credential-crypto";

// Hardcoded base64 of 32 bytes ("0123456789abcdef" twice). CI needs no secret.
const TEST_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const OTHER_KEY = Buffer.from("fedcba9876543210fedcba9876543210").toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credential vault configuration", () => {
  it("is disabled when CREDENTIAL_ENC_KEY is unset", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", undefined);
    expect(isCredentialVaultEnabled()).toBe(false);
  });

  it("is disabled when the key is blank", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", "   ");
    expect(isCredentialVaultEnabled()).toBe(false);
  });

  it("is disabled when the key is not 32 bytes", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", Buffer.from("too-short").toString("base64"));
    expect(isCredentialVaultEnabled()).toBe(false);
  });

  it("is enabled with a valid 32-byte base64 key", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    expect(isCredentialVaultEnabled()).toBe(true);
  });
});

describe("encrypt / decrypt round trip", () => {
  it("recovers the original plaintext", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const sealed = encryptCredential("Hunter2-temp-pw!");
    expect(sealed).not.toBeNull();
    expect(decryptCredential(sealed!)).toBe("Hunter2-temp-pw!");
  });

  it("uses a fresh IV each time, so ciphertext differs for the same input", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const a = encryptCredential("same-input")!;
    const b = encryptCredential("same-input")!;
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptCredential(a)).toBe("same-input");
    expect(decryptCredential(b)).toBe("same-input");
  });

  it("handles unicode", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const sealed = encryptCredential("pÄss—wörd–✓")!;
    expect(decryptCredential(sealed)).toBe("pÄss—wörd–✓");
  });
});

describe("graceful degrade when not configured", () => {
  it("encryptCredential returns null", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", undefined);
    expect(encryptCredential("secret")).toBeNull();
  });

  it("decryptCredential returns null", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", undefined);
    const fake: SealedCredential = { ciphertext: "AA==", iv: "AA==", authTag: "AA==" };
    expect(decryptCredential(fake)).toBeNull();
  });
});

describe("authentication failures return null (never throw)", () => {
  it("rejects a tampered ciphertext", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const sealed = encryptCredential("real-password")!;
    const tampered: SealedCredential = {
      ...sealed,
      ciphertext: Buffer.from("different bytes here!").toString("base64"),
    };
    expect(decryptCredential(tampered)).toBeNull();
  });

  it("rejects a wrong auth tag", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const sealed = encryptCredential("real-password")!;
    const tampered: SealedCredential = {
      ...sealed,
      authTag: Buffer.alloc(16).toString("base64"),
    };
    expect(decryptCredential(tampered)).toBeNull();
  });

  it("rejects decryption under a different key", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const sealed = encryptCredential("real-password")!;
    vi.stubEnv("CREDENTIAL_ENC_KEY", OTHER_KEY);
    expect(decryptCredential(sealed)).toBeNull();
  });

  it("rejects a garbage row", () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const garbage: SealedCredential = { ciphertext: "not-real", iv: "nope", authTag: "bad" };
    expect(decryptCredential(garbage)).toBeNull();
  });
});
