import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const host = process.env.DATABASE_HOST!;
const username = process.env.DATABASE_USERNAME!;
const password = process.env.DATABASE_PASSWORD!;

const url =
  process.env.DATABASE_URL ||
  `mysql://${username}:${password}@${host}/hone?ssl={"rejectUnauthorized":true}`;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: { url },
});
