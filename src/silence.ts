/**
 * Dependency-free silent MP3 buffer generator.
 *
 * Produces valid MPEG2 Layer III frames at 24 kHz mono (matching OpenAI TTS
 * output) filled with silence.  Each frame is 96 bytes / ~24 ms.
 */

const FRAME_SAMPLES = 576;
const SAMPLE_RATE = 24_000;
const MS_PER_FRAME = (FRAME_SAMPLES / SAMPLE_RATE) * 1000; // ~24 ms

// 96-byte MPEG2 Layer III silent frame:
//   Header  (4 B): 0xFF 0xF3 0x44 0xC0
//     sync=0xFFF, MPEG2, Layer III, no CRC, 32 kbps, 24 kHz, mono
//   Side info (9 B): all zeros  → main_data_begin=0, no Huffman data
//   Main data (83 B): all zeros → PCM samples decode to silence
const SILENT_FRAME = Buffer.alloc(96);
SILENT_FRAME[0] = 0xff;
SILENT_FRAME[1] = 0xf3;
SILENT_FRAME[2] = 0x44;
SILENT_FRAME[3] = 0xc0;

/**
 * Return a Buffer containing `durationMs` milliseconds of valid silent MP3.
 */
export function createSilenceMP3(durationMs: number): Buffer {
  const frameCount = Math.max(1, Math.round(durationMs / MS_PER_FRAME));
  const buf = Buffer.alloc(frameCount * 96);
  for (let i = 0; i < frameCount; i++) {
    SILENT_FRAME.copy(buf, i * 96);
  }
  return buf;
}

/**
 * Pick a natural-feeling pause duration (ms) for the gap between two speakers.
 *
 * - AI → Customer  : 400–700 ms  (customers respond fairly quickly)
 * - Customer → AI  : 600–900 ms  (simulates brief "thinking" delay)
 *
 * A small random jitter is added so consecutive gaps don't feel mechanical.
 */
export function getSpeakerChangeDelay(
  current: "ai" | "customer",
  next: "ai" | "customer",
): number {
  const [lo, hi] = current === "ai" && next === "customer"
    ? [400, 700]
    : [600, 900];
  return lo + Math.round(Math.random() * (hi - lo));
}
