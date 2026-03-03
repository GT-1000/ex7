import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import pg from "pg";

const app = new Hono();

// Hard fail hvis DATABASE_URL mangler på Render
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 8000, // ikke heng for alltid
});

// 1) super-rask test (skal alltid svare)
app.get("/api/ping", (c) => c.json({ ok: true }));

// 2) DB test (skal svare raskt hvis DB er OK)
app.get("/api/db", async (c) => {
  try {
    const r = await pool.query("select 1 as ok");
    return c.json({ ok: true, db: r.rows[0].ok });
  } catch (e) {
    console.error("DB error:", e);
    return c.json({ ok: false, error: String(e) }, 500);
  }
});

// 3) Data (med timeout i selve SQL-en)
app.get("/api/grunnskoler", async (c) => {
  try {
    // 10 sek timeout på spørringen
    await pool.query("SET statement_timeout = 10000;");

    const result = await pool.query(`
      select
        f.fylkesnavn as fylke,
        s.skolenavn,
        s.eierforhold,
        s.antallelever,
        ST_AsGeoJSON(s.posisjon)::json as geometry
      from grunnskoler_519889439f4c490fab3f18303772a702.grunnskole s
      join fylker_a60155918c4a47c2b78f4ab52fc2bfa4.fylke f
        on ST_Contains(f.omrade, s.posisjon)
      where f.fylkesnavn in ('Akershus','Buskerud','Østfold')
    `);

    return c.json({
      type: "FeatureCollection",
      features: result.rows.map(({ geometry, ...properties }) => ({
        type: "Feature",
        properties,
        geometry,
      })),
    });
  } catch (e) {
    console.error("API error:", e);
    return c.json({ ok: false, error: String(e) }, 500);
  }
});

// VIKTIG: denne må ligge SIST, ellers stjeler den /api/*
app.get("*", serveStatic({ root: "../dist" }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Server running on port ${port}`);