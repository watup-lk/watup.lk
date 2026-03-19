export function formatSalary(n: number): string {
  return `LKR ${new Intl.NumberFormat('en-LK').format(n)}`;
}

export function formatSalaryCompact(n: number): string {
  return `LKR ${new Intl.NumberFormat('en-LK', { notation: 'compact', maximumFractionDigits: 0 }).format(n)}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-LK').format(n);
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'just now';
}
