import { getPool, migrate } from '../src/server/db.ts';
import { backfillCatalog } from '../src/features/recipes/catalog.ts';
const pool = getPool();
try {
  await migrate(pool);
  console.log('Database migrations applied.');
  const filled = await backfillCatalog(pool);
  if (filled) console.log(`Catalog search fields filled for ${filled} existing recipes.`);
}
finally { await pool.end(); }
