import React, { useEffect, useState } from "react";
import { PhoneCall, Info, MapPin, Compass } from "lucide-react";
import storage from "../utils/storage.js";
import { SERVICE_PLACES_KEY, DEFAULT_SERVICE_PLACES, ZONES } from "../constants.js";

const ZONE_META = {
  South: {
    bg: "/zone-south-bg.jpg",
    accent: "#e0a83a",
    tagline: "Tamil Nadu & Southern coverage",
  },
  North: {
    bg: "/zone-north-bg.jpg",
    accent: "#6fb3ff",
    tagline: "Northern & Western coverage",
  },
};

export default function ServicePlaces() {
  const [places, setPlaces] = useState(null); // null = loading

  async function load() {
    try {
      const res = await storage.get(SERVICE_PLACES_KEY, true);
      if (res && res.value) {
        setPlaces(JSON.parse(res.value));
      } else {
        // First run: seed the default South/North city list so the section
        // isn't empty. Admins can then edit contact/details from here on.
        await storage.set(SERVICE_PLACES_KEY, JSON.stringify(DEFAULT_SERVICE_PLACES), true);
        setPlaces(DEFAULT_SERVICE_PLACES);
      }
    } catch (e) {
      setPlaces([]);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // pick up admin edits without a page reload
    return () => clearInterval(t);
  }, []);

  if (!places) return null; // avoid flashing while loading
  if (places.length === 0) return null;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 70px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
        <Compass size={16} color="var(--brand)" />
        <div className="font-display" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)" }}>
          WHERE WE DELIVER
        </div>
      </div>

      {ZONES.map((zone) => {
        const rows = places.filter((p) => p.zone === zone);
        if (rows.length === 0) return null;
        const meta = ZONE_META[zone];
        return (
          <div key={zone} className="zone-block" style={{ marginBottom: 34 }}>
            <div
              className="zone-banner"
              style={{
                position: "relative", borderRadius: 16, overflow: "hidden",
                backgroundImage: `linear-gradient(120deg, rgba(6,8,14,.55), rgba(6,8,14,.82)), url(${meta.bg})`,
                backgroundSize: "cover", backgroundPosition: "center",
                padding: "22px 26px", marginBottom: 16,
                border: "1px solid rgba(255,255,255,.08)",
              }}
            >
              <div className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
                {zone} Zone
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.75)", marginTop: 4 }}>
                {meta.tagline} · {rows.length} {rows.length === 1 ? "location" : "locations"}
              </div>
            </div>

            <div className="service-places-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {rows.map((p) => (
                <div
                  key={p.id}
                  className="place-card"
                  style={{
                    position: "relative", borderRadius: 13, overflow: "hidden", padding: "16px 16px 14px",
                    border: "1px solid var(--line)",
                    backgroundImage: `linear-gradient(160deg, rgba(6,8,14,.86), rgba(6,8,14,.94)), url(${meta.bg})`,
                    backgroundSize: "cover", backgroundPosition: "center",
                    transition: "transform .25s ease, box-shadow .25s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <MapPin size={13} color={meta.accent} />
                    <span style={{ fontWeight: 700, fontSize: 14.5, color: "#fff" }}>{p.name}</span>
                  </div>
                  {p.contact ? (
                    <a
                      href={`tel:${p.contact}`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, textDecoration: "none",
                        color: meta.accent, border: `1px solid ${meta.accent}55`, borderRadius: 999,
                        padding: "4px 10px", marginBottom: 8,
                      }}
                    >
                      <PhoneCall size={11} /> {p.contact}
                    </a>
                  ) : (
                    <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.45)", marginBottom: 8 }}>Contact coming soon</div>
                  )}
                  {p.details && (
                    <div style={{ display: "flex", gap: 6, fontSize: 11.5, color: "rgba(255,255,255,.65)", lineHeight: 1.5 }}>
                      <Info size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{p.details}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <style>{`
        .place-card:hover{ transform:translateY(-4px); box-shadow:0 14px 28px rgba(0,0,0,.35); }
        @media (max-width: 980px){ .service-places-grid{ grid-template-columns:repeat(3, 1fr) !important; } }
        @media (max-width: 720px){ .service-places-grid{ grid-template-columns:1fr 1fr !important; } }
        @media (max-width: 460px){ .service-places-grid{ grid-template-columns:1fr !important; } }
      `}</style>
    </div>
  );
}
