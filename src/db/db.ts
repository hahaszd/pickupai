import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from "sql.js";
import { mkdirSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { schemaSql, migrationStatements } from "./schema.js";

export type Db = {
  exec: (sql: string) => void;
  run: (sql: string, params?: any[]) => void;
  get: <T = any>(sql: string, params?: any[]) => T | null;
  all: <T = any>(sql: string, params?: any[]) => T[];
  flush: () => Promise<void>;
};

export async function openDb(sqlitePath: string): Promise<Db> {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const SQL: SqlJsStatic = await initSqlJs({});

  let db: SqlJsDatabase;
  if (existsSync(sqlitePath)) {
    const file = await readFile(sqlitePath);
    db = new SQL.Database(file);
  } else {
    db = new SQL.Database();
  }

  db.run(schemaSql);

  // Run migrations for columns added after initial schema creation.
  // Errors are intentionally suppressed (column already exists is fine).
  for (const stmt of migrationStatements) {
    try { db.run(stmt); } catch { /* column already exists */ }
  }

  // Backfill tenant_id on rows that predate multi-tenancy.
  // Assigns all orphaned calls/leads to the oldest tenant in the DB.
  // Runs on every startup but is effectively a no-op once all rows are assigned.
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

  let pendingFlush: NodeJS.Timeout | null = null;
  let flushing = false;

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      const data = db.export();
      await writeFile(sqlitePath, data);
    } finally {
      flushing = false;
    }
  };

  const scheduleFlush = () => {
    if (pendingFlush) return;
    pendingFlush = setTimeout(async () => {
      pendingFlush = null;
      await flush();
    }, 300);
  };

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
    }
  };

  return wrap;
}

