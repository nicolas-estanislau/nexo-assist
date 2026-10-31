# Uma imagem por serviço, a partir do monorepo: `--build-target web` ou `--build-target tickets`.
FROM node:22-slim AS base
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY . .

# Serviço de chamados: só as dependências dele.
FROM base AS tickets
RUN pnpm install --frozen-lockfile --filter "@nexo/tickets-api..."
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "@nexo/tickets-api", "start"]

# App web: build de produção do Next.
FROM base AS web
RUN pnpm install --frozen-lockfile --filter "@nexo/web..."
RUN pnpm --filter @nexo/web build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@nexo/web", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
