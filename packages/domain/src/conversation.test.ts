import { describe, expect, it } from "vitest";
import {
  agentCanRespond,
  employeeCanSend,
  transition,
  type ConversationEvent,
} from "./conversation";

describe("transition", () => {
  it.each<[string, ConversationEvent["type"], string]>([
    ["agente", "transferir", "aguardando_analista"],
    ["aguardando_analista", "assumir", "com_analista"],
    ["agente", "assumir", "com_analista"],
    ["com_analista", "devolver", "agente"],
    ["aguardando_analista", "devolver", "agente"],
    ["com_analista", "encerrar", "encerrada"],
    ["agente", "encerrar", "encerrada"],
  ])("%s --%s--> %s", (from, event, to) => {
    expect(transition(from as never, { type: event })).toEqual({ ok: true, status: to });
  });

  it.each<[string, ConversationEvent["type"]]>([
    ["aguardando_analista", "transferir"],
    ["com_analista", "transferir"],
    ["com_analista", "assumir"],
    ["agente", "devolver"],
    ["encerrada", "encerrar"],
    ["encerrada", "assumir"],
  ])("recusa %s --%s-->", (from, event) => {
    expect(transition(from as never, { type: event }).ok).toBe(false);
  });
});

describe("quem pode falar", () => {
  it("o agent só responde quando a conversa está com ele", () => {
    expect(agentCanRespond("agente")).toBe(true);
    expect(agentCanRespond("aguardando_analista")).toBe(false);
    expect(agentCanRespond("com_analista")).toBe(false);
    expect(agentCanRespond("encerrada")).toBe(false);
  });

  it("o funcionário pode escrever enquanto a conversa não foi encerrada", () => {
    expect(employeeCanSend("aguardando_analista")).toBe(true);
    expect(employeeCanSend("encerrada")).toBe(false);
  });
});
