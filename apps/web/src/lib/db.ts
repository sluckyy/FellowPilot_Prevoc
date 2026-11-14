import 'server-only';
import pg from 'pg';

// One pool per server process. DATABASE_URL comes from Key Vault in Azure.
const globalForPool = globalThis as unknown as { __mcqPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForPool.__mcqPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForPool.__mcqPool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalForPool.__mcqPool;
}

export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool().query<T>(text, params);
  return r.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

let partitionsCheckedOn = '';
/**
 * Makes sure this month's and next month's event partitions exist, at most once a day per server
 * process. Deploys also create a year ahead; this covers a long gap between deploys.
 */
export async function ensureEventPartitions(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (partitionsCheckedOn === today) return;
  try {
    await q(`SELECT ensure_event_partition((date_trunc('month', now()) + make_interval(months => m))::date) FROM generate_series(0, 1) m`);
    partitionsCheckedOn = today;
  } catch (e) {
    console.error('ensure_event_partition failed', e);   // never block recording an answer
  }
}
