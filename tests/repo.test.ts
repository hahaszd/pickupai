import { describe, it, expect, beforeEach } from "vitest";

// We test the escapeLike logic and pure functions without needing a real DB.
// For DB-dependent tests we'd need to import the db module, but these unit tests
// focus on the logic that can be tested in isolation.

describe("escapeLike helper (inline verification)", () => {
  function escapeLike(s: string): string {
    return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
  }

  it("escapes percent signs", () => {
    expect(escapeLike("100%")).toBe("100\\%");
  });

  it("escapes underscores", () => {
    expect(escapeLike("first_name")).toBe("first\\_name");
  });

  it("escapes both in combination", () => {
    expect(escapeLike("100%_done")).toBe("100\\%\\_done");
  });

  it("passes through normal strings unchanged", () => {
    expect(escapeLike("John Smith")).toBe("John Smith");
    expect(escapeLike("O'Brien")).toBe("O'Brien");
  });

  it("handles empty string", () => {
    expect(escapeLike("")).toBe("");
  });
});

describe("password hashing", () => {
  it("hashPassword and verifyPassword round-trip correctly", async () => {
    const { hashPassword, verifyPassword } = await import("../src/db/repo.js");
    const hash = hashPassword("mySecret123");
    expect(hash).toContain(":");
    expect(verifyPassword("mySecret123", hash)).toBe(true);
    expect(verifyPassword("wrongPassword", hash)).toBe(false);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const { hashPassword } = await import("../src/db/repo.js");
    const hash1 = hashPassword("samePassword");
    const hash2 = hashPassword("samePassword");
    expect(hash1).not.toBe(hash2);
  });

  it("verifyPassword returns false for malformed stored hash", async () => {
    const { verifyPassword } = await import("../src/db/repo.js");
    expect(verifyPassword("test", "nocolon")).toBe(false);
    expect(verifyPassword("test", "")).toBe(false);
  });
});

describe("generateTempPassword", () => {
  it("generates a 10-character alphanumeric string", async () => {
    const { generateTempPassword } = await import("../src/db/repo.js");
    const pw = generateTempPassword();
    expect(pw).toHaveLength(10);
    expect(pw).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("generates unique passwords", async () => {
    const { generateTempPassword } = await import("../src/db/repo.js");
    const passwords = new Set(Array.from({ length: 50 }, () => generateTempPassword()));
    expect(passwords.size).toBe(50);
  });
});
