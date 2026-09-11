/**
 * Interpret a datetime-local wall clock string as a time in `timeZone`.
 */
export function wallTimeToDate(wall: string, timeZone: string | null) {
  if (!wall) return new Date(NaN);
  if (!timeZone) return new Date(wall);

  const match = wall.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) return new Date(wall);

  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const h = Number(match[4]);
  const mi = Number(match[5]);
  const s = Number(match[6] || 0);

  const desiredAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let utcMs = desiredAsUtc;

  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(new Date(utcMs), timeZone);
    const shownAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    utcMs += desiredAsUtc - shownAsUtc;
  }

  return new Date(utcMs);
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') bag[p.type] = p.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultDepartValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - (now.getMinutes() % 5) + 5);
  now.setSeconds(0);
  now.setMilliseconds(0);
  return toLocalInputValue(now);
}
