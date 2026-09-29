export const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-NG").format(Math.round(n)).replace(/,/g, " ");

export function fmtDuration(hours: number | null | undefined) {
  if (hours == null) return "—";
  if (hours < 1) return "< 1 hour";
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

export const fmtDate = (s: string | Date) =>
  new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const fmtDateTime = (s: string | Date) =>
  new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function timeAgo(s: string) {
  const m = (Date.now() - new Date(s).getTime()) / 60000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export const label = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";

export const pct = (n: number) => `${Math.round(n)} %`;
