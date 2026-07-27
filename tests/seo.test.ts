import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_DIR = join(process.cwd(), "public");
const read = (f: string) => readFileSync(join(PUBLIC_DIR, f), "utf8");

/** Pages deliberately kept out of the index. */
const NOINDEX_PAGES = ["demo.html"];

function htmlPages(): string[] {
  return readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".html"));
}

describe("robots.txt", () => {
  const robots = read("robots.txt");

  it("points crawlers at the sitemap", () => {
    expect(robots).toMatch(/^Sitemap: https:\/\/www\.getpickupai\.com\.au\/sitemap\.xml$/m);
  });

  it("keeps crawlers out of authenticated and side-effecting routes", () => {
    // /r/ matters most: it is the SMS click tracker, and a crawler walking it
    // would write real funnel events attributed to bot traffic.
    for (const path of ["/dashboard/", "/admin/", "/api/", "/twilio/", "/r/"]) {
      expect(robots, `robots.txt should disallow ${path}`).toContain(`Disallow: ${path}`);
    }
  });
});

describe("sitemap.xml", () => {
  const sitemap = read("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it("lists at least the home page", () => {
    expect(locs).toContain("https://www.getpickupai.com.au/");
  });

  it("uses absolute https URLs on the canonical host", () => {
    for (const loc of locs) {
      expect(loc, loc).toMatch(/^https:\/\/www\.getpickupai\.com\.au\//);
    }
  });

  it("never lists a noindex page", () => {
    // Search Console reports a sitemapped noindex URL as an error, and it is
    // an easy mistake to make when adding a page.
    for (const page of NOINDEX_PAGES) {
      const slug = page.replace(/\.html$/, "");
      expect(locs.some((l) => l.endsWith(`/${slug}`)), `${page} is noindex`).toBe(false);
    }
  });
});

describe("indexable pages carry the basics", () => {
  for (const page of htmlPages()) {
    const html = read(page);
    const isNoindex = NOINDEX_PAGES.includes(page) || /name="robots"[^>]*noindex/.test(html);
    if (isNoindex) continue;

    it(`${page} has a title, description, canonical and en-AU lang`, () => {
      expect(html, "title").toMatch(/<title>[^<]{10,}<\/title>/);
      expect(html, "description").toMatch(/<meta name="description" content="[^"]{30,}"/);
      expect(html, "canonical").toMatch(/<link rel="canonical" href="https:\/\/www\.getpickupai\.com\.au/);
      // The whole product is Australian; "en" loses the regional signal.
      expect(html, "lang").toContain('lang="en-AU"');
    });

    it(`${page} has exactly one h1`, () => {
      expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    });
  }
});

describe("structured data matches the visible page", () => {
  const html = read("index.html");
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const graph = JSON.parse(block![1])["@graph"] as Array<Record<string, any>>;

  it("is valid JSON-LD with the expected types", () => {
    expect(block, "index.html has no JSON-LD block").toBeTruthy();
    const types = graph.map((n) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("FAQPage");
  });

  it("every FAQ question in the markup is visible on the page", () => {
    // Google treats structured data that contradicts the rendered page as a
    // manual-action offence, so this drifting is worse than having no markup.
    const visible = [...html.matchAll(/<summary[^>]*>([^<]+)<\/summary>/g)].map((m) => m[1].trim());
    const faq = graph.find((n) => n["@type"] === "FAQPage")!;
    for (const q of faq.mainEntity) {
      expect(visible, `"${q.name}" is in the markup but not on the page`).toContain(q.name);
    }
  });

  it("every FAQ answer in the markup appears on the page", () => {
    const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    const faq = graph.find((n) => n["@type"] === "FAQPage")!;
    for (const q of faq.mainEntity) {
      // Compare a distinctive slice rather than the whole answer, which may be
      // trimmed for the markup.
      const probe = q.acceptedAnswer.text.split(". ")[0].trim();
      expect(stripped, `answer to "${q.name}" not found on page`).toContain(probe);
    }
  });

  it("the advertised price matches the price in the markup", () => {
    const offer = graph.find((n) => n["@type"] === "SoftwareApplication")?.offers;
    expect(offer?.priceCurrency).toBe("AUD");
    expect(html, `page should show $${offer.price.replace(".00", "")}`).toContain(
      `$${offer.price.replace(".00", "")}`
    );
  });
});
