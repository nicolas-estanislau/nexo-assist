// Expediente do service desk: segunda a sexta, das 8h às 18h, horário de Brasília.
// Brasília não tem horário de verão desde 2019, então um offset fixo (UTC-3) é suficiente.
// Feriados ficam fora do escopo do protótipo.

const OFFSET_MS = -3 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const OPENING_HOUR = 8;
export const CLOSING_HOUR = 18;
export const BUSINESS_MINUTES_PER_DAY = (CLOSING_HOUR - OPENING_HOUR) * 60;

/** Representa o horário local como um Date cujos campos UTC são os campos locais. */
function toLocal(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}

function fromLocal(local: Date): Date {
  return new Date(local.getTime() - OFFSET_MS);
}

function atHour(local: Date, hour: number): Date {
  const d = new Date(local);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function isWeekend(local: Date): boolean {
  const day = local.getUTCDay();
  return day === 0 || day === 6;
}

function nextDayOpening(local: Date): Date {
  const d = atHour(local, OPENING_HOUR);
  d.setUTCDate(d.getUTCDate() + 1);
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Leva o horário para o próximo instante dentro do expediente (ou mantém, se já estiver). */
function alignToBusinessTime(local: Date): Date {
  if (isWeekend(local)) {
    const d = atHour(local, OPENING_HOUR);
    while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  if (local < atHour(local, OPENING_HOUR)) return atHour(local, OPENING_HOUR);
  if (local >= atHour(local, CLOSING_HOUR)) return nextDayOpening(local);
  return local;
}

export function isWithinBusinessHours(date: Date): boolean {
  const local = toLocal(date);
  return alignToBusinessTime(local).getTime() === local.getTime();
}

/** Soma minutos de expediente a uma data, pulando noites e fins de semana. */
export function addBusinessMinutes(from: Date, minutes: number): Date {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new RangeError(`minutos inválidos: ${minutes}`);
  }
  let cursor = alignToBusinessTime(toLocal(from));
  let remaining = minutes;

  for (;;) {
    const available = (atHour(cursor, CLOSING_HOUR).getTime() - cursor.getTime()) / MINUTE_MS;
    if (remaining <= available) {
      return fromLocal(new Date(cursor.getTime() + remaining * MINUTE_MS));
    }
    remaining -= available;
    cursor = nextDayOpening(cursor);
  }
}
