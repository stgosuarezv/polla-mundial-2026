import { describe, it, expect } from "vitest";
import {
  FUN_QUOTES,
  GMAIL_QUOTE,
  buildQuotePool,
  isEmailDisplayName,
} from "../lib/fun-quotes";

describe("isEmailDisplayName", () => {
  it("matches a raw email address", () => {
    expect(isEmailDisplayName("fulanito@gmail.com")).toBe(true);
    expect(isEmailDisplayName("  fulanito@gmail.com  ")).toBe(true);
  });

  it("rejects normal display names", () => {
    expect(isEmailDisplayName("David 🥚")).toBe(false);
    expect(isEmailDisplayName("Pepe navarrete")).toBe(false);
    expect(isEmailDisplayName("no@spaces allowed@x.com")).toBe(false);
    expect(isEmailDisplayName("")).toBe(false);
  });
});

describe("buildQuotePool", () => {
  it("appends the gmail quote only when the leader's name is an email", () => {
    const withEgg = buildQuotePool("fulanito@gmail.com");
    expect(withEgg).toContainEqual(GMAIL_QUOTE);
    expect(withEgg).toHaveLength(FUN_QUOTES.length + 1);
  });

  it("returns the base pool for a normal leader name or null", () => {
    expect(buildQuotePool("Pepe")).toHaveLength(FUN_QUOTES.length);
    expect(buildQuotePool(null)).toHaveLength(FUN_QUOTES.length);
  });

  it("never includes a real email address in any quote", () => {
    for (const q of buildQuotePool("fulanito@gmail.com")) {
      expect(q.quote).not.toMatch(/@/);
    }
  });
});
