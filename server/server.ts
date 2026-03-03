import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import pg from "pg";

const app = new Hono();

const postgresql = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:password@localhost:5432/postgres",
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

app.get("/api/grunnskoler", async (c) => {
  const result = await postgresql.query(`
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
});

// React build
app.get("*", serveStatic({ root: "../dist" }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Server running on port ${port}`);