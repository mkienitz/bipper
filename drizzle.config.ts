import { defineConfig } from "drizzle-kit";
if (!process.env.BIPPER_DATABASE_PATH) {
  throw new Error("BIPPER_DATABASE_PATH is not set");
}

export default defineConfig({
  schema: "./src/lib/server/db/schema.ts",

  dbCredentials: {
    url: process.env.BIPPER_DATABASE_PATH,
  },

  verbose: true,
  strict: true,
  dialect: "sqlite",
});
