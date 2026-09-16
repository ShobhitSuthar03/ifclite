import initSqlJs, { type BindParams, type Database, type SqlJsStatic } from 'sql.js'
import { SCHEMA_SQL } from '@/lib/bim-sql/schema'
import type { SqlValue } from '@/lib/bim-sql/types'

let sqlJs: Promise<SqlJsStatic> | null = null

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJs) {
    sqlJs = (async () => {
      const locateFile =
        typeof window === 'undefined'
          ? (file: string) => `${process.cwd()}/node_modules/sql.js/dist/${file}`
          : () => {
              throw new Error('browser locateFile replaced below')
            }
      if (typeof window === 'undefined') {
        return initSqlJs({ locateFile })
      }
      const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default
      return initSqlJs({ locateFile: () => wasmUrl })
    })()
  }
  return sqlJs
}

export type BimDatabase = Database

export async function openBimDatabase(): Promise<Database> {
  const SQL = await loadSqlJs()
  const db = new SQL.Database()
  db.exec(SCHEMA_SQL)
  return db
}

export async function openBimDatabaseFromBytes(bytes: Uint8Array): Promise<Database> {
  const SQL = await loadSqlJs()
  return new SQL.Database(bytes)
}

export function exportBimDatabase(db: Database): Uint8Array {
  return db.export()
}

export function closeBimDatabase(db: Database | null) {
  try {
    db?.close()
  } catch {
    // already closed
  }
}

export function run(db: Database, sql: string, params: SqlValue[] = []) {
  db.run(sql, params as BindParams)
}

export function all<T extends Record<string, SqlValue>>(
  db: Database,
  sql: string,
  params: SqlValue[] = [],
): T[] {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params as BindParams)
    const rows: T[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T)
    }
    return rows
  } finally {
    stmt.free()
  }
}

export function scalar(db: Database, sql: string, params: SqlValue[] = []): SqlValue {
  const row = all<Record<string, SqlValue>>(db, sql, params)[0]
  if (!row) return null
  return Object.values(row)[0] ?? null
}
