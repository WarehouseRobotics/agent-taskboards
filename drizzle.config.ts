import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./api/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.TASKBOARDS_DB_PATH ?? "/data/taskboards.sqlite",
  },
});
