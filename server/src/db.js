import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    "\n[metro-server] DATABASE_URL is not set.\n" +
    "Copy server/.env.example to server/.env and point it at your PostgreSQL database.\n"
  );
}

// Managed providers (Render, Neon, Supabase, RDS, etc.) usually require SSL.
// A plain local Postgres install does not. We detect that from the URL so
// the same code works in both places without extra flags.
const useSsl = /sslmode=require|render\.com|neon\.tech|supabase\.co|rds\.amazonaws\.com/.test(
  process.env.DATABASE_URL || ""
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[metro-server] Unexpected PostgreSQL error on idle client", err);
});

export async function query(text, params) {
  return pool.query(text, params);
}
