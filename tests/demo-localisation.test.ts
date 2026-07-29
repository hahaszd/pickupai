import { describe, it, expect } from "vitest";
import { localiseDemo } from "../src/utils/demo-localise.js";

/**
 * This file used to declare its own COPY of localiseDemo and assert against
 * that, because server.ts calls main() on import and the helper was declared
 * inside it. Every assertion below passed no matter what server.ts did. The
 * function now lives in src/utils/demo-localise.ts and this imports it, so
 * these assertions finally test the code that runs.
 */
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
