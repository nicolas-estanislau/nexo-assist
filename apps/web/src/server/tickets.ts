import "server-only";
import { createTicketsClient, type TicketsClient } from "@nexo/tickets-client";
import { env } from "./env";

let client: TicketsClient | null = null;

export function ticketsClient(): TicketsClient {
  client ??= createTicketsClient({
    baseUrl: env().TICKETS_API_URL,
    token: env().TICKETS_API_TOKEN,
  });
  return client;
}
