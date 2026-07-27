import { describe, it, expect } from "vitest";

/**
 * The demo fixtures in server.ts are written with Sydney suburbs. The one real
 * organic signup this product has had was a Melbourne business, and the sample
 * lead SMS it showed him carried "10 Station Street, Parramatta NSW 2150".
 *
 * server.ts calls main() on import so its internal helper is unreachable from a
 * test; this pins the behaviour of the same regex against the actual fixture
 * strings. If the fixtures gain a new Sydney suburb, add it in both places.
 */
const DEMO_FIXTURE_SUBURBS = /\b(Parramatta|Chatswood|Penrith)(,?\s*(NSW\s*)?\d{4})?\b/g;
const localiseDemo = (text: string, serviceArea?: string | null): string => {
  const area = (serviceArea ?? "").split(/[,\n;]/)[0].trim();
  if (!area) return text;
  return text.replace(DEMO_FIXTURE_SUBURBS, area);
};

describe("demo localisation", () => {
  it("rewrites a full Sydney address to the tenant's service area", () => {
    expect(localiseDemo("52 Smith Street, Parramatta NSW 2150", "Melbourne"))
      .toBe("52 Smith Street, Melbourne");
  });

  it("handles the fixture variants that appear in the spoken script", () => {
    expect(localiseDemo("I'm in Parramatta, 2150.", "Geelong")).toBe("I'm in Geelong.");
    expect(localiseDemo("Got ya, Parramatta 2150.", "Geelong")).toBe("Got ya, Geelong.");
    expect(localiseDemo("14 Oak Avenue, Chatswood NSW 2067", "Brisbane"))
      .toBe("14 Oak Avenue, Brisbane");
    expect(localiseDemo("21 Park Street, Penrith NSW 2750", "Perth"))
      .toBe("21 Park Street, Perth");
  });

  it("uses only the first area when several are listed", () => {
    // service_area is a free-text box; tenants list several suburbs.
    expect(localiseDemo("Parramatta NSW 2150", "Footscray, Yarraville, Seddon"))
      .toBe("Footscray");
    expect(localiseDemo("Parramatta NSW 2150", "Newport\nAltona")).toBe("Newport");
  });

  it("leaves the fixtures alone when the tenant told us nothing", () => {
    // Better a Sydney fixture than an empty address.
    for (const empty of [null, undefined, "", "   "]) {
      expect(localiseDemo("52 Smith Street, Parramatta NSW 2150", empty))
        .toBe("52 Smith Street, Parramatta NSW 2150");
    }
  });

  it("does not touch text with no fixture suburb in it", () => {
    const line = "Oh no, that sounds really urgent — you've called the right place.";
    expect(localiseDemo(line, "Melbourne")).toBe(line);
  });
});
