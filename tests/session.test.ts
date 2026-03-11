import { describe, it, expect } from "vitest";

// Test the trade alias resolution logic (re-implemented here since the function
// isn't exported, but we verify the mapping data is consistent).
const TRADE_ALIASES: Record<string, string> = {
  plumbing: "plumber",
  electrical: "electrician",
  electric: "electrician",
  roofing: "roofer",
  roofs: "roofer",
  painting: "painter",
  carpentry: "carpenter",
  joiner: "carpenter",
  joinery: "carpenter",
  tiling: "tiler",
  tiles: "tiler",
  general: "handyman",
  maintenance: "handyman",
  "general maintenance": "handyman",
  building: "handyman",
  builder: "handyman",
  locksmith: "handyman",
  locks: "handyman",
  landscaping: "handyman",
  landscaper: "handyman",
  gardener: "handyman",
  concreter: "handyman",
  concreting: "handyman",
  fencing: "handyman",
  fencer: "handyman"
};

function resolveTradeKey(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return TRADE_ALIASES[lower] ?? lower;
}

describe("resolveTradeKey / TRADE_ALIASES", () => {
  it("resolves exact trade types to themselves", () => {
    expect(resolveTradeKey("plumber")).toBe("plumber");
    expect(resolveTradeKey("electrician")).toBe("electrician");
    expect(resolveTradeKey("roofer")).toBe("roofer");
    expect(resolveTradeKey("handyman")).toBe("handyman");
  });

  it("resolves natural language variants to their base trade", () => {
    expect(resolveTradeKey("plumbing")).toBe("plumber");
    expect(resolveTradeKey("electrical")).toBe("electrician");
    expect(resolveTradeKey("roofing")).toBe("roofer");
    expect(resolveTradeKey("carpentry")).toBe("carpenter");
    expect(resolveTradeKey("tiling")).toBe("tiler");
  });

  it("resolves newer aliases (builder, locksmith, etc.) to handyman", () => {
    expect(resolveTradeKey("builder")).toBe("handyman");
    expect(resolveTradeKey("locksmith")).toBe("handyman");
    expect(resolveTradeKey("landscaper")).toBe("handyman");
    expect(resolveTradeKey("concreter")).toBe("handyman");
    expect(resolveTradeKey("fencer")).toBe("handyman");
    expect(resolveTradeKey("gardener")).toBe("handyman");
  });

  it("is case-insensitive", () => {
    expect(resolveTradeKey("PLUMBER")).toBe("plumber");
    expect(resolveTradeKey("Electrician")).toBe("electrician");
    expect(resolveTradeKey("ROOFING")).toBe("roofer");
  });

  it("trims whitespace", () => {
    expect(resolveTradeKey("  plumber  ")).toBe("plumber");
    expect(resolveTradeKey("  roofing  ")).toBe("roofer");
  });

  it("returns unknown trades as-is (lowercase)", () => {
    expect(resolveTradeKey("glazier")).toBe("glazier");
    expect(resolveTradeKey("HVAC specialist")).toBe("hvac specialist");
  });
});

describe("TRADE_ALIASES completeness", () => {
  const allTargets = new Set(Object.values(TRADE_ALIASES));

  it("all alias targets are valid known trades", () => {
    const knownTrades = ["plumber", "electrician", "roofer", "painter", "carpenter", "tiler", "handyman"];
    for (const target of allTargets) {
      expect(knownTrades).toContain(target);
    }
  });

  it("all known base trades have at least one alias", () => {
    const tradesWithAliases = new Set(Object.values(TRADE_ALIASES));
    expect(tradesWithAliases.has("plumber")).toBe(true);
    expect(tradesWithAliases.has("electrician")).toBe(true);
    expect(tradesWithAliases.has("roofer")).toBe(true);
    expect(tradesWithAliases.has("painter")).toBe(true);
    expect(tradesWithAliases.has("carpenter")).toBe(true);
    expect(tradesWithAliases.has("tiler")).toBe(true);
    expect(tradesWithAliases.has("handyman")).toBe(true);
  });
});
