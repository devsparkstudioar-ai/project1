import React, { useEffect, useState } from "react";
import { MapPin, PlusCircle, X, Trash2 } from "lucide-react";
import storage from "../utils/storage.js";
import { SERVICE_PLACES_KEY, DEFAULT_SERVICE_PLACES, ZONES } from "../constants.js";

function emptyForm() {
  return { zone: "South", name: "", contact: "", details: "" };
}

export default function ServicePlacesAdmin({ notify }) {
  const [places, setPlaces] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [confirmDel, setConfirmDel] = useState("");
  const [zoneFilter, setZoneFilter] = useState("All");

  async function load() {
    try {
      const res = await storage.get(SERVICE_PLACES_KEY, true);
      if (res && res.value) {
        setPlaces(JSON.parse(res.value));
      } else {
        await storage.set(SERVICE_PLACES_KEY, JSON.stringify(DEFAULT_SERVICE_PLACES), true);
        setPlaces(DEFAULT_SERVICE_PLACES);
      }
    } catch (e) {
      setPlaces([]);
    }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  async function persist(next) {
    setPlaces(next);
    try {
      await storage.set(SERVICE_PLACES_KEY, JSON.stringify(next), true);
    } catch (e) {
      console.error(e);
      notify({ title: "Save failed", msg: "Could not reach the database — check your connection and try again.", color: "var(--red)" });
    }
  }

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({ zone: p.zone, name: p.name, contact: p.contact, details: p.details });
  }
  function cancelEdit() { setEditingId(null); setForm(emptyForm()); }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      notify({ title: "Place name required", msg: "Give the city / location a name.", color: "var(--gold)" });
      return;
    }
    if (editingId) {
      const next = places.map((p) => (p.id === editingId ? { ...p, ...form } : p));
      await persist(next);
      notify({ title: "Service place updated", msg: form.name, color: "var(--green)" });
    } else {
      const id = "SP" + Date.now().toString(36).toUpperCase();
      const next = [...places, { id, ...form }];
      await persist(next);
      notify({ title: "Service place added", msg: form.name, color: "var(--green)" });
    }
    cancelEdit();
  }

  async function remove(id) {
    const p = places.find((x) => x.id === id);
    await persist(places.filter((x) => x.id !== id));
    notify({ title: "Service place removed", msg: p ? p.name : "", color: "var(--red)" });
    setConfirmDel("");
  }

  if (!loaded) return null;

  const visible = zoneFilter === "All" ? places : places.filter((p) => p.zone === zoneFilter);

  return (
    <div className="glide-in" style={{ display: "grid", gap: 18 }}>
      <div className="mcl-card" style={{ padding: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <MapPin size={16} color="var(--brand)" /> {editingId ? "Edit service place" : "Add a service place"}
        </div>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="service-place-form-grid">
            <div>
              <label className="lb">Zone *</label>
              <select className="in" value={form.zone} onChange={(e) => set("zone", e.target.value)}>
                {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label className="lb">City / place name *</label>
              <input className="in" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Coimbatore" />
            </div>
            <div>
              <label className="lb">Contact number</label>
              <input className="in" value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="10-digit phone number" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="lb">More details</label>
              <input className="in" value={form.details} onChange={(e) => set("details", e.target.value)} placeholder="Coverage notes, delivery timelines, pincodes served, etc." />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit"><PlusCircle size={15} /> {editingId ? "Save changes" : "Add place"}</button>
            {editingId && <button className="btn btn-dark" type="button" onClick={cancelEdit}><X size={15} /> Cancel</button>}
          </div>
        </form>
      </div>

      <div className="mcl-card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>All service places ({visible.length})</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["All", ...ZONES].map((z) => (
              <div
                key={z}
                className={`tab-btn ${zoneFilter === z ? "active" : ""}`}
                style={{ padding: "6px 12px", fontSize: 12.5 }}
                onClick={() => setZoneFilter(z)}
              >
                {z}
              </div>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No service places in this zone yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visible.map((p) => (
              <div key={p.id} className="mcl-card-2" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    {p.name} <span className="badge" style={{ color: "var(--muted)", background: "rgba(140,151,179,.14)" }}>{p.zone}</span>
                  </div>
                  {p.contact && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{p.contact}</div>}
                  {p.details && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{p.details}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-dark btn-sm" onClick={() => startEdit(p)}>Edit</button>
                  {confirmDel === p.id ? (
                    <button className="btn btn-sm" style={{ background: "var(--red)", color: "#fff" }} onClick={() => remove(p.id)}>Confirm</button>
                  ) : (
                    <button className="btn btn-dark btn-sm" onClick={() => setConfirmDel(p.id)}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`@media (max-width:700px){ .service-place-form-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
