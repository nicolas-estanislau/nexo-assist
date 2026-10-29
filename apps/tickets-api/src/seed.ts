import { count } from "drizzle-orm";
import type { Employee, KbArticle, Ticket, TicketUpdateKind } from "@nexo/shared";
import type { Db } from "./db/client";
import { counters, employees, kbArticles, ticketUpdates, tickets } from "./db/schema";

// Dados de exemplo (PRD, Anexo B). As datas são relativas ao momento do seed para que as
// situações continuem valendo: um chamado vencido, um resolvido há 4 dias (pode reabrir) etc.

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const SEED_EMPLOYEES: Employee[] = [
  {
    id: "ana.souza",
    name: "Ana Souza",
    email: "ana.souza@nexo.com.br",
    department: "Financeiro",
    role: "funcionario",
    supportLevel: null,
  },
  {
    id: "bruno.tavares",
    name: "Bruno Tavares",
    email: "bruno.tavares@nexo.com.br",
    department: "Comercial",
    role: "funcionario",
    supportLevel: null,
  },
  {
    id: "carla.mendes",
    name: "Carla Mendes",
    email: "carla.mendes@nexo.com.br",
    department: "Controladoria",
    role: "funcionario",
    supportLevel: null,
  },
  {
    id: "diego.ramos",
    name: "Diego Ramos",
    email: "diego.ramos@nexo.com.br",
    department: "Operações",
    role: "funcionario",
    supportLevel: null,
  },
  {
    id: "elisa.prado",
    name: "Elisa Prado",
    email: "elisa.prado@nexo.com.br",
    department: "Marketing",
    role: "funcionario",
    supportLevel: null,
  },
  {
    id: "fabio.nunes",
    name: "Fábio Nunes",
    email: "fabio.nunes@nexo.com.br",
    department: "Jurídico",
    role: "funcionario",
    supportLevel: null,
  },
  {
    id: "gabriela.rocha",
    name: "Gabriela Rocha",
    email: "gabriela.rocha@nexo.com.br",
    department: "RH",
    role: "funcionario",
    supportLevel: null,
  },
  {
    id: "rafael.lima",
    name: "Rafael Lima",
    email: "rafael.lima@nexo.com.br",
    department: "TI",
    role: "analista",
    supportLevel: "N2",
  },
  {
    id: "juliana.costa",
    name: "Juliana Costa",
    email: "juliana.costa@nexo.com.br",
    department: "TI",
    role: "analista",
    supportLevel: "N1",
  },
];

type SeedTicket = Omit<Ticket, "createdAt" | "updatedAt" | "resolvedAt"> & {
  createdAgo: number;
  updatedAgo: number;
  resolvedAgo?: number;
  history: { kind: TicketUpdateKind; author: string; message: string; ago: number }[];
};

export const SEED_TICKETS: SeedTicket[] = [
  // --- Ana Souza: cobre as telas do protótipo ---
  {
    id: "INC-20311",
    type: "INC",
    title: "Notebook lento após atualização do Windows",
    description:
      "Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.",
    category: "Hardware",
    priority: "Média",
    status: "Aguardando analista",
    affected: "individual",
    requesterId: "ana.souza",
    supportLevel: "N1",
    createdAgo: 13 * DAY,
    updatedAgo: 6 * DAY,
    history: [
      {
        kind: "criacao",
        author: "ana.souza",
        message: "Chamado aberto pelo formulário.",
        ago: 13 * DAY,
      },
      {
        kind: "status",
        author: "juliana.costa",
        message: "Status: Aguardando analista. Encaminhado para análise do notebook.",
        ago: 6 * DAY,
      },
    ],
  },
  {
    id: "INC-20298",
    type: "INC",
    title: "Acesso à pasta Financeiro no SharePoint",
    description: "Sem acesso à pasta Financeiro/Fechamento no SharePoint desde a troca de equipe.",
    category: "Acesso",
    priority: "Média",
    status: "Em andamento",
    affected: "individual",
    requesterId: "ana.souza",
    supportLevel: "N1",
    createdAgo: 15 * DAY,
    updatedAgo: 1 * DAY,
    history: [
      {
        kind: "criacao",
        author: "ana.souza",
        message: "Chamado aberto pelo formulário.",
        ago: 15 * DAY,
      },
      {
        kind: "status",
        author: "juliana.costa",
        message: "Status: Em andamento. Aguardando aprovação do dono da pasta.",
        ago: 1 * DAY,
      },
    ],
  },
  {
    id: "REQ-10442",
    type: "REQ",
    title: "Segundo monitor para home office",
    description: "Pedido de um segundo monitor para o home office.",
    category: "Hardware",
    priority: "Baixa",
    status: "Aprovado",
    affected: "individual",
    requesterId: "ana.souza",
    supportLevel: null,
    createdAgo: 20 * DAY,
    updatedAgo: 4 * DAY,
    history: [
      {
        kind: "criacao",
        author: "ana.souza",
        message: "Requisição aberta pelo formulário.",
        ago: 20 * DAY,
      },
      {
        kind: "status",
        author: "juliana.costa",
        message: "Status: Aprovado. Envio previsto pela logística.",
        ago: 4 * DAY,
      },
    ],
  },
  {
    id: "INC-20150",
    type: "INC",
    title: "Senha do SAP bloqueada",
    description: "A senha do SAP bloqueou depois de algumas tentativas.",
    category: "Acesso",
    priority: "Média",
    status: "Resolvido",
    affected: "individual",
    requesterId: "ana.souza",
    supportLevel: "N1",
    createdAgo: 6 * DAY,
    updatedAgo: 4 * DAY,
    resolvedAgo: 4 * DAY,
    history: [
      {
        kind: "criacao",
        author: "ana.souza",
        message: "Chamado aberto pelo formulário.",
        ago: 6 * DAY,
      },
      {
        kind: "status",
        author: "juliana.costa",
        message: "Status: Resolvido. Senha desbloqueada.",
        ago: 4 * DAY,
      },
    ],
  },
  {
    id: "INC-19877",
    type: "INC",
    title: "Outlook não sincroniza no celular",
    description: "O Outlook do celular parou de receber e-mails.",
    category: "E-mail",
    priority: "Baixa",
    status: "Resolvido",
    affected: "individual",
    requesterId: "ana.souza",
    supportLevel: "N1",
    createdAgo: 60 * DAY,
    updatedAgo: 57 * DAY,
    resolvedAgo: 57 * DAY,
    history: [
      {
        kind: "status",
        author: "juliana.costa",
        message: "Status: Resolvido. Conta reconfigurada.",
        ago: 57 * DAY,
      },
    ],
  },
  {
    id: "INC-19410",
    type: "INC",
    title: "Troca de senha da rede",
    description: "Senha da rede expirada, sem conseguir trocar.",
    category: "Acesso",
    priority: "Baixa",
    status: "Resolvido",
    affected: "individual",
    requesterId: "ana.souza",
    supportLevel: "N1",
    createdAgo: 112 * DAY,
    updatedAgo: 110 * DAY,
    resolvedAgo: 110 * DAY,
    history: [
      { kind: "status", author: "juliana.costa", message: "Status: Resolvido.", ago: 110 * DAY },
    ],
  },
  // --- Outros funcionários: nunca devem aparecer para a Ana ---
  {
    id: "INC-20402",
    type: "INC",
    title: "VPN cai a cada 10 minutos",
    description: "A VPN desconecta a cada 10 minutos, com erro 809 algumas vezes.",
    category: "Rede e VPN",
    priority: "Alta",
    status: "Em andamento",
    affected: "individual",
    requesterId: "bruno.tavares",
    supportLevel: "N2",
    createdAgo: 2 * DAY,
    updatedAgo: 3 * HOUR,
    history: [
      {
        kind: "criacao",
        author: "bruno.tavares",
        message: "Chamado aberto pelo formulário.",
        ago: 2 * DAY,
      },
    ],
  },
  {
    id: "REQ-10461",
    type: "REQ",
    title: "Acesso ao SAP, módulo FI",
    description: "Preciso de acesso ao módulo FI do SAP para o fechamento de hoje.",
    category: "Acesso",
    priority: "Alta",
    status: "Aguardando analista",
    affected: "individual",
    requesterId: "carla.mendes",
    supportLevel: "N1",
    createdAgo: 2 * DAY,
    updatedAgo: 2 * DAY,
    history: [
      {
        kind: "criacao",
        author: "carla.mendes",
        message: "Requisição aberta pelo formulário.",
        ago: 2 * DAY,
      },
    ],
  },
  {
    id: "INC-20377",
    type: "INC",
    title: "Impressora do 3º andar não imprime",
    description: "A impressora do 3º andar mostra erro de papel, mas a bandeja está cheia.",
    category: "Hardware",
    priority: "Média",
    status: "Resolvido",
    affected: "equipe",
    requesterId: "diego.ramos",
    supportLevel: "N1",
    createdAgo: 5 * DAY,
    updatedAgo: 2 * DAY,
    resolvedAgo: 2 * DAY,
    history: [
      {
        kind: "status",
        author: "juliana.costa",
        message: "Status: Resolvido. Sensor limpo.",
        ago: 2 * DAY,
      },
    ],
  },
  {
    id: "INC-20519",
    type: "INC",
    title: "Teams sem áudio nas reuniões",
    description: "Nas reuniões do Teams ninguém me ouve, mas o microfone funciona em outros apps.",
    category: "Software",
    priority: "Média",
    status: "Aberto",
    affected: "individual",
    requesterId: "elisa.prado",
    supportLevel: null,
    createdAgo: 1 * HOUR,
    updatedAgo: 1 * HOUR,
    history: [
      {
        kind: "criacao",
        author: "elisa.prado",
        message: "Chamado aberto pelo Nexo Assist.",
        ago: 1 * HOUR,
      },
    ],
  },
];

export const SEED_ARTICLES: Omit<KbArticle, "updatedAt">[] = [
  {
    id: "KB-001",
    title: "VPN com erro 809",
    body: "Reinstale o cliente de VPN pelo Portal de Softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    tags: ["vpn", "erro 809", "windows 10", "rede"],
  },
  {
    id: "KB-002",
    title: "Horário do service desk",
    body: "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    tags: ["horário", "atendimento", "plantão", "service desk"],
  },
  {
    id: "KB-003",
    title: "Trocar ou desbloquear a senha da rede",
    body: "Acesse o Portal de Autoatendimento, opção Senha da rede, e confirme com o MFA do celular. Depois de 5 tentativas erradas, a conta desbloqueia sozinha em 30 minutos.",
    tags: ["senha", "rede", "bloqueio", "desbloquear", "expirada", "login"],
  },
  {
    id: "KB-004",
    title: "Senha do SAP bloqueada",
    body: "Desbloqueie pelo Portal de Autoatendimento, opção SAP. Se o portal não liberar, abra um chamado na categoria Acesso.",
    tags: ["sap", "senha", "bloqueio", "desbloquear"],
  },
  {
    id: "KB-005",
    title: "Outlook não sincroniza no celular",
    body: "Remova a conta do app Outlook, confirme que o Portal da Empresa (Intune) está instalado e adicione a conta de novo. Apps de e-mail nativos não são suportados.",
    tags: ["outlook", "e-mail", "email", "celular", "sincronizar"],
  },
  {
    id: "KB-006",
    title: "Notebook lento depois de atualização",
    body: "Reinicie o notebook duas vezes e rode o Diagnóstico Nexo pelo Portal de Softwares. Se continuar lento, abra um chamado informando o resultado do diagnóstico.",
    tags: ["notebook", "lento", "lentidão", "atualização", "windows", "desempenho"],
  },
  {
    id: "KB-007",
    title: "Instalar software",
    body: "Softwares do catálogo são instalados pelo Portal de Softwares, sem chamado. Softwares fora do catálogo exigem uma requisição com aprovação do gestor.",
    tags: ["software", "instalar", "programa", "licença", "portal"],
  },
  {
    id: "KB-008",
    title: "Wi-Fi para visitantes",
    body: "Visitantes usam a rede Nexo-Visitantes. A senha muda todo dia e fica com a recepção de cada andar.",
    tags: ["wi-fi", "wifi", "visitante", "internet", "rede"],
  },
  {
    id: "KB-009",
    title: "Teams sem áudio",
    body: "No Teams, abra Configurações > Dispositivos e selecione o microfone e o alto-falante corretos. Se outro app estiver usando o microfone, feche-o e entre de novo na reunião.",
    tags: ["teams", "áudio", "microfone", "reunião", "som"],
  },
];

export async function seedIfEmpty(db: Db, now: Date): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(employees);
  if ((row?.n ?? 0) > 0) return false;

  const at = (ago: number) => new Date(now.getTime() - ago).toISOString();

  await db.transaction(async (tx) => {
    await tx.insert(employees).values(SEED_EMPLOYEES);
    for (const { createdAgo, updatedAgo, resolvedAgo, history, ...ticket } of SEED_TICKETS) {
      await tx.insert(tickets).values({
        ...ticket,
        createdAt: at(createdAgo),
        updatedAt: at(updatedAgo),
        resolvedAt: resolvedAgo === undefined ? null : at(resolvedAgo),
      });
      for (const h of history) {
        await tx.insert(ticketUpdates).values({
          ticketId: ticket.id,
          kind: h.kind,
          authorId: h.author,
          message: h.message,
          createdAt: at(h.ago),
        });
      }
    }
    await tx
      .insert(kbArticles)
      .values(
        SEED_ARTICLES.map((a) => ({ ...a, tags: a.tags.join(","), updatedAt: at(30 * DAY) })),
      );
    await tx.insert(counters).values([
      { name: "INC", value: 20599 },
      { name: "REQ", value: 10499 },
    ]);
  });
  return true;
}
