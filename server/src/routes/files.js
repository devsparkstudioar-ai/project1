import { Router } from "express";
import multer from "multer";
import { query } from "../db.js";

const maxMb = Number(process.env.MAX_UPLOAD_MB || 15);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024 } });

const router = Router();

// POST /api/files  (multipart/form-data, field name "file")
// Used for things like POD photos, signed waybills, ID proofs — anything
// that should live in the database alongside the rest of the company data
// instead of sitting only in one browser's storage.
router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const { originalname, mimetype, size, buffer } = req.file;
    const { rows } = await query(
      `INSERT INTO app_files (original_name, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4) RETURNING id, original_name, mime_type, size_bytes, uploaded_at`,
      [originalname, mimetype, size, buffer]
    );
    const file = rows[0];
    res.status(201).json({
      id: file.id,
      name: file.original_name,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      uploadedAt: file.uploaded_at,
      url: `/api/files/${file.id}`,
    });
  } catch (err) { next(err); }
});

// GET /api/files/:id -> streams the stored binary back out
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT original_name, mime_type, data FROM app_files WHERE id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "not_found" });
    const file = rows[0];
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${file.original_name}"`);
    res.send(file.data);
  } catch (err) { next(err); }
});

// DELETE /api/files/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await query("DELETE FROM app_files WHERE id = $1", [req.params.id]);
    res.json({ deleted: true, id: req.params.id });
  } catch (err) { next(err); }
});

export default router;
