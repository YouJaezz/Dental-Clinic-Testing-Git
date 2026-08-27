import "./src/db/load-env";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Set DATABASE_URL before running drizzle-kit with drizzle.config.pg.ts");
}

export default defineConfig({
  schema: "./src/db/schema.pg.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: { url },
});
