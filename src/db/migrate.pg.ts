import "./load-env";
import { runPostgresMigrations } from "./migrate-postgres";

runPostgresMigrations().catch((e) => {
  console.error(e);
  process.exit(1);
});
