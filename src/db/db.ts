import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from "sql.js";
import { mkdirSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Pool } from "pg";
import { schemaSql, migrationStatements } from "./schema.js";

export type Db = {
  exec: (sql: string) => void;
  run: (sql: string, params?: any[]) => void;
  get: <T = any>(sql: string, params?: any[]) => T | null;
  all: <T = any>(sql: string, params?: any[]) => T[];
  flush: () => Promise<void>;
  /**
   * Direct Postgres pool, when DATABASE_URL is configured. Use this for
   * append-only / high-concurrency event streams that must NOT go through
   * the in-memory sql.js blob — otherwise they'll be lost in the
   * multi-instance flush race (each Railway instance overwrites the entire
   * blob row when it flushes, silently dropping concurrent instances'
   * writes). null in dev/local-SQLite mode; callers should fall back to the
   * sync sql.js path in that case.
   */
  pg: Pool | null;
};

// ── PostgreSQL persistence helpers ────────────────────────────────────────────
//
// Strategy: keep SQLite in memory (fast, synchronous) and use a single row in
// a PostgreSQL table as the durable backing store.  On startup we load the
// blob from PostgreSQL; on every flush we write it back.  This gives us
// persistence across Koyeb container restarts without changing any of the
// synchronous DB code in repo.ts / server.ts.
//
// The table is created automatically if it doesn't exist.

const PG_TABLE = "sqlite_blob";
const PG_KEY   = "main";

async function pgEnsureTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${PG_TABLE} (
      id         TEXT PRIMARY KEY,
      data       BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function pgLoad(pool: Pool): Promise<Buffer | null> {
  await pgEnsureTable(pool);
  const res = await pool.query<{ data: Buffer }>(
    `SELECT data FROM ${PG_TABLE} WHERE id = $1`,
    [PG_KEY]
  );
  return res.rows[0]?.data ?? null;
}

async function pgSave(pool: Pool, data: Buffer): Promise<void> {
  await pool.query(
    `INSERT INTO ${PG_TABLE} (id, data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
    [PG_KEY, data]
  );
}

/**
 * Ensure auxiliary PG-native tables (those that bypass the sql.js blob)
 * exist. funnel_events lives here because per-row INSERTs survive
 * multi-instance concurrent writes — unlike the sqlite_blob row which
 * is fully overwritten on each flush.
 */
async function pgEnsureAuxTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funnel_events (
      id           BIGSERIAL PRIMARY KEY,
      prospect_id  TEXT NOT NULL,
      event        TEXT NOT NULL,
      variant      TEXT,
      occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_funnel_events_prospect ON funnel_events(prospect_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_funnel_events_event_variant_at ON funnel_events(event, variant, occurred_at)`);
}

// ── openDb ────────────────────────────────────────────────────────────────────

export async function openDb(sqlitePath: string, pgUrl?: string): Promise<Db> {
  // Resolve initial SQLite data — preferring PostgreSQL over local file when
  // DATABASE_URL is configured.
  let pgPool: Pool | null = null;
  let initialData: Buffer | null = null;

  if (pgUrl) {
    pgPool = new Pool({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
    try {
      initialData = await pgLoad(pgPool);
      if (initialData) {
        console.info("[db] Loaded SQLite snapshot from PostgreSQL (%d bytes)", initialData.length);
      } else {
        console.info("[db] No existing snapshot in PostgreSQL — starting fresh");
      }
      await pgEnsureAuxTables(pgPool);
    } catch (err) {
      // CRITICAL: Refuse to silently fall back to ephemeral local-file SQLite.
      //
      // Setting DATABASE_URL is an explicit commitment to use PostgreSQL as the
      // durable store. Silently falling back here would route every subsequent
      // write into the container's ephemeral filesystem and discard it on the
      // next reboot — a failure mode that masquerades as a healthy app while
      // silently destroying production data (this exact issue caused a
      // 12-hour outage on 2026-05-08, after a Neon password rotation left
      // Railway with stale credentials).
      //
      // Fail loud instead, so the deploy is visibly broken and the operator
      // can rotate / refresh / restore before any data is written into a
      // doomed local file.
      //
      // Escape hatch for dev: unset DATABASE_URL to use a local SQLite file.
      console.error("[db] PostgreSQL load failed at boot:", err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[db] DATABASE_URL is set but PostgreSQL is unreachable. Refusing to ` +
        `fall back to ephemeral local-file SQLite (would silently lose writes ` +
        `on next reboot). Fix the connection or unset DATABASE_URL. ` +
        `Original error: ${msg}`
      );
    }
  }

  if (!initialData && existsSync(sqlitePath)) {
    initialData = await readFile(sqlitePath);
    console.info("[db] Loaded SQLite from local file (%d bytes)", initialData.length);
  }

  if (!pgPool) {
    // Ensure local directory exists for file-based SQLite.
    mkdirSync(dirname(sqlitePath), { recursive: true });
  }

  const SQL: SqlJsStatic = await initSqlJs({});

  let db: SqlJsDatabase;
  if (initialData) {
    db = new SQL.Database(new Uint8Array(initialData));
  } else {
    db = new SQL.Database();
  }

  db.run(schemaSql);

  // Migrations for columns added after initial schema creation.
  // Errors are intentionally suppressed (column already exists is fine).
  for (const stmt of migrationStatements) {
    try { db.run(stmt); } catch { /* column already exists */ }
  }

  // Backfill tenant_id on rows that predate multi-tenancy.
  try {
    db.run(`
      UPDATE calls
      SET tenant_id = (SELECT tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1)
      WHERE tenant_id IS NULL
        AND (SELECT COUNT(*) FROM tenants) > 0
    `);
    db.run(`
      UPDATE leads
      SET tenant_id = (SELECT tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1)
      WHERE tenant_id IS NULL
        AND (SELECT COUNT(*) FROM tenants) > 0
    `);
  } catch { /* table may not exist yet on very first boot */ }

  // ── Flush (write to PostgreSQL or local file) ─────────────────────────────

  let pendingFlush: NodeJS.Timeout | null = null;
  let flushing = false;

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      const data = db.export();
      const buf = Buffer.from(data);
      if (pgPool) {
        await pgSave(pgPool, buf);
      } else {
        await writeFile(sqlitePath, buf);
      }
    } finally {
      flushing = false;
    }
  };

  const scheduleFlush = () => {
    if (pendingFlush) return;
    pendingFlush = setTimeout(async () => {
      pendingFlush = null;
      try {
        await flush();
      } catch (err) {
        // Don't crash on a transient flush failure (network blips happen) but
        // surface the error loudly so persistent issues are visible. If the
        // PG connection is permanently broken at runtime, every subsequent
        // scheduleFlush will log here, giving operators a clear signal.
        console.error("[db] flush to PostgreSQL failed:", err);
      }
    }, 300);
  };

  // ── Db wrapper (synchronous API over in-memory sql.js) ────────────────────

  const wrap: Db = {
    exec(sql: string) {
      db.exec(sql);
    },
    run(sql: string, params: any[] = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        stmt.step();
      } finally {
        stmt.free();
      }
      scheduleFlush();
    },
    get<T = any>(sql: string, params: any[] = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const ok = stmt.step();
        if (!ok) return null;
        return stmt.getAsObject() as T;
      } finally {
        stmt.free();
      }
    },
    all<T = any>(sql: string, params: any[] = []) {
      const stmt = db.prepare(sql);
      const out: T[] = [];
      try {
        stmt.bind(params);
        while (stmt.step()) out.push(stmt.getAsObject() as T);
      } finally {
        stmt.free();
      }
      return out;
    },
    async flush() {
      if (pendingFlush) {
        clearTimeout(pendingFlush);
        pendingFlush = null;
      }
      await flush();
    },
    pg: pgPool
  };

  return wrap;
}
