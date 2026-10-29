import { eq } from "drizzle-orm";
import { overlap, tokenize } from "@nexo/domain";
import type { KbArticle, KbSearchResult } from "@nexo/shared";
import type { Db } from "../db/client";
import { kbArticles } from "../db/schema";

// Busca léxica na central de ajuda. Com poucas dezenas de artigos, pontuar em memória é
// instantâneo e não custa nada; com milhares, o próximo passo seria FTS5 ou embeddings.

const MIN_SCORE = 0.3;

function toArticle(row: typeof kbArticles.$inferSelect): KbArticle {
  return {
    ...row,
    tags: row.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export async function searchArticles(
  db: Db,
  query: string,
  limit: number,
): Promise<KbSearchResult[]> {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];

  const rows = await db.select().from(kbArticles);
  return rows
    .map((row) => {
      const article = toArticle(row);
      // Título e tags pesam mais que o corpo.
      const head = overlap(queryTokens, tokenize(`${article.title} ${article.tags.join(" ")}`));
      const body = overlap(queryTokens, tokenize(article.body));
      const score = Math.round(Math.min(1, head * 0.7 + body * 0.5) * 100) / 100;
      return { article, score };
    })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getArticle(db: Db, id: string): Promise<KbArticle | null> {
  const row = await db.query.kbArticles.findFirst({ where: eq(kbArticles.id, id) });
  return row ? toArticle(row) : null;
}
