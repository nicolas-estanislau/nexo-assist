import { describe, expect, it } from "vitest";
import { TicketCategory, TicketPriority, TicketType } from "./index";

describe("vocabulário do service desk", () => {
  it("aceita os valores do Anexo A", () => {
    expect(TicketType.parse("INC")).toBe("INC");
    expect(TicketCategory.parse("Rede e VPN")).toBe("Rede e VPN");
    expect(TicketPriority.parse("Crítica")).toBe("Crítica");
  });

  it("rejeita valores fora do Anexo A", () => {
    expect(TicketType.safeParse("BUG").success).toBe(false);
    expect(TicketCategory.safeParse("RH").success).toBe(false);
  });
});
