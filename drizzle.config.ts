import "./src/db/load-env";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_PATH ?? "./data/app.db";

export default defineConfig({
  schema: "./src/db/schema.sqlite.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url },
});
