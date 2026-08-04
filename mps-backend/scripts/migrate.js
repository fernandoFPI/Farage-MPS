import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function migrate() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    process.exit(0);
  }

  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(applied.map(r => r.filename));

    // Bootstrap: tracking table is new but DB already has tables from prior runs.
    // Try each migration — if it fails we assume it was already applied and move on.
    if (appliedSet.size === 0) {
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roles' LIMIT 1`
      );
      const existingDb = rows.length > 0;

      if (existingDb) {
        console.log('Existing database detected — bootstrapping migration tracking...\n');
        for (const file of files) {
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`✓ ${file}`);
          } catch {
            await client.query('ROLLBACK');
            await client.query(
              'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
              [file],
            );
            console.log(`~ ${file} (assumed already applied)`);
          }
        }
        console.log('\nBootstrap complete.');
        return;
      }
    }

    // Normal mode: only run migrations not yet recorded.
    let ran = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✓ ${file}`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✗ ${file}: ${err.message}`);
        process.exit(1);
      }
    }

    if (ran === 0) console.log('Nothing to migrate — already up to date.');
    else console.log(`\n${ran} migration(s) applied successfully.`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
