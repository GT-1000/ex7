import pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

async function runSqlFile(filePath: string) {
  const sql = await readFile(filePath, "utf8");
  console.log(`Running SQL file: ${filePath}`);
  await pool.query(sql);
  console.log(`Done: ${filePath}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing");
  }

  // Enable PostGIS
  await pool.query("CREATE EXTENSION IF NOT EXISTS postgis;");

  const baseDir = path.resolve(process.cwd(), ".."); // server/ -> project root
  const fylker = path.join(baseDir, "tmp", "Basisdata_0000_Norge_25833_Fylker_PostGIS.sql");
  const skoler = path.join(baseDir, "tmp", "Befolkning_0000_Norge_25833_Grunnskoler_PostGIS.sql");

  // Kjør fylker først, så skoler
  await runSqlFile(fylker);
  await runSqlFile(skoler);

  await pool.end();
  console.log("All data loaded ✅");
}

main().catch(async (e) => {
  console.error("Load failed:", e);
  try { await pool.end(); } catch {}
  process.exit(1);
});