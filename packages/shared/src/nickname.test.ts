import { describe, expect, it } from "vitest";
import { validateNickname } from "./nickname.js";

describe("nickname normalization and policy", () => {
  it("trims and compatibility-normalizes names, comparing case-insensitively", () => {
    expect(validateNickname("  Ａlice  ")).toEqual({ ok: true, display: "Alice", key: "alice" });
  });

  it.each(["A", "abcdefghijklmn", "name space", "a@b", "admin", "guest12", "관리자"]) (
    "rejects invalid or reserved nickname %s", (name) => {
      expect(validateNickname(name).ok).toBe(false);
    },
  );

  it("accepts Korean, letters, digits, underscore, and hyphen in 2-12 graphemes", () => {
    expect(validateNickname("바둑_12")).toMatchObject({ ok: true, display: "바둑_12" });
    expect(validateNickname("오목-친구").ok).toBe(true);
  });
  it("counts combining characters as visible graphemes and rejects bot names",()=>{
    expect(validateNickname("a\u0308".repeat(12)).ok).toBe(true);
    expect(validateNickname("x\u0308").ok).toBe(false);
    expect(validateNickname("bot").ok).toBe(false);expect(validateNickname("봇").ok).toBe(false);
  });
});
