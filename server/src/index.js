import "dotenv/config";
import express from "express";
import cors from "cors";
import storageRoutes from "./routes/storage.js";
import fileRoutes from "./routes/files.js";
import { pool } from "./db.js";

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    res.status(500).json({ ok: false, db: "unreachable", error: err.message });
  }
});

app.use("/api/storage", storageRoutes);
app.use("/api/files", fileRoutes);

// Centralized error handler
app.use((err, req, res, next) => {
  console.error("[metro-server]", err);
  res.status(500).json({ error: "server_error", message: err.message });
});

app.listen(PORT, () => {
  console.log(`[metro-server] API listening on http://localhost:${PORT}`);
  console.log(`[metro-server] Allowed origins: ${allowedOrigins.join(", ")}`);
});
