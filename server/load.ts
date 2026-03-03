import pg from "pg";
import { copyFrom } from "pg-copy-streams";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

async function runSqlFile(filePath: string) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");

  const client = await pool.connect();
  try {
    console.log(`Loading: ${filePath}`);

    // Ensure PostGIS first
    await client.query("CREATE EXTENSION IF NOT EXISTS postgis;");

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    let stmt = "";
    let inCopy = false;
    let copySql = "";

    for await (const rawLine of rl) {
      const line = rawLine;

      // Skip psql meta commands
      if (!inCopy && line.trim().startsWith("\\")) continue;

      // Start COPY ... FROM stdin;
      if (!inCopy && line.trimStart().toUpperCase().startsWith("COPY ") && line.includes("FROM stdin")) {
        inCopy = true;
        copySql = line;
        // COPY command can sometimes span lines; keep collecting until it ends with ';'
        if (!copySql.trimEnd().endsWith(";")) continue;

        const stream = client.query(copyFrom(copySql));
        // Now stream data lines until \.
        for await (const dataLine of rl) {
          if (dataLine === "\\.") break;
          stream.write(dataLine + "\n");
        }
        stream.end();
        await new Promise<void>((resolve, reject) => {
          stream.on("finish", resolve);
          stream.on("error", reject);
        });

        inCopy = false;
        copySql = "";
        continue;
      }

      // If we started COPY and command spans multiple lines
      if (inCopy && copySql && !copySql.trimEnd().endsWith(";")) {
        copySql += "\n" + line;
        if (!copySql.trimEnd().endsWith(";")) continue;

        const stream = client.query(copyFrom(copySql));
        for await (const dataLine of rl) {
          if (dataLine === "\\.") break;
          stream.write(dataLine + "\n");
        }
        stream.end();
        await new Promise<void>((resolve, reject) => {
          stream.on("finish", resolve);
          stream.on("error", reject);
        });

        inCopy = false;
        copySql = "";
        continue;
      }

      // Normal SQL statement accumulation
      stmt += line + "\n";
      if (line.trimEnd().endsWith(";")) {
        const q = stmt.trim();
        stmt = "";
        if (q) await client.query(q);
      }
    }

    // Any tail statement without semicolon (rare)
    if (stmt.trim()) {
      await client.query(stmt);
    }

    console.log(`Done: ${filePath}`);
  } finally {
    client.release();
  }
}

async function main() {
  const projectRoot = path.resolve(process.cwd(), ".."); // server/ -> repo root

  const fylker = path.join(projectRoot, "tmp", "Basisdata_0000_Norge_25833_Fylker_PostGIS.sql");
  const skoler = path.join(projectRoot, "tmp", "Befolkning_0000_Norge_25833_Grunnskoler_PostGIS.sql");

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