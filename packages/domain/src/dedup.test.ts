import type { Ticket } from "@nexo/shared";
import { describe, expect, it } from "vitest";
import { canReopen, findDuplicate, tokenize, type NewTicketDraft } from "./dedup";

const now = new Date("2026-10-29T10:00-03:00");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    id: "INC-1",
    type: "INC",
    title: "",
    description: "",
    category: "Outros",
    priority: "Média",
    status: "Aberto",
    affected: "individual",
    requesterId: "ana",
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    resolvedAt: null,
    ...overrides,
  };
}

const vpnDraft: NewTicketDraft = {
  title: "VPN não conecta — erro 809",
  description: "Desde ontem o notebook não conecta na VPN e mostra o erro 809.",
  category: "Rede e VPN",
  requesterId: "ana",
};

describe("tokenize", () => {
  it("ignora acentos, caixa e palavras vazias, mas mantém números", () => {
    expect([...tokenize("Não conecta na VPN: erro 809")]).toEqual([
      "conecta",
      "vpn",
      "erro",
      "809",
    ]);
  });
});

describe("canReopen", () => {
  it("permite reabrir até 7 dias após a resolução", () => {
    expect(canReopen({ status: "Resolvido", resolvedAt: daysAgo(4) }, now)).toBe(true);
    expect(canReopen({ status: "Resolvido", resolvedAt: daysAgo(8) }, now)).toBe(false);
    expect(canReopen({ status: "Em andamento", resolvedAt: null }, now)).toBe(false);
  });
});

describe("findDuplicate", () => {
  it("atualiza um chamado aberto sobre o mesmo problema", () => {
    const existing = ticket({
      id: "INC-20517",
      title: "VPN não conecta",
      description: "Erro 809 ao conectar na VPN.",
      category: "Rede e VPN",
    });
    const decision = findDuplicate(vpnDraft, [existing], now);
    expect(decision).toMatchObject({ action: "update", ticketId: "INC-20517" });
  });

  it("reabre um chamado resolvido há até 7 dias", () => {
    const sap = ticket({
      id: "INC-20150",
      title: "Senha do SAP bloqueada",
      description: "Não consigo entrar no SAP, senha bloqueada.",
      category: "Acesso",
      status: "Resolvido",
      resolvedAt: daysAgo(4),
    });
    const draft: NewTicketDraft = {
      title: "SAP bloqueado de novo",
      description: "A senha do SAP bloqueou outra vez.",
      category: "Acesso",
      requesterId: "ana",
    };
    expect(findDuplicate(draft, [sap], now)).toMatchObject({
      action: "reopen",
      ticketId: "INC-20150",
    });
  });

  it("cria um novo quando o parecido foi resolvido há mais de 7 dias", () => {
    const old = ticket({
      title: "VPN não conecta",
      description: "Erro 809.",
      category: "Rede e VPN",
      status: "Resolvido",
      resolvedAt: daysAgo(20),
    });
    expect(findDuplicate(vpnDraft, [old], now).action).toBe("create");
  });

  it("nunca considera chamados de outro funcionário", () => {
    const fromBruno = ticket({
      requesterId: "bruno",
      title: "VPN não conecta",
      description: "Erro 809.",
      category: "Rede e VPN",
    });
    const decision = findDuplicate(vpnDraft, [fromBruno], now);
    expect(decision.action).toBe("create");
    expect(decision.candidates).toEqual([]);
  });

  it("cria um novo quando os chamados abertos são de outro assunto", () => {
    const monitor = ticket({
      id: "REQ-10442",
      type: "REQ",
      title: "Segundo monitor para home office",
      description: "Preciso de um segundo monitor.",
      category: "Hardware",
      status: "Aprovado",
    });
    const decision = findDuplicate(vpnDraft, [monitor], now);
    expect(decision.action).toBe("create");
    expect(decision.candidates[0]?.score).toBeLessThan(0.5);
  });
});
