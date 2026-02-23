function parseHHMM(hhmm: string): { h: number; m: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

// Lightweight business-hours helper without heavy deps.
// Assumes server runs in configured timezone or PUBLIC_BASE_URL is hosted accordingly.
export function isWithinHours(opts: {
  startHHMM: string;
  endHHMM: string;
  timeZone?: string;
  now?: Date;
}): boolean {
  const start = parseHHMM(opts.startHHMM);
  const end = parseHHMM(opts.endHHMM);
  if (!start || !end) return true;

  const now = opts.now ?? new Date();
  let hours = now.getHours();
  let mins = now.getMinutes();
  if (opts.timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: opts.timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(now);
      const h = parts.find((p) => p.type === "hour")?.value;
      const m = parts.find((p) => p.type === "minute")?.value;
      if (h != null && m != null) {
        hours = Number(h);
        mins = Number(m);
      }
    } catch {
      // If timezone invalid, fallback to server local time.
    }
  }
  const minutes = hours * 60 + mins;
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;

  if (startMin === endMin) return true;
  if (startMin < endMin) return minutes >= startMin && minutes < endMin;
  // overnight window (e.g. 22:00-06:00)
  return minutes >= startMin || minutes < endMin;
}

