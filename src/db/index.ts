import { drizzle } from "drizzle-orm/planetscale-serverless";
import { Client } from "@planetscale/database";
import * as schema from "./schema.js";

function createClient() {
  if (process.env.DATABASE_URL) {
    return new Client({ url: process.env.DATABASE_URL });
  }
  return new Client({
    host: process.env.DATABASE_HOST!,
    username: process.env.DATABASE_USERNAME!,
    password: process.env.DATABASE_PASSWORD!,
  });
}

const client = createClient();
export const db = drizzle(client, { schema });
export type Database = typeof db;
