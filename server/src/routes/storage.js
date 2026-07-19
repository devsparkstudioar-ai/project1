import { Router } from "express";
import { query } from "../db.js";

const router = Router();

function scopeOf(req) {
  return req.query.scope === "personal" ? "personal" : "shared";
}

// GET /api/storage?prefix=metro_&scope=shared -> list matching keys
router.get("/", async (req, res, next) => {
  try {
    const scope = scopeOf(req);
    const prefix = req.query.prefix || "";
    const { rows } = await query(
      "SELECT storage_key FROM app_storage WHERE scope = $1 AND storage_key LIKE $2 ORDER BY storage_key",
      [scope, `${prefix}%`]
    );
    res.json({ keys: rows.map((r) => r.storage_key), prefix, scope });
  } catch (err) { next(err); }
});

// GET /api/storage/:key?scope=shared
router.get("/:key", async (req, res, next) => {
  try {
    const scope = scopeOf(req);
    const { rows } = await query(
      "SELECT value FROM app_storage WHERE storage_key = $1 AND scope = $2",
      [req.params.key, scope]
    );
    if (rows.length === 0) return res.status(404).json({ error: "not_found" });
    // Value is stored as JSONB; the client always sends/expects a JSON string,
    // so we round-trip it back out as a string here to match window.storage's contract.
    res.json({ key: req.params.key, value: JSON.stringify(rows[0].value), scope });
  } catch (err) { next(err); }
});

// PUT /api/storage/:key  { value: "<json string>", scope: "shared" }
router.put("/:key", async (req, res, next) => {
  try {
    const scope = req.body.scope === "personal" ? "personal" : "shared";
    const raw = req.body.value;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    await query(
      `INSERT INTO app_storage (storage_key, scope, value, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (storage_key, scope)
       DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.params.key, scope, JSON.stringify(parsed)]
    );
    res.json({ key: req.params.key, value: raw, scope });
  } catch (err) { next(err); }
});

// DELETE /api/storage/:key?scope=shared
router.delete("/:key", async (req, res, next) => {
  try {
    const scope = scopeOf(req);
    await query("DELETE FROM app_storage WHERE storage_key = $1 AND scope = $2", [req.params.key, scope]);
    res.json({ key: req.params.key, deleted: true, scope });
  } catch (err) { next(err); }
});

export default router;
