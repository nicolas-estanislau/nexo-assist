import { resolve } from "node:path";
import type { NextConfig } from "next";

// O .env fica na raiz do monorepo, compartilhado com o tickets-api.
try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch {
  // Sem .env (ex.: deploy com variáveis de ambiente da plataforma).
}

const nextConfig: NextConfig = {
  // Pacotes do monorepo são publicados como TypeScript; o Next compila junto com o app.
  transpilePackages: ["@nexo/shared", "@nexo/domain", "@nexo/tickets-client", "@nexo/sqlite"],
  serverExternalPackages: ["@libsql/client", "libsql"],
  // O canto inferior esquerdo é do botão "Sair" da barra lateral.
  devIndicators: { position: "bottom-right" },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
