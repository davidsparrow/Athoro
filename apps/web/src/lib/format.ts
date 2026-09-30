const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});
const numberFormat = new Intl.NumberFormat("en-US");

/** "September 30, 2026". Dates are shown in UTC so every reader sees the same record. */
export function formatDate(value: Date | string): string {
  return dateFormat.format(new Date(value));
}

/** "September 30, 2026 at 4:42 PM UTC". */
export function formatDateTime(value: Date | string): string {
  return `${dateTimeFormat.format(new Date(value))} UTC`;
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
