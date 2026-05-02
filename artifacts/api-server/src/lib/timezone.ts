export const TAIPEI_TIME_ZONE = "Asia/Taipei";

function getTaipeiParts(input: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(input);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

export function ensureProcessTimeZone() {
  if (!process.env.TZ) {
    process.env.TZ = TAIPEI_TIME_ZONE;
  }
}

export function taipeiDate(input: Date = new Date()): string {
  const p = getTaipeiParts(input);
  return `${p.year}-${p.month}-${p.day}`;
}

export function taipeiMonth(input: Date = new Date()): string {
  const p = getTaipeiParts(input);
  return `${p.year}-${p.month}`;
}

export function taipeiCompactDate(input: Date = new Date()): string {
  const p = getTaipeiParts(input);
  return `${p.year}${p.month}${p.day}`;
}

