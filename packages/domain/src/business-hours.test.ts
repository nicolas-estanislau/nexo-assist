import { describe, expect, it } from "vitest";
import { addBusinessMinutes, isWithinBusinessHours } from "./business-hours";

// 29/10/2026 é uma quinta-feira. Horários em Brasília (-03:00).
const at = (iso: string) => new Date(iso);

describe("addBusinessMinutes", () => {
  it("soma dentro do mesmo dia", () => {
    expect(addBusinessMinutes(at("2026-10-29T10:00-03:00"), 240)).toEqual(
      at("2026-10-29T14:00-03:00"),
    );
  });

  it("continua no dia seguinte quando passa das 18h", () => {
    expect(addBusinessMinutes(at("2026-10-29T16:00-03:00"), 240)).toEqual(
      at("2026-10-30T10:00-03:00"),
    );
  });

  it("pula o fim de semana", () => {
    expect(addBusinessMinutes(at("2026-10-30T17:00-03:00"), 240)).toEqual(
      at("2026-11-02T11:00-03:00"),
    );
  });

  it("começa a contar na abertura quando o pedido chega fora do expediente", () => {
    expect(addBusinessMinutes(at("2026-10-31T10:00-03:00"), 60)).toEqual(
      at("2026-11-02T09:00-03:00"),
    );
    expect(addBusinessMinutes(at("2026-10-29T07:00-03:00"), 30)).toEqual(
      at("2026-10-29T08:30-03:00"),
    );
    expect(addBusinessMinutes(at("2026-10-29T19:00-03:00"), 0)).toEqual(
      at("2026-10-30T08:00-03:00"),
    );
  });

  it("termina exatamente no fechamento sem pular para o dia seguinte", () => {
    expect(addBusinessMinutes(at("2026-10-29T17:00-03:00"), 60)).toEqual(
      at("2026-10-29T18:00-03:00"),
    );
  });

  it("rejeita minutos negativos", () => {
    expect(() => addBusinessMinutes(at("2026-10-29T10:00-03:00"), -1)).toThrow(RangeError);
  });
});

describe("isWithinBusinessHours", () => {
  it.each([
    ["2026-10-29T08:00-03:00", true],
    ["2026-10-29T17:59-03:00", true],
    ["2026-10-29T18:00-03:00", false],
    ["2026-10-29T07:59-03:00", false],
    ["2026-10-31T10:00-03:00", false],
  ])("%s → %s", (iso, expected) => {
    expect(isWithinBusinessHours(at(iso))).toBe(expected);
  });
});
