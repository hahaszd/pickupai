/**
 * THESE SCRIPTS ARE A PRODUCT PROMISE. Every line is spoken to a prospect on
 * the landing pages, so a demo that shows behaviour the product does not have
 * is a misrepresentation, not a mock-up.
 *
 * Rewritten 2026-08-03. Every script previously demonstrated all four of the
 * things the product spent two days removing:
 *   - "I've flagged this as urgent"     — nothing is flagged; urgency was
 *                                          deleted 2026-07-28
 *   - "likely within the hour"           — a time promise (PRINCIPLES 3)
 *   - "someone will be in touch"         — promises a person (PRINCIPLES 3)
 *   - "Safety tip: avoid touching the switchboard", "put a bucket under the
 *     drip"                              — safety advice, and asking the caller
 *                                          to act (PRINCIPLES 8)
 *
 * Before adding a line, read PRINCIPLES.md. The receptionist records, promises
 * nothing, gives no advice, and asks nobody to do anything to the property.
 *
 * NOTE: editing this file does NOT change what a visitor hears. The rendered
 * MP3s in public/demos/ are checked in and served directly. Regenerate them.
 */
/**
 * generate-demos.ts
 *
 * Generates all 16 demo audio files (4 trades × 4 scenarios) for the landing page
 * using the OpenAI TTS REST API. Files are saved to public/demos/.
 *
 * Usage:  npx tsx scripts/generate-demos.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { createSilenceMP3, getSpeakerChangeDelay } from "../src/silence.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "demos");

// ── Voices ───────────────────────────────────────────────────────────────────
type Voice = "nova" | "onyx" | "shimmer";
const AI_VOICE: Voice     = "nova";    // AI receptionist — bright friendly female
const MALE_VOICE: Voice   = "onyx";    // male customer
const FEMALE_VOICE: Voice = "shimmer"; // female customer

interface Line { speaker: "ai" | "customer"; text: string; }

// ── All 16 demo scripts ───────────────────────────────────────────────────────
const DEMOS: Array<{ id: string; customerVoice: Voice; lines: Line[] }> = [

  // ── PLUMBER ─────────────────────────────────────────────────────────────────

  {
    id: "plumber-emergency",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "G'day! Thanks for calling Sydney Plumbing Co, this is Olivia — how can I help you today?" },
      { speaker: "customer", text: "Hi yeah, look I've got a burst pipe under my kitchen sink and there's water going everywhere." },
      { speaker: "ai",       text: "Oh no — okay. Let me get your details down and straight across to the team. Can I grab your name first?" },
      { speaker: "customer", text: "Yeah, it's Mark." },
      { speaker: "ai",       text: "Thanks Mark. Whereabouts are you located? Suburb and postcode would be great." },
      { speaker: "customer", text: "I'm in Parramatta, 2150." },
      { speaker: "ai",       text: "Got ya, Parramatta 2150. And what's the best number to reach you on — is it the one you're calling from?" },
      { speaker: "customer", text: "Yeah that's fine, same number." },
      { speaker: "ai",       text: "Perfect. Just so you know, I'm an AI assistant so I can't book someone in directly, but everything you've told me is going straight to the team. Is there anything else you'd like to pass on to them?" },
      { speaker: "customer", text: "No, just please hurry — there's water all over the floor." },
      { speaker: "ai",       text: "No dramas at all Mark, it's all with the team now. Cheers, take care!" },
    ],
  },

  {
    id: "plumber-quote",
    customerVoice: FEMALE_VOICE,
    lines: [
      { speaker: "ai",       text: "Hi there, thanks for calling Sydney Plumbing Co! Olivia speaking — how can I help?" },
      { speaker: "customer", text: "Oh hi, yeah I'm looking to get a quote for a bathroom renovation. I want to move the shower and add a new vanity." },
      { speaker: "ai",       text: "Sounds like a great project! We can definitely help with that. Can I grab your name to get started?" },
      { speaker: "customer", text: "It's Jenny." },
      { speaker: "ai",       text: "Thanks Jenny. And what suburb are you in? Postcode as well if you've got it." },
      { speaker: "customer", text: "Penrith, 2750." },
      { speaker: "ai",       text: "Penrith 2750 — got that. Is there a second number we can reach you on, or is this mobile the best one?" },
      { speaker: "customer", text: "This mobile is fine." },
      { speaker: "ai",       text: "Beauty. Just so you're across it — I'm an AI receptionist, so I can't give you a price or lock in a time, but I've got all your details and they're going straight to the team. Any other details you'd like to add about the job?" },
      { speaker: "customer", text: "The bathroom is about three by two metres, and I've already got tiles picked out." },
      { speaker: "ai",       text: "Brilliant, I've noted that down. it's all with the team now — cheers Jenny, have a great day!" },
    ],
  },

  {
    id: "plumber-followup",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "G'day, Sydney Plumbing Co — Olivia here, how can I help?" },
      { speaker: "customer", text: "Hi yeah, I had one of your guys come out last week to fix a hot water system. I just wanted to follow up — there's still a small leak and I'm not sure if it's related." },
      { speaker: "ai",       text: "Ah right-o, thanks for letting us know. I'm sorry to hear there's still an issue — I'll make sure the team looks into it. Can I get your name?" },
      { speaker: "customer", text: "Dave Cooper." },
      { speaker: "ai",       text: "Thanks Dave. And your suburb and postcode?" },
      { speaker: "customer", text: "Baulkham Hills, 2153." },
      { speaker: "ai",       text: "Got ya, Baulkham Hills 2153. And is this the best number to reach you on?" },
      { speaker: "customer", text: "Yeah this one's fine." },
      { speaker: "ai",       text: "Perfect. Look, I want to be upfront — I'm an AI so I can't access the job history right now, but I've got it down as a follow-up from previous work and it's going straight to the team, who'll have the original job notes. Anything else you'd like to add?" },
      { speaker: "customer", text: "No that's it, I just want it fixed properly." },
      { speaker: "ai",       text: "Totally understand Dave — I've got all of that down and it's going to the team. Cheers!" },
    ],
  },

  {
    id: "plumber-afterhours",
    customerVoice: FEMALE_VOICE,
    lines: [
      { speaker: "ai",       text: "Hi, thanks for calling Sydney Plumbing Co — you've reached us after hours. This is Olivia, how can I help?" },
      { speaker: "customer", text: "Oh hi, I've got a blocked drain in my laundry. It's not an emergency but it's been getting worse over the past couple of days." },
      { speaker: "ai",       text: "No worries, we can definitely get that sorted for you. Can I grab your name?" },
      { speaker: "customer", text: "It's Angela." },
      { speaker: "ai",       text: "Thanks Angela. And what suburb are you in?" },
      { speaker: "customer", text: "Castle Hill, 2154." },
      { speaker: "ai",       text: "Castle Hill 2154 — got it. And what's the best number to reach you on?" },
      { speaker: "customer", text: "0401 222 333." },
      { speaker: "ai",       text: "Brilliant, I've got all of that down. Just so you know, I'm an AI so I can't book anything in or give you a time — but everything you've told me is going straight to the team. Anything else?" },
      { speaker: "customer", text: "No that's fine, thank you." },
      { speaker: "ai",       text: "No worries at all Angela — it's all with the team now. Have a good evening, cheers!" },
    ],
  },

  // ── ELECTRICIAN ──────────────────────────────────────────────────────────────

  {
    id: "electrician-emergency",
    customerVoice: FEMALE_VOICE,
    lines: [
      { speaker: "ai",       text: "G'day, Olivia here from City Electrical — how are you going today?" },
      { speaker: "customer", text: "Hi, yeah look, I've got a power point that's been sparking when I plug things in. I'm a bit worried about it." },
      { speaker: "ai",       text: "Right-o — sparking outlets, I've got that down. Can I grab your name?" },
      { speaker: "customer", text: "It's Sarah." },
      { speaker: "ai",       text: "Thanks Sarah. And where's the property? Suburb and postcode?" },
      { speaker: "customer", text: "I'm in Chatswood, 2067." },
      { speaker: "ai",       text: "Chatswood 2067, got that. And what's the best number to reach you on?" },
      { speaker: "customer", text: "0412 345 678." },
      { speaker: "ai",       text: "Brilliant. Just to be upfront, I'm an AI receptionist, so I can't confirm a booking or tell you how quickly someone can get there — but I've written down exactly what you've told me and it's going straight to the team at City Electrical. Is there anything else?" },
      { speaker: "customer", text: "No, that's all. Thanks for your help." },
      { speaker: "ai",       text: "No worries at all Sarah — it's all with the team now. Have a good one!" },
    ],
  },

  {
    id: "electrician-quote",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "Hi there, City Electrical — Olivia speaking, how can I help?" },
      { speaker: "customer", text: "Yeah g'day. I've just converted my garage into a home office and I need a couple of extra power points put in. Wanted to get a quote." },
      { speaker: "ai",       text: "Yep, no dramas — that's something we do all the time. Can I get your name?" },
      { speaker: "customer", text: "It's Chris." },
      { speaker: "ai",       text: "Thanks Chris. And your suburb and postcode?" },
      { speaker: "customer", text: "Hornsby, 2077." },
      { speaker: "ai",       text: "Got ya, Hornsby 2077. What's the best number to reach you on — this one or another?" },
      { speaker: "customer", text: "This one's fine." },
      { speaker: "ai",       text: "Perfect. How many power points are you thinking and do you have a rough idea where in the garage you'd want them?" },
      { speaker: "customer", text: "Probably four — two on each side wall." },
      { speaker: "ai",       text: "Great, I've noted that down. I'm an AI so I can't give you a price — the team works that out with you directly, and they've got all of this now. Anything else to add?" },
      { speaker: "customer", text: "No that covers it, thanks." },
      { speaker: "ai",       text: "Beauty Chris — it's all with the team now. Have a ripper day!" },
    ],
  },

  {
    id: "electrician-followup",
    customerVoice: FEMALE_VOICE,
    lines: [
      { speaker: "ai",       text: "G'day, City Electrical — Olivia here, how can I help?" },
      { speaker: "customer", text: "Hi, I called last week about getting a switchboard upgrade and someone said they'd get back to me with a quote but I haven't heard anything." },
      { speaker: "ai",       text: "Ah, sorry about that — I'll get this written down and straight through. Can I grab your name?" },
      { speaker: "customer", text: "Karen Mitchell." },
      { speaker: "ai",       text: "Thanks Karen. And your suburb and postcode?" },
      { speaker: "customer", text: "Epping, 2121." },
      { speaker: "ai",       text: "Epping 2121, got it. And the best number to reach you on?" },
      { speaker: "customer", text: "0417 888 000." },
      { speaker: "ai",       text: "Perfect. Just so you're aware, I'm an AI so I can't pull up the previous enquiry directly, but I've got it down as a follow-up on a switchboard quote and it's with the team now. Really sorry for the delay." },
      { speaker: "customer", text: "No worries, I just wanted to make sure it hadn't been forgotten." },
      { speaker: "ai",       text: "Absolutely understood Karen — I've got all of that down and it's going to the team, cheers!" },
    ],
  },

  {
    id: "electrician-afterhours",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "Hi, you've reached City Electrical after hours — Olivia here. How can I help?" },
      { speaker: "customer", text: "Yeah hi, the lights in my living room have been flickering on and off for the past hour. It's not a full outage but it's a bit odd." },
      { speaker: "ai",       text: "Right-o, flickering lights can be a sign of a loose connection or a circuit issue — worth getting looked at. Can I grab your name?" },
      { speaker: "customer", text: "It's Phil." },
      { speaker: "ai",       text: "Thanks Phil. Suburb and postcode?" },
      { speaker: "customer", text: "Ryde, 2112." },
      { speaker: "ai",       text: "Ryde 2112 — got that. And the best number to reach you on?" },
      { speaker: "customer", text: "Same as this one." },
      { speaker: "ai",       text: "Perfect, that's all down and going straight to the team. I'm an AI so I can't dispatch anyone or tell you what to do about it — I'm not the sparky. Anything else you want me to pass on?" },
      { speaker: "customer", text: "No that's fine, thanks for the info." },
      { speaker: "ai",       text: "No worries Phil — it's all with the team now. Have a good night, cheers!" },
    ],
  },

  // ── HANDYMAN ─────────────────────────────────────────────────────────────────

  {
    id: "handyman-emergency",
    customerVoice: FEMALE_VOICE,
    lines: [
      { speaker: "ai",       text: "G'day, All Trades Handyman — Olivia speaking, how can I help?" },
      { speaker: "customer", text: "Hi, I've got a leaking tap in my laundry and it's gotten really bad — water's starting to pool on the floor. I'm a bit panicked." },
      { speaker: "ai",       text: "Oh no — okay, let me get this down for you now. Can I grab your name?" },
      { speaker: "customer", text: "Lisa." },
      { speaker: "ai",       text: "Thanks Lisa. And what suburb are you in?" },
      { speaker: "customer", text: "Blacktown, 2148." },
      { speaker: "ai",       text: "Blacktown 2148 — got it. And the best number to reach you on?" },
      { speaker: "customer", text: "0405 111 222." },
      { speaker: "ai",       text: "Perfect, I'm an AI so I can't dispatch someone directly, but everything you've told me is going straight to the team. Is the water still coming out now, or has it stopped?" },
      { speaker: "customer", text: "Yes, I just got it turned off." },
      { speaker: "ai",       text: "it's all with the team now. Hang tight Lisa, cheers!" },
    ],
  },

  {
    id: "handyman-quote",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "Hi there, you've reached All Trades Handyman! Olivia speaking — how's your day going?" },
      { speaker: "customer", text: "Yeah not bad, thanks. Look, I've got a couple of jobs I need done — some fence panels that need replacing and a leaky tap in the bathroom." },
      { speaker: "ai",       text: "Sounds good, we can definitely help with both of those. Can I start with your name?" },
      { speaker: "customer", text: "It's Tom." },
      { speaker: "ai",       text: "Thanks Tom. And what suburb are you in? Postcode as well if you've got it." },
      { speaker: "customer", text: "North Ryde, 2113." },
      { speaker: "ai",       text: "Got ya, North Ryde 2113. What's the best number to reach you on?" },
      { speaker: "customer", text: "Same number as this one's fine." },
      { speaker: "ai",       text: "Perfect. Just to be upfront — I'm an AI, so I can't give you a quote or lock in a time, but I've got all your details and they're with the team at All Trades Handyman now. Anything else you'd like to add?" },
      { speaker: "customer", text: "No that's it, thanks." },
      { speaker: "ai",       text: "Beauty! All your details are in — it's all with the team now. Cheers for calling, have a lovely day!" },
    ],
  },

  {
    id: "handyman-followup",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "G'day, All Trades Handyman — Olivia here, how can I help?" },
      { speaker: "customer", text: "Hi yeah, I got a quote from you guys about two weeks ago for a deck repair and I just wanted to follow up and see if we can get it booked in." },
      { speaker: "ai",       text: "Of course, happy to follow that up for you. Can I get your name?" },
      { speaker: "customer", text: "Michael Green." },
      { speaker: "ai",       text: "Thanks Michael. And your suburb and postcode?" },
      { speaker: "customer", text: "St Ives, 2075." },
      { speaker: "ai",       text: "St Ives 2075 — got it. And the best number to reach you on?" },
      { speaker: "customer", text: "0422 999 111." },
      { speaker: "ai",       text: "Perfect. I'm an AI so I can't pull up the original quote right now, but I've got it down as a follow-up on a deck repair quote and it's with the team. Are you flexible on dates?" },
      { speaker: "customer", text: "Yeah pretty flexible, I'd just like it done before next month." },
      { speaker: "ai",       text: "Got it — noted. it's all with the team now. Thanks for your patience Michael, cheers!" },
    ],
  },

  {
    id: "handyman-afterhours",
    customerVoice: FEMALE_VOICE,
    lines: [
      { speaker: "ai",       text: "Hi, All Trades Handyman — you've reached us after hours. Olivia here, how can I help?" },
      { speaker: "customer", text: "Oh hi, I noticed tonight that my front door lock isn't working properly — the key turns but it's not latching. I'm a bit worried about security." },
      { speaker: "ai",       text: "Yep, got it — the front door lock isn't working. Can I grab your name?" },
      { speaker: "customer", text: "It's Rachel." },
      { speaker: "ai",       text: "Thanks Rachel. And your suburb and postcode?" },
      { speaker: "customer", text: "Manly, 2095." },
      { speaker: "ai",       text: "Manly 2095 — got it. And what's the best number to reach you on?" },
      { speaker: "customer", text: "0411 777 888." },
      { speaker: "ai",       text: "Perfect, I've written down that the front door won't lock. I'm an AI so I can't send anyone out or tell you what to do in the meantime — but the team's got all of this now. Anything else you'd like me to pass on?" },
      { speaker: "customer", text: "Yeah there's a chain, I'll put that on. Thanks." },
      { speaker: "ai",       text: "No worries at all. It's all with the team now Rachel — take care, cheers!" },
    ],
  },

  // ── ROOFER ───────────────────────────────────────────────────────────────────

  {
    id: "roofer-emergency",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "G'day, ProRoof — Olivia here, how can I help?" },
      { speaker: "customer", text: "Yeah hi, I've got water coming through my ceiling — the roof is leaking badly and it's been raining all day. I'm pretty stressed." },
      { speaker: "ai",       text: "Oh that's not good at all — a roof leak in the rain is definitely urgent. Let's get your details through to the team right away. Can I grab your name?" },
      { speaker: "customer", text: "It's Ryan." },
      { speaker: "ai",       text: "Thanks Ryan. Suburb and postcode?" },
      { speaker: "customer", text: "Cronulla, 2230." },
      { speaker: "ai",       text: "Cronulla 2230 — got it. And the best number to reach you on?" },
      { speaker: "customer", text: "Same as this one." },
      { speaker: "ai",       text: "Perfect. I'm an AI so I can't book someone in or tell you what to do in the meantime — I can't see it and I'm not the tradesperson. But everything you've told me is going straight to the team. Anything else?" },
      { speaker: "customer", text: "No, just please hurry — it's getting worse." },
      { speaker: "ai",       text: "Absolutely Ryan — it's all with the team now. Hang in there, cheers!" },
    ],
  },

  {
    id: "roofer-quote",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "Hi there, ProRoof — Olivia speaking, how can I help?" },
      { speaker: "customer", text: "Yeah hi, I'm looking to get a full roof replacement quote. The current roof is about 30 years old and I think it's time." },
      { speaker: "ai",       text: "Yep, sounds like the right call — our team can do a full assessment and quote for you. Can I grab your name first?" },
      { speaker: "customer", text: "It's Greg." },
      { speaker: "ai",       text: "Thanks Greg. And what suburb are you in? Postcode too if you've got it." },
      { speaker: "customer", text: "Miranda, 2228." },
      { speaker: "ai",       text: "Miranda 2228 — got it. And the best number to reach you on?" },
      { speaker: "customer", text: "0488 444 555." },
      { speaker: "ai",       text: "Perfect. Do you have a rough idea of the roof size, or what material it's currently made of? Tile, metal, that kind of thing?" },
      { speaker: "customer", text: "It's terracotta tiles. The house is a standard four-bedroom." },
      { speaker: "ai",       text: "Got it, noted. I'm an AI so I can't quote on the spot — the team sorts pricing out with you directly, and they've got everything now. Anything else?" },
      { speaker: "customer", text: "No that covers it, cheers." },
      { speaker: "ai",       text: "Beauty Greg — it's all with the team now. Have a great day!" },
    ],
  },

  {
    id: "roofer-followup",
    customerVoice: FEMALE_VOICE,
    lines: [
      { speaker: "ai",       text: "G'day, ProRoof — Olivia here, how can I help?" },
      { speaker: "customer", text: "Hi, one of your guys came out last week to look at my roof and said he'd send through a quote by the end of the week, but I haven't received it yet." },
      { speaker: "ai",       text: "Ah sorry about that — I'll get this written down and straight through. Can I grab your name?" },
      { speaker: "customer", text: "Sandra Webb." },
      { speaker: "ai",       text: "Thanks Sandra. And your suburb and postcode?" },
      { speaker: "customer", text: "Sutherland, 2232." },
      { speaker: "ai",       text: "Sutherland 2232 — got it. And the best number to reach you on?" },
      { speaker: "customer", text: "0432 100 200." },
      { speaker: "ai",       text: "Perfect. I'm an AI so I can't look up the job directly, but I've got all of that down and it's with the team now. Sorry again for the delay Sandra." },
      { speaker: "customer", text: "That's okay, I just wanted to make sure it hadn't been forgotten." },
      { speaker: "ai",       text: "Absolutely — I've got all of that down for the team. Thanks for your patience, cheers!" },
    ],
  },

  {
    id: "roofer-afterhours",
    customerVoice: MALE_VOICE,
    lines: [
      { speaker: "ai",       text: "Hi, ProRoof — you've reached us after hours. Olivia here, how can I help?" },
      { speaker: "customer", text: "Yeah hi, I noticed after the storm today that a few of my roof tiles look like they've shifted or gone missing. It's not leaking yet but I want to get it sorted before the next rain." },
      { speaker: "ai",       text: "Yep, smart thinking — missing or shifted tiles can let water in quickly. Can I grab your name?" },
      { speaker: "customer", text: "It's Brett." },
      { speaker: "ai",       text: "Thanks Brett. And your suburb and postcode?" },
      { speaker: "customer", text: "Campbelltown, 2560." },
      { speaker: "ai",       text: "Campbelltown 2560 — got it. And the best number to reach you on?" },
      { speaker: "customer", text: "Same as this one." },
      { speaker: "ai",       text: "Perfect, that's all written down in your words. I'm an AI so I can't arrange an inspection or tell you how urgent it is — that's the team's call, and they've got it now. Anything else?" },
      { speaker: "customer", text: "No that's it, thanks." },
      { speaker: "ai",       text: "No worries Brett — it's all with the team now. Cheers, have a good night!" },
    ],
  },
];

// ── OpenAI TTS via fetch ──────────────────────────────────────────────────────

async function ttsChunk(text: string, voice: Voice): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "tts-1", voice, input: text, response_format: "mp3", speed: 1.0 }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TTS API error ${res.status}: ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── Generate one demo file ────────────────────────────────────────────────────

async function generateDemo(demo: typeof DEMOS[0]): Promise<void> {
  const outPath = path.join(OUT_DIR, `${demo.id}.mp3`);

  // Skip if already generated (re-run safety). Pass --force to re-render.
  //
  // This default is why the header's "Regenerate them" instruction could be
  // followed and still do nothing: a script whose whole purpose is to bring
  // the audio back in line with the script silently refuses to overwrite. On
  // 2026-08-17 four MP3s were still speaking lines deleted from this file.
  if (fs.existsSync(outPath) && !process.argv.includes("--force")) {
    console.log(`  ⏭  Skipping ${demo.id}.mp3 — already exists (--force to re-render)`);
    return;
  }

  console.log(`\n🎙  ${demo.id}`);
  const chunks: Buffer[] = [];

  for (let i = 0; i < demo.lines.length; i++) {
    const { speaker, text } = demo.lines[i];
    const voice: Voice = speaker === "ai" ? AI_VOICE : demo.customerVoice;
    process.stdout.write(`  [${i + 1}/${demo.lines.length}] ${speaker === "ai" ? "AI" : "Customer"}: ${text.slice(0, 65)}…\r`);
    chunks.push(await ttsChunk(text, voice));

    if (i < demo.lines.length - 1) {
      const nextSpeaker = demo.lines[i + 1].speaker;
      chunks.push(createSilenceMP3(getSpeakerChangeDelay(speaker, nextSpeaker)));
    }
  }

  const combined = Buffer.concat(chunks);
  fs.writeFileSync(outPath, combined);
  console.log(`  ✅ ${demo.id}.mp3  (${Math.round(combined.length / 1024)} KB)          `);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌  OPENAI_API_KEY not found in environment.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Regenerate a subset by id: `npx tsx scripts/generate-demos.ts plumber-emergency …`
  //
  // TTS output is not deterministic, so re-rendering a scenario whose script
  // has not changed still rewrites its MP3 — and these files are checked in.
  // Without this, fixing one line churns sixteen binaries and the diff stops
  // showing which demo actually changed.
  const only = process.argv.slice(2).filter(a => !a.startsWith("-"));
  const unknown = only.filter(id => !DEMOS.some(d => d.id === id));
  if (unknown.length) {
    console.error(`❌  No such demo id: ${unknown.join(", ")}`);
    console.error(`    Available: ${DEMOS.map(d => d.id).join(", ")}`);
    process.exit(1);
  }
  const todo = only.length ? DEMOS.filter(d => only.includes(d.id)) : DEMOS;

  console.log(`Output → ${OUT_DIR}`);
  console.log(`Generating ${todo.length} of ${DEMOS.length} demo files…`);

  for (const demo of todo) {
    await generateDemo(demo);
  }

  console.log(`\n🎉  Done! ${todo.length} file(s) written to public/demos/`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
