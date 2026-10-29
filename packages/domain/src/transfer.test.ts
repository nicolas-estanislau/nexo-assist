import { describe, expect, it } from "vitest";
import { decideTransfer, type TransferInput } from "./transfer";

const base: TransferInput = {
  userRequested: false,
  priority: "Média",
  overdue: false,
  confidence: 0.9,
};

describe("decideTransfer", () => {
  it("não envolve analista quando está tudo sob controle", () => {
    expect(decideTransfer(base)).toEqual({ decision: "none", reasons: [] });
  });

  it("transfere quando o funcionário pede", () => {
    expect(decideTransfer({ ...base, userRequested: true }).decision).toBe("transfer");
  });

  it("transfere casos críticos", () => {
    expect(decideTransfer({ ...base, priority: "Crítica" }).decision).toBe("transfer");
  });

  it("transfere quando o agent não tem segurança", () => {
    const result = decideTransfer({ ...base, confidence: 0.41 });
    expect(result).toEqual({ decision: "transfer", reasons: ["Confiança baixa (41%)."] });
  });

  it("oferece um analista quando o chamado está vencido", () => {
    expect(decideTransfer({ ...base, overdue: true })).toEqual({
      decision: "offer",
      reasons: ["Chamado com prazo vencido."],
    });
  });

  it("acumula todos os motivos", () => {
    const result = decideTransfer({ ...base, userRequested: true, priority: "Crítica" });
    expect(result.reasons).toHaveLength(2);
  });
});
