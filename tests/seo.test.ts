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

function jsonLdGraph(html: string): Array<Record<string, any>> | null {
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!block) return null;
  const parsed = JSON.parse(block[1]);
  return parsed["@graph"] ?? [parsed];
}

describe("structured data matches the visible page", () => {
  // Runs across every page that carries JSON-LD, so a new marketing page is
  // covered the moment it lands rather than when someone remembers to add a
  // test. Google treats markup that contradicts the rendered page as a
  // manual-action offence, which makes drifted markup worse than none.
  for (const page of htmlPages()) {
    const html = read(page);
    const graph = jsonLdGraph(html);
    if (!graph) continue;

    it(`${page}: JSON-LD parses and declares a type`, () => {
      expect(graph.length).toBeGreaterThan(0);
      for (const node of graph) expect(node["@type"], `node without @type in ${page}`).toBeTruthy();
    });

    const faq = graph.find((n) => n["@type"] === "FAQPage");
    if (faq) {
      it(`${page}: every FAQ question in the markup is visible on the page`, () => {
        const visible = [...html.matchAll(/<summary[^>]*>([^<]+)<\/summary>/g)].map((m) => m[1].trim());
        for (const q of faq.mainEntity) {
          expect(visible, `"${q.name}" is in the markup but not on the page`).toContain(q.name);
        }
      });

      it(`${page}: every FAQ answer in the markup appears on the page`, () => {
        const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
        for (const q of faq.mainEntity) {
          // A distinctive slice rather than the whole answer, which may be
          // trimmed differently for the markup.
          const probe = q.acceptedAnswer.text.split(". ")[0].trim();
          expect(stripped, `answer to "${q.name}" not found on page`).toContain(probe);
        }
      });
    }

    const offerNode = graph.find((n) => n.offers)?.offers;
    if (offerNode) {
      it(`${page}: the advertised price matches the price in the markup`, () => {
        expect(offerNode.priceCurrency).toBe("AUD");
        expect(html, `page should show $${offerNode.price.replace(".00", "")}`).toContain(
          `$${offerNode.price.replace(".00", "")}`
        );
      });
    }
  }
});

describe("marketing pages are reachable and linked", () => {
  const sitemap = read("sitemap.xml");
  const slugs = [...sitemap.matchAll(/<loc>https:\/\/www\.getpickupai\.com\.au\/([^<]*)<\/loc>/g)]
    .map((m) => m[1])
    .filter(Boolean);

  it("every sitemapped URL has a file behind it", () => {
    // A sitemap entry with no page is a 404 reported straight back to Search
    // Console, which is worse than never listing it.
    const files = new Set(htmlPages().map((f) => f.replace(/\.html$/, "")));
    for (const slug of slugs) {
      expect(files.has(slug), `sitemap lists /${slug} but public/${slug}.html does not exist`).toBe(true);
    }
  });

  it("the trade pages cross-link to each other", () => {
    // Orphan pages are crawled late and rank worse; internal links are the
    // cheapest fix and the easiest to forget when adding the next trade.
    const tradePages = htmlPages().filter((f) => f.startsWith("ai-receptionist-for-"));
    if (tradePages.length < 2) return;
    for (const page of tradePages) {
      const html = read(page);
      const others = tradePages.filter((p) => p !== page).map((p) => p.replace(/\.html$/, ""));
      const linksToAnother = others.some((slug) => html.includes(`/${slug}`));
      expect(linksToAnother, `${page} links to no other trade page`).toBe(true);
    }
  });
});
