const timezonePattern = /(Z|[+-]\d{2}:\d{2})$/i;

export const DISPLAY_TIMEZONE = "America/New_York";

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: DISPLAY_TIMEZONE,
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: DISPLAY_TIMEZONE,
});

export function parseApiDate(value: string): Date {
  const normalized = timezonePattern.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

export function getTimestampMs(value: string): number {
  return parseApiDate(value).getTime();
}

export function formatDisplayDateTime(value: string): string {
  return dateTimeFormatter.format(parseApiDate(value));
}

export function formatDisplayTime(value: string): string {
  return timeFormatter.format(parseApiDate(value));
}

export function formatDisplayTimeMs(value: number): string {
  return timeFormatter.format(new Date(value));
}
