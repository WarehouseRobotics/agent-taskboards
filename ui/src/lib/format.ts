export function formatDate(value: string | null) {
  if (!value) {
    return "none";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const byteUnits = ["B", "KiB", "MiB", "GiB", "TiB"] as const;

export function formatBytes(value: number) {
  const bytes = Math.max(0, value);
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    byteUnits.length - 1,
  );
  const scaled = bytes / 1024 ** unitIndex;
  return `${scaled.toFixed(1)} ${byteUnits[unitIndex]}`;
}
