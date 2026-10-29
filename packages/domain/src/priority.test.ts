import { describe, expect, it } from "vitest";
import { classifyPriority, type PriorityInput } from "./priority";

const base: PriorityInput = {
  type: "INC",
  affected: "individual",
  workBlocked: false,
  sameDayCommitment: false,
};

describe("classifyPriority", () => {
  it.each<[string, Partial<PriorityInput>, string]>([
    ["sistema parado para a equipe", { affected: "equipe", workBlocked: true }, "Crítica"],
    ["sistema parado para a empresa", { affected: "empresa", workBlocked: true }, "Crítica"],
    ["uma pessoa impedida de trabalhar", { workBlocked: true }, "Alta"],
    ["VPN com reunião às 14h (protótipo)", { sameDayCommitment: true }, "Alta"],
    ["atrapalha, mas há alternativa", {}, "Média"],
    ["equipe afetada, mas com alternativa", { affected: "equipe" }, "Média"],
    ["pedido de monitor sem urgência", { type: "REQ" }, "Baixa"],
    ["pedido de acesso para hoje", { type: "REQ", sameDayCommitment: true }, "Alta"],
  ])("%s → %s", (_label, override, expected) => {
    expect(classifyPriority({ ...base, ...override }).priority).toBe(expected);
  });

  it("explica a regra aplicada", () => {
    expect(classifyPriority({ ...base, sameDayCommitment: true }).reason).toBe(
      "Afeta uma pessoa e há um compromisso no mesmo dia.",
    );
  });
});
