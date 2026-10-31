import { describe, expect, it } from "vitest";
import { inboxStatus, matchesFilter, matchesSearch, type InboxItem, type Person } from "./console";

const rafael: Person = {
  id: "rafael.lima",
  name: "Rafael Lima",
  department: "TI",
  supportLevel: "N2",
};
const juliana: Person = {
  id: "juliana.costa",
  name: "Juliana Costa",
  department: "TI",
  supportLevel: "N1",
};

function item(patch: Partial<InboxItem>): InboxItem {
  return {
    id: "c1",
    status: "agente",
    employee: { id: "ana.souza", name: "Ana Souza", department: "Financeiro", supportLevel: null },
    analyst: null,
    handoff: null,
    lastMessage: null,
    unread: 0,
    updatedAt: "2026-10-30T10:00:00.000Z",
    ...patch,
  };
}

const handoff = (patch: Partial<NonNullable<InboxItem["handoff"]>>) => ({
  reason: "Pedido do funcionário.",
  summary: null,
  confidence: 0.9,
  level: "N2" as const,
  ticketId: null,
  at: null,
  ...patch,
});

describe("linha de status da lista", () => {
  it("transferida mostra o chamado em foco", () => {
    const c = item({ status: "aguardando_analista", handoff: handoff({ ticketId: "INC-20311" }) });
    expect(inboxStatus(c, rafael.id)).toEqual({ label: "Transferida · INC-20311", tone: "danger" });
  });

  it("confiança baixa vira pedido de ajuda do agent", () => {
    const c = item({ status: "aguardando_analista", handoff: handoff({ confidence: 0.41 }) });
    expect(inboxStatus(c, rafael.id)).toEqual({
      label: "Agent pediu ajuda · confiança 41%",
      tone: "warn",
    });
  });

  it("diferencia quem está atendendo", () => {
    const c = item({ status: "com_analista", analyst: rafael });
    expect(inboxStatus(c, rafael.id).label).toBe("Você está atendendo");
    expect(inboxStatus(c, juliana.id).label).toBe("Com Rafael Lima");
  });

  it("encerrada sem analista foi resolvida pelo agent", () => {
    expect(inboxStatus(item({ status: "encerrada" }), rafael.id).label).toBe(
      "Resolvida pelo agent",
    );
    expect(inboxStatus(item({ status: "encerrada", analyst: rafael }), rafael.id).label).toBe(
      "Atendimento encerrado",
    );
  });
});

describe("filtros e busca", () => {
  const queueN2 = item({ id: "a", status: "aguardando_analista", handoff: handoff({}) });
  const queueN1 = item({
    id: "b",
    status: "aguardando_analista",
    handoff: handoff({ level: "N1" }),
  });
  const mine = item({ id: "c", status: "com_analista", analyst: rafael });
  const agent = item({ id: "d" });
  const all = [queueN2, queueN1, mine, agent];
  const ids = (filter: Parameters<typeof matchesFilter>[1], me: Person) =>
    all.filter((c) => matchesFilter(c, filter, me)).map((c) => c.id);

  it("'Para você' é a fila do nível do analista", () => {
    expect(ids("para_voce", rafael)).toEqual(["a"]);
    expect(ids("para_voce", juliana)).toEqual(["b"]);
  });

  it("'Minhas' e 'Com o agent'", () => {
    expect(ids("minhas", rafael)).toEqual(["c"]);
    expect(ids("minhas", juliana)).toEqual([]);
    expect(ids("com_agent", rafael)).toEqual(["d"]);
    expect(ids("todas", rafael)).toHaveLength(4);
  });

  it("busca por nome, departamento ou chamado", () => {
    const c = item({ handoff: handoff({ ticketId: "INC-20311" }) });
    expect(matchesSearch(c, "ana")).toBe(true);
    expect(matchesSearch(c, "financ")).toBe(true);
    expect(matchesSearch(c, "inc-20311")).toBe(true);
    expect(matchesSearch(c, "bruno")).toBe(false);
  });
});
