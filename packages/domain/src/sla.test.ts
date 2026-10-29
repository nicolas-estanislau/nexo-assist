import { describe, expect, it } from "vitest";
import { computeDueAt, getSlaStatus } from "./sla";

const at = (iso: string) => new Date(iso);

describe("computeDueAt", () => {
  it("Crítica conta 1 hora corrida, mesmo fora do expediente (plantão 24h)", () => {
    expect(computeDueAt("Crítica", at("2026-10-30T17:30-03:00"))).toEqual(
      at("2026-10-30T18:30-03:00"),
    );
  });

  it("Alta conta 4 horas úteis (exemplo do protótipo: 09:43 → 13:43)", () => {
    expect(computeDueAt("Alta", at("2026-10-29T09:43-03:00"))).toEqual(
      at("2026-10-29T13:43-03:00"),
    );
  });

  it("Média conta 3 dias úteis", () => {
    expect(computeDueAt("Média", at("2026-11-02T10:00-03:00"))).toEqual(
      at("2026-11-05T10:00-03:00"),
    );
  });

  it("Baixa conta 5 dias úteis, pulando o fim de semana", () => {
    expect(computeDueAt("Baixa", at("2026-11-02T10:00-03:00"))).toEqual(
      at("2026-11-09T10:00-03:00"),
    );
  });
});

describe("getSlaStatus", () => {
  const now = at("2026-10-29T10:00-03:00");

  it("marca como vencido um chamado de prioridade Média sem atualização há 6 dias", () => {
    const status = getSlaStatus(
      { priority: "Média", status: "Aguardando analista", updatedAt: "2026-10-23T10:00:00-03:00" },
      now,
    );
    expect(status.overdue).toBe(true);
    expect(status.label).toBe("3 dias úteis");
  });

  it("não marca como vencido um chamado dentro do prazo", () => {
    const status = getSlaStatus(
      { priority: "Baixa", status: "Aprovado", updatedAt: "2026-10-27T10:00:00-03:00" },
      now,
    );
    expect(status.overdue).toBe(false);
    expect(status.dueAt).toEqual(at("2026-11-03T10:00-03:00"));
  });

  it("chamado resolvido não tem prazo", () => {
    const status = getSlaStatus(
      { priority: "Média", status: "Resolvido", updatedAt: "2026-10-01T10:00:00-03:00" },
      now,
    );
    expect(status).toMatchObject({ dueAt: null, overdue: false });
  });
});
