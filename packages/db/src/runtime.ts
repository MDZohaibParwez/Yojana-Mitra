import { InMemoryRepository, seedToRecord, type SchemeRepository } from "@ym/core";
import { getDb } from "./client.js";
import { PgRepository, type Embedder } from "./repository.js";
import { loadSeedFiles } from "./seedfiles.js";

let repo: SchemeRepository | null = null;

/**
 * Repository for apps:
 *  - DATABASE_URL set  -> Postgres (production path; only approved content is served)
 *  - YM_DEV_SEED=1     -> in-memory curated seed, for local development without a DB.
 *                         Refused when NODE_ENV=production. Marked unverified.
 */
export function getRepository(opts: { embedder?: Embedder } = {}): SchemeRepository {
  if (repo) return repo;
  if (process.env.DATABASE_URL) {
    repo = new PgRepository(getDb().db, { embedder: opts.embedder ?? embedderFromEnv() });
  } else if (process.env.YM_DEV_SEED === "1" && process.env.NODE_ENV !== "production") {
    repo = new InMemoryRepository(loadSeedFiles().map((s) => seedToRecord(s, { lastVerifiedAt: "unverified-dev-seed" })));
  } else {
    throw new Error("DATABASE_URL is not set (or set YM_DEV_SEED=1 for local development)");
  }
  return repo;
}

export function setRepository(r: SchemeRepository | null) {
  repo = r;
}

/** OpenAI-compatible /embeddings endpoint (e.g. self-hosted bge-m3). Optional. */
export function embedderFromEnv(): Embedder | undefined {
  const url = process.env.EMBEDDINGS_URL;
  const model = process.env.EMBEDDINGS_MODEL;
  if (!url || !model) return undefined;
  return {
    model,
    async embed(text: string) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(process.env.EMBEDDINGS_API_KEY ? { authorization: `Bearer ${process.env.EMBEDDINGS_API_KEY}` } : {}) },
        body: JSON.stringify({ model, input: text }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`embeddings ${res.status}`);
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return json.data[0]!.embedding;
    },
  };
}
