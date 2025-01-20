import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { env } from "$env/dynamic/private";
if (!env.BIPPER_DATABASE_PATH) {
  throw new Error("BIPPER_DATABASE_PATH is not set");
}
const client = new Database(env.BIPPER_DATABASE_PATH);
export const db = drizzle(client);
