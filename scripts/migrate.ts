import { getPool, migrate } from '../src/server/db.ts';
const pool = getPool();
try { await migrate(pool); console.log('Database migrations applied.'); }
finally { await pool.end(); }
