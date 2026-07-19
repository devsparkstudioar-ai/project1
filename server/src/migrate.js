// Applies schema.sql to the configured database.
// Run with: npm run migrate  (from inside /server)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  console.log("[metro-server] Applying schema.sql ...");
  await pool.query(sql);
  console.log("[metro-server] Schema is up to date.");
  await pool.end();
}

main().catch((err) => {
  console.error("[metro-server] Migration failed:", err.message);
  process.exit(1);
});
