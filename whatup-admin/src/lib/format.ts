const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Compact timestamp for list rows: time if today, "Yesterday", else short date. */
export function formatListTimestamp(iso: string): string {
  const date = new Date(iso);
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  if (day === today) return formatTime(iso);
  if (day === today - DAY_MS) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Full day label for chat date separators. */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  if (day === today) return 'Today';
  if (day === today - DAY_MS) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** "+15551234567" -> "+1 555 123 4567" (best effort, display only). */
export function formatPhoneNumber(e164: string): string {
  const m = e164.match(/^\+(\d)(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  return e164;
}

/** Stable two-letter tag for the avatar circle, derived from the number. */
export function avatarInitials(e164: string): string {
  return e164.replace(/\D/g, '').slice(-2);
}
