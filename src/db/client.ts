import "./load-env";
import { isPostgres } from "./provider";

const mod = await (isPostgres()
  ? import("./client.pg")
  : import("./client.sqlite"));

export const db = mod.db;
export const sqlite = mod.sqlite;
export const postgresClient = mod.postgresClient;
export const getActiveDatabaseProvider = mod.getActiveDatabaseProvider;
export const closeDatabase = mod.closeDatabase;
