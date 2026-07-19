import React from "react";
import { PackageCheck, Boxes, Truck, Navigation, CheckCircle2 } from "lucide-react";
import { STATUS_STEPS } from "../constants.js";

// One icon + one short line per stage, in the same order as STATUS_STEPS
// ("Booked", "Picked Up", "In Transit", "Out for Delivery", "Delivered").
const STAGE_META = [
  { icon: PackageCheck, desc: "Booking saved and AWB generated at the counter." },
  { icon: Boxes, desc: "Shipment collected and added to a dispatch manifest." },
  { icon: Truck, desc: "On the move between branches or hubs." },
  { icon: Navigation, desc: "With the delivery agent, on its way to the consignee." },
  { icon: CheckCircle2, desc: "Handed over and signed for at the destination." },
];

export default function TrackingStagesSection() {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
        <Navigation size={16} color="var(--brand)" />
        <div className="font-display" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)" }}>
          HOW EVERY SHIPMENT IS TRACKED
        </div>
      </div>
      <div className="mcl-card" style={{ padding: "30px 26px" }}>
        <div className="tracking-stage-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 20 }}>
          {STATUS_STEPS.map((label, i) => {
            const Icon = STAGE_META[i].icon;
            return (
              <div key={label} style={{ position: "relative", textAlign: "center" }}>
                {i < STATUS_STEPS.length - 1 && (
                  <div className="tracking-stage-connector" style={{
                    position: "absolute", top: 24, left: "58%", width: "84%", height: 2,
                    background: "linear-gradient(90deg, var(--brand-dim), var(--line))",
                  }} />
                )}
                <div style={{
                  position: "relative", zIndex: 1, width: 48, height: 48, margin: "0 auto 12px",
                  borderRadius: "50%", background: "rgba(212,175,55,.14)", border: "1px solid var(--brand-dim)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={20} color="var(--brand)" />
                </div>
                <div className="font-mono" style={{ fontSize: 11, color: "var(--brand)", fontWeight: 700, marginBottom: 4 }}>
                  STAGE {i + 1}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{STAGE_META[i].desc}</div>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @media (max-width: 880px){ .tracking-stage-grid{ grid-template-columns:1fr 1fr !important; } .tracking-stage-connector{ display:none; } }
        @media (max-width: 520px){ .tracking-stage-grid{ grid-template-columns:1fr !important; } }
      `}</style>
    </div>
  );
}
