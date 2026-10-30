// Datas como o funcionário lê: horário de Brasília, em português.

const TZ = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** "13:43" se for hoje; "amanhã, 10:00"; senão "sex., 30/10, 10:00". */
export function formatDue(due: Date, now: Date): string {
  const time = due.toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  if (dayKey(due) === dayKey(now)) return time;
  if (dayKey(due) === dayKey(new Date(now.getTime() + DAY_MS))) return `amanhã, ${time}`;
  const date = due.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  return `${date}, ${time}`;
}

export function formatNow(now: Date): string {
  return now.toLocaleString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "16 out" */
export function formatShortDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" })
    .replace(/\s*de\s*/, " ")
    .replace(".", "");
}

/** "16 out, 14:20" */
export function formatShortDateTime(iso: string): string {
  const time = new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatShortDate(iso)}, ${time}`;
}

/** "hoje", "há 1 dia", "há 5 dias" */
export function formatAgo(iso: string, now: Date): string {
  const days = daysSince(iso, now);
  return days === 0 ? "hoje" : `há ${plural(days, "dia", "dias")}`;
}
