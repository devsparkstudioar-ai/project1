// Drop-in replacement for the old localStorage-backed shim.
// Same get/set/delete/list contract the app already uses (window.storage),
// except every call now goes to the Express + PostgreSQL API in /server,
// so bookings, branches, service places and counters are stored centrally
// in the database instead of a single browser's storage.

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

function scopeParam(shared) {
  return shared ? "shared" : "personal";
}

const storage = {
  async get(key, shared = false) {
    try {
      const res = await fetch(`${API_BASE}/api/storage/${encodeURIComponent(key)}?scope=${scopeParam(shared)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`storage.get failed (${res.status})`);
      return await res.json(); // { key, value, scope }
    } catch (e) {
      console.error("[storage.get]", key, e);
      return null;
    }
  },

  async set(key, value, shared = false) {
    const res = await fetch(`${API_BASE}/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, scope: scopeParam(shared) }),
    });
    if (!res.ok) throw new Error(`storage.set failed (${res.status})`);
    return await res.json();
  },

  async delete(key, shared = false) {
    const res = await fetch(`${API_BASE}/api/storage/${encodeURIComponent(key)}?scope=${scopeParam(shared)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`storage.delete failed (${res.status})`);
    return await res.json();
  },

  async list(prefix = "", shared = false) {
    const res = await fetch(`${API_BASE}/api/storage?prefix=${encodeURIComponent(prefix)}&scope=${scopeParam(shared)}`);
    if (!res.ok) throw new Error(`storage.list failed (${res.status})`);
    return await res.json();
  },
};

export default storage;
