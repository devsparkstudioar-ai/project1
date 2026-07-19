import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Package, Truck, MapPin, Search, CheckCircle2, Clock, PhoneCall,
  FileSpreadsheet, Printer, MessageCircle, LayoutDashboard, PlusCircle,
  ListChecks, LogOut, Lock, BarChart3, Calendar, Wallet, ChevronRight,
  X, RefreshCcw, ShieldCheck, Boxes, ScanLine, ArrowRight, Building2,
  User, Weight, FileText, TrendingUp, AlertTriangle, Copy, Check, Mail,
  Trash2, Activity, Globe2, Sparkles
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from "recharts";
import * as XLSX from "xlsx";
import TrackingStagesSection from "./components/TrackingStagesSection.jsx";
import ServicePlaces from "./components/ServicePlaces.jsx";
import ServicePlacesAdmin from "./components/ServicePlacesAdmin.jsx";
import { STATUS_STEPS, COMPANY, SERVICE_PLACES_KEY, COUNTRIES } from "./constants.js";
import {
  buildStagePlan, computeAutoStageIndex, computeLiveProgress, formatEta, deriveBranchCode,
} from "./utils/tracking.js";

/* ============================= COMPANY / CONSTANTS ============================= */

const LOGO_SRC = "/logo.png";

const STORE_KEY = "metro_bookings_db_v2";
const SEQ_KEY = "metro_seq_v2";
const MANIFEST_SEQ_KEY = "metro_manifest_seq_v1";
const ADMIN_PASS = "metro2026";

const BRANCH_STORE_KEY = "metro_branches_v1";
const BRANCH_SEQ_KEY = "metro_branch_seq_v1";

function makeDefaultBranch() {
  return {
    id: "BR001",
    name: "Erode (Head Office)",
    code: "ERD",
    address: COMPANY.address,
    contact: COMPANY.mobile,
    managerName: COMPANY.md,
    managerUsername: "erodemanager",
    managerPassword: "erode123",
    city: "Erode",
    active: true,
    createdAt: new Date().toISOString(),
  };
}

const DELIVERY_TYPES = ["Door Delivery", "Godown Delivery", "Self Pickup"];

const NDR_REASONS = [
  "Customer not available",
  "Address incomplete / not found",
  "Customer refused to accept",
  "Requested reschedule",
  "COD amount not ready",
  "Other",
];

// Illustrative per-kg rate card — edit these slabs to match your actual pricing.
const RATE_CARD = {
  Surface: { base: 60, baseKg: 1, perKg: 20 },
  Express: { base: 120, baseKg: 1, perKg: 35 },
  Air: { base: 200, baseKg: 1, perKg: 55 },
};

function estimateFreight(weight, mode) {
  const w = Number(weight) || 0;
  const r = RATE_CARD[mode] || RATE_CARD.Surface;
  if (w <= 0) return 0;
  const extra = Math.max(0, w - r.baseKg);
  return Math.round(r.base + extra * r.perKg);
}

const PAYMENT_INFO = {
  Paid: { color: "#2ED492", note: "Collected in full at the time of booking." },
  ToPay: { color: "#FFB020", note: "To be collected from the consignee on delivery." },
  Credit: { color: "#3D7BFA", note: "Billed to the consignor's credit account monthly." },
};

const SHIPMENT_TYPES = ["Courier", "Document", "Cargo"];

const emptyForm = (branchId = "") => ({
  branchId,
  clientAccount: "Cash Customer", consigneeCompany: "",
  consignorName: "", consignorPhone: "", consignorAddress: "", consignorCity: "", consignorPincode: "", consignorCountry: "India",
  consigneeName: "", consigneePhone: "", consigneeWhatsapp: "", consigneeAddress: "", consigneeCity: "", consigneePincode: "", consigneeCountry: "India",
  weight: "", pieces: "1", description: "", mode: "Surface",
  lengthCm: "", widthCm: "", heightCm: "",
  paymentType: "Paid", amount: "", otherCharges: "0",
  fodCharges: "0", awbCharges: "0", pickupCharges: "0", deliveryCharges: "0", fuelCharges: "0", ewayCharges: "0", rcmGst: "0", gstPercent: "",
  expectedDelivery: "", remarks: "",
  invoiceNumber: "", invoiceValue: "",
  ewayBill: "", deliveryType: DELIVERY_TYPES[0],
  awbMode: "auto", manualAwb: "",
  oda: "Regular", poNumber: "", shipmentType: SHIPMENT_TYPES[0],
  forwarderName: "", forwarderLrNo: "",
});

/* ============================= HELPERS ============================= */

function pad(n, len = 2) { return String(n).padStart(len, "0"); }

function generateAWB(seq) {
  // 7-digit numeric part: 4-digit year + 3-digit sequence, e.g. MCL2026001
  const year = new Date().getFullYear();
  return `MCL${year}${pad(seq, 3)}`;
}
const AWB_REGEX = /^MCL\d{7}$/i;

function generateManifestId(seq) {
  const d = new Date();
  const y = pad(d.getFullYear() % 100);
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `DSP${y}${m}${day}${pad(seq, 3)}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function fmtMonth(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}
function currency(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function maskAddress(a) {
  if (!a) return "—";
  if (a.length <= 10) return a;
  return a.slice(0, 10) + "••••";
}
function dateInRange(iso, range) {
  const d = new Date(iso);
  const now = new Date();
  if (range === "all") return true;
  if (range === "today") return d.toDateString() === now.toDateString();
  if (range === "week") { const start = new Date(now); start.setDate(now.getDate() - 7); return d >= start && d <= now; }
  if (range === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (range === "year") return d.getFullYear() === now.getFullYear();
  return true;
}
function statusIndex(status) { return STATUS_STEPS.indexOf(status); }
function digitsOnly(s) { return (s || "").replace(/\D/g, ""); }

// --- MIS computed fields (mirrors the on-time/delay/current-station columns
// used in real courier MIS reports) ---
function onTimeStatus(b) {
  if (!b.expectedDelivery) return "—";
  const expected = new Date(b.expectedDelivery);
  const compareTo = b.status === "Delivered" && b.deliveredAt ? new Date(b.deliveredAt) : new Date();
  if (b.status === "RTO") return "RTO";
  if (b.status !== "Delivered" && compareTo <= expected) return "Pending";
  return compareTo.getTime() <= expected.getTime() + 86400000 ? "On Time" : "Delay";
}
function delayDays(b) {
  if (!b.expectedDelivery) return 0;
  const expected = new Date(b.expectedDelivery);
  const compareTo = b.status === "Delivered" && b.deliveredAt ? new Date(b.deliveredAt) : new Date();
  const diff = Math.round((compareTo - expected) / 86400000);
  return diff > 0 ? diff : 0;
}
function currentStation(b) {
  if (b.status === "Booked") return b.consignorCity || b.branchName || "—";
  if (b.status === "Delivered") return b.consigneeCity || "—";
  if (b.status === "RTO") return b.consignorCity || "—";
  return b.consigneeCity || b.consignorCity || "—";
}

/* ============================= TOASTS ============================= */

const ToastCtx = React.createContext(() => {});
function ToastHost({ toasts, remove }) {
  return (
    <div className="no-print" style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ borderLeftColor: t.color || "var(--brand)" }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.title}</div>
          {t.msg && <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.msg}</div>}
        </div>
      ))}
    </div>
  );
}

/* ============================= GLOBAL STYLE ============================= */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

      :root{
        --ink:#010203; --ink2:#060810; --panel:rgba(10,14,30,.68); --panel-solid:#080b1a; --panel2:#0e1229; --line:rgba(255,255,255,.065);
        --paper:#F4EFE3;
        --navy:#16245c; --navy2:#0d1740;
        --brand:#D4AF37; --brand-dim:#8a6a1c; --brand-glow:rgba(212,175,55,.5); --brand-soft:rgba(212,175,55,.14);
        --red:#E0233C; --red-dim:#8f1526; --red-glow:rgba(224,35,60,.5);
        --green:#2ED492; --blue:#3D7BFA; --gold:#FFB020;
        --muted:#8B93B3; --muted2:#4d5678; --text:#EEF1FB;
        --font-display:'Space Grotesk',sans-serif; --font-body:'Inter',sans-serif; --font-mono:'IBM Plex Mono',monospace;
      }
      html{ scroll-behavior:smooth; }
      .mcl-root{ background:radial-gradient(ellipse 90% 60% at 50% -10%, #0c1330 0%, var(--ink) 55%); color:var(--text); font-family:var(--font-body); min-height:100vh; position:relative; overflow-x:hidden; }
      .mcl-root *{ box-sizing:border-box; }
      .font-display{ font-family:var(--font-display); }
      .font-mono{ font-family:var(--font-mono); letter-spacing:.02em; }

      /* ambient backdrop */
      .aurora{ position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
      .aurora span{ position:absolute; border-radius:50%; filter:blur(110px); opacity:.3; }
      .aurora .a1{ width:520px; height:520px; background:var(--brand); top:-160px; left:-120px; animation:drift1 22s ease-in-out infinite; }
      .aurora .a2{ width:460px; height:460px; background:var(--navy); bottom:-160px; right:-100px; animation:drift2 26s ease-in-out infinite; }
      .aurora .a3{ width:340px; height:340px; background:#3D7BFA; top:40%; left:60%; animation:drift3 30s ease-in-out infinite; opacity:.13; }
      @keyframes drift1{ 0%,100%{ transform:translate(0,0) scale(1);} 50%{ transform:translate(60px,80px) scale(1.15);} }
      @keyframes drift2{ 0%,100%{ transform:translate(0,0) scale(1);} 50%{ transform:translate(-50px,-60px) scale(1.1);} }
      @keyframes drift3{ 0%,100%{ transform:translate(0,0) scale(1);} 50%{ transform:translate(-40px,50px) scale(1.2);} }
      .grid-veil{ position:fixed; inset:0; z-index:0; pointer-events:none;
        background-image:linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
        background-size:46px 46px; mask-image:radial-gradient(ellipse 60% 50% at 50% 0%, black 10%, transparent 70%); opacity:.4; }
      .content-layer{ position:relative; z-index:1; }

      .spotlight{ position:absolute; inset:0; pointer-events:none; opacity:.6;
        background:radial-gradient(500px circle at var(--mx,50%) var(--my,20%), rgba(212,175,55,.14), transparent 60%); }

      .glass{ background:var(--panel); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); border:1px solid var(--line); border-radius:18px; }
      .mcl-card{ background:var(--panel-solid); border:1px solid var(--line); border-radius:18px; box-shadow:0 1px 0 rgba(255,255,255,.03) inset, 0 20px 40px -28px rgba(0,0,0,.6); transition:transform .4s cubic-bezier(.16,1,.3,1), border-color .3s ease, box-shadow .4s ease; }
      .mcl-card:hover{ box-shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 26px 50px -24px rgba(0,0,0,.65); }
      .mcl-card-2{ background:var(--panel2); border:1px solid var(--line); border-radius:16px; transition:border-color .3s ease, box-shadow .3s ease; }
      .tilt:hover{ border-color:rgba(212,175,55,.4); box-shadow:0 18px 40px -18px rgba(212,175,55,.35); }

      .btn{ font-family:var(--font-body); font-weight:600; border-radius:12px; padding:11px 20px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; border:1px solid transparent; transition:transform .22s cubic-bezier(.16,1,.3,1), background .3s ease, border-color .3s ease, box-shadow .3s ease; font-size:14px; }
      .btn:active{ transform:scale(.96); }
      .btn-primary{ background:linear-gradient(135deg,var(--brand),#a8172c); color:#fff; box-shadow:0 8px 24px -10px var(--brand-glow); }
      .btn-primary:hover{ box-shadow:0 12px 30px -8px var(--brand-glow); transform:translateY(-2px); }
      .btn-ghost{ background:transparent; color:var(--text); border-color:var(--line); }
      .btn-ghost:hover{ border-color:var(--brand); color:var(--brand); }
      .btn-dark{ background:var(--panel2); color:var(--text); border-color:var(--line); }
      .btn-dark:hover{ border-color:var(--muted2); transform:translateY(-2px); box-shadow:0 10px 22px -14px rgba(0,0,0,.7); }
      .btn-sm{ padding:7px 12px; font-size:12.5px; border-radius:9px; }
      .btn:disabled{ opacity:.45; cursor:not-allowed; }

      .in{ background:var(--ink2); border:1px solid var(--line); color:var(--text); border-radius:10px; padding:10px 12px; font-family:var(--font-body); font-size:14px; width:100%; outline:none; transition:border-color .25s ease, box-shadow .25s ease, background .25s ease; }
      .in:focus{ border-color:var(--brand); box-shadow:0 0 0 3px rgba(212,175,55,.15); background:#0a0e1e; }
      .in::placeholder{ color:var(--muted2); }
      label.lb{ font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.06em; display:block; margin-bottom:6px; }

      /* Route Rail */
      .route-rail{ width:100%; }
      .route-rail-track{ position:relative; height:5px; background:var(--line); border-radius:999px; margin:0 4px 24px 4px; }
      .route-rail-fill{ position:absolute; top:0; left:0; height:100%; border-radius:999px; background:linear-gradient(90deg,var(--brand-dim),var(--brand)); transition:width .9s cubic-bezier(.16,1,.3,1); }
      .route-rail-fill.is-rto{ background:linear-gradient(90deg,#5a1a22,#c73347); }
      .route-rail-truck{ position:absolute; top:50%; width:30px; height:30px; border-radius:999px; background:var(--brand); display:flex; align-items:center; justify-content:center; color:#fff;
        box-shadow:0 0 0 0 var(--brand-glow); transform:translate(-50%,-50%); animation:pulseTruck 2s ease-out infinite; transition:left .9s cubic-bezier(.16,1,.3,1); }
      @keyframes pulseTruck{ 0%{ box-shadow:0 0 0 0 var(--brand-glow);} 70%{ box-shadow:0 0 0 14px rgba(212,175,55,0);} 100%{ box-shadow:0 0 0 0 rgba(212,175,55,0);} }
      .route-rail-nodes{ display:flex; justify-content:space-between; }
      .route-rail-node{ display:flex; flex-direction:column; align-items:center; gap:8px; flex:1; text-align:center; }
      .node-dot{ width:12px; height:12px; border-radius:999px; background:var(--panel-solid); border:2px solid var(--muted2); display:block; transition:all .3s ease; }
      .route-rail-node.is-done .node-dot{ background:var(--brand); border-color:var(--brand); }
      .route-rail-node.is-current .node-dot{ background:var(--brand); border-color:var(--brand); box-shadow:0 0 0 4px var(--brand-glow); }
      .node-label{ font-size:11px; color:var(--muted); font-weight:600; max-width:76px; transition:color .3s ease; }
      .route-rail-node.is-done .node-label, .route-rail-node.is-current .node-label{ color:var(--text); }
      .rto-flag{ margin-top:8px; color:var(--red); font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px; }

      .badge{ display:inline-flex; align-items:center; gap:6px; padding:4px 11px; border-radius:999px; font-size:12px; font-weight:700; }

      .glide-in{ animation:glideIn .7s cubic-bezier(.16,1,.3,1) both; }
      @keyframes glideIn{ from{ opacity:0; transform:translateY(16px);} to{ opacity:1; transform:translateY(0);} }
      .view-enter{ animation:viewFade .5s cubic-bezier(.16,1,.3,1) both; }
      @keyframes viewFade{ from{ opacity:0; transform:translateY(10px) scale(.99);} to{ opacity:1; transform:translateY(0) scale(1);} }
      .float-parcel{ animation:floaty 3.6s ease-in-out infinite; }
      @keyframes floaty{ 0%,100%{ transform:translateY(0) rotate(-2deg);} 50%{ transform:translateY(-10px) rotate(2deg);} }
      .spin-slow{ animation:spin 14s linear infinite; }
      @keyframes spin{ to{ transform:rotate(360deg);} }
      .shimmer{ position:relative; overflow:hidden; background:var(--panel2); border-radius:10px; }
      .shimmer::after{ content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent); animation:shimmer 1.4s infinite; }
      @keyframes shimmer{ from{ transform:translateX(-100%);} to{ transform:translateX(100%);} }

      .marquee-wrap{ overflow:hidden; white-space:nowrap; mask-image:linear-gradient(90deg,transparent,black 8%,black 92%,transparent); }
      .marquee-track{ display:inline-block; animation:marquee 26s linear infinite; }
      @keyframes marquee{ from{ transform:translateX(0);} to{ transform:translateX(-50%);} }

      .toast{ background:var(--panel-solid); border:1px solid var(--line); border-left:4px solid var(--brand); border-radius:12px; padding:12px 16px; min-width:220px; box-shadow:0 12px 30px -10px rgba(0,0,0,.5); animation:toastIn .4s cubic-bezier(.16,1,.3,1) both; }
      @keyframes toastIn{ from{ opacity:0; transform:translateY(12px) scale(.95);} to{ opacity:1; transform:translateY(0) scale(1);} }

      .check-draw{ stroke-dasharray:40; stroke-dashoffset:40; animation:drawCheck .6s .1s cubic-bezier(.16,1,.3,1) forwards; }
      @keyframes drawCheck{ to{ stroke-dashoffset:0; } }
      .ring-pop{ animation:ringPop .8s cubic-bezier(.16,1,.3,1) both; }
      @keyframes ringPop{ 0%{ transform:scale(.6); opacity:0;} 60%{ transform:scale(1.08); opacity:1;} 100%{ transform:scale(1);} }

      table.mcl-table{ width:100%; border-collapse:collapse; font-size:13.5px; }
      table.mcl-table th{ text-align:left; padding:10px 12px; color:var(--muted); font-weight:600; text-transform:uppercase; font-size:11px; letter-spacing:.05em; border-bottom:1px solid var(--line); white-space:nowrap; }
      table.mcl-table td{ padding:12px; border-bottom:1px solid var(--line); vertical-align:middle; }
      table.mcl-table tr{ transition:background .2s ease; }
      table.mcl-table tr:hover td{ background:rgba(212,175,55,.04); }

      .tab-btn{ padding:10px 16px; border-radius:11px; font-size:13.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px; color:var(--muted); border:1px solid transparent; transition:all .25s cubic-bezier(.16,1,.3,1); }
      .tab-btn.active{ background:var(--panel2); color:var(--text); border-color:var(--line); box-shadow:inset 0 0 0 1px rgba(212,175,55,.25); }
      .tab-btn:hover:not(.active){ color:var(--text); background:rgba(255,255,255,.03); }

      .logo-badge{ border-radius:12px; overflow:visible; display:flex; align-items:center; justify-content:center; position:relative; }
      .logo-badge img{ width:100%; height:100%; object-fit:contain; position:relative; z-index:1; image-rendering:-webkit-optimize-contrast; backface-visibility:hidden; transform:translateZ(0);
        filter:brightness(1.05) contrast(1.1) saturate(1.12) drop-shadow(0 2px 6px rgba(0,0,0,.5)); }
      .logo-badge::before{ content:''; position:absolute; inset:-24%; background:radial-gradient(circle, rgba(212,175,55,.4), transparent 68%); border-radius:50%; filter:blur(2px); animation:logoGlow 4.5s ease-in-out infinite; z-index:0; }
      @keyframes logoGlow{ 0%,100%{ opacity:.55; transform:scale(.94);} 50%{ opacity:1; transform:scale(1.05);} }
      .logo-badge-anim{ animation:logoFloat 5s ease-in-out infinite; }
      @keyframes logoFloat{ 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-5px);} }
      .logo-shine{ position:relative; display:inline-block; }
      .logo-shine img{ display:block; }
      .logo-text-outline{ -webkit-text-stroke:.6px rgba(120,84,18,.9); paint-order:stroke fill; filter:drop-shadow(0 1px 3px rgba(0,0,0,.55)); }
      .shimmer-text{ background:linear-gradient(100deg, var(--text) 30%, var(--brand) 45%, #fff 50%, var(--brand) 55%, var(--text) 70%); background-size:250% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; animation:shimmerMove 5s ease-in-out infinite; }
      @keyframes shimmerMove{ 0%{ background-position:200% 0;} 100%{ background-position:-100% 0;} }
      .logo-hero{ position:relative; display:inline-flex; align-items:center; justify-content:center; animation:logoFloat 5s ease-in-out infinite; }
      .logo-hero img{ position:relative; z-index:1; image-rendering:-webkit-optimize-contrast; backface-visibility:hidden; transform:translateZ(0);
        filter:brightness(1.04) contrast(1.1) saturate(1.1) drop-shadow(0 4px 10px rgba(0,0,0,.5)); }
      .logo-hero-ring{ position:absolute; inset:-16%; border-radius:50%; border:1px solid rgba(212,175,55,.22); animation:spin 30s linear infinite; }
      .logo-hero-ring.r2{ inset:-28%; border-color:rgba(43,68,150,.28); animation-duration:40s; animation-direction:reverse; }
      .logo-hero-glow{ position:absolute; inset:-30%; background:radial-gradient(circle, rgba(212,175,55,.46), transparent 65%); filter:blur(10px); animation:logoGlow 4.5s ease-in-out infinite; z-index:0; }


      @media print{ .no-print{ display:none !important; } .print-only{ display:block !important; } body{ background:white; } }
      .print-only{ display:none; }

      ::-webkit-scrollbar{ width:8px; height:8px; }
      ::-webkit-scrollbar-thumb{ background:var(--panel2); border-radius:8px; }

      .live-dot{ width:7px; height:7px; border-radius:999px; background:var(--green); box-shadow:0 0 0 0 rgba(46,212,146,.6); animation:liveDot 2s infinite; display:inline-block; }
      @keyframes liveDot{ 0%{ box-shadow:0 0 0 0 rgba(46,212,146,.6);} 70%{ box-shadow:0 0 0 6px rgba(46,212,146,0);} 100%{ box-shadow:0 0 0 0 rgba(46,212,146,0);} }
        .aurora span, .float-parcel, .spin-slow, .marquee-track, .shimmer::after, .route-rail-truck{ animation:none !important; }
      }
    `}</style>
  );
}

/* ============================= TILT WRAPPER ============================= */

function Tilt({ children, style, className = "" }) {
  const ref = useRef(null);
  function onMove(e) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-2px)`;
  }
  function onLeave() { if (ref.current) ref.current.style.transform = "perspective(700px) rotateX(0) rotateY(0)"; }
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`mcl-card tilt ${className}`} style={style}>
      {children}
    </div>
  );
}

/* ============================= SMALL UI PIECES ============================= */

function RouteRail({ status, booking }) {
  const isAlert = status === "RTO" || status === "NDR";
  const idx = isAlert ? STATUS_STEPS.length - 1 : Math.max(0, statusIndex(status));
  const livePct = booking ? computeLiveProgress(booking) : (idx / (STATUS_STEPS.length - 1)) * 100;
  const pct = isAlert ? 100 : livePct;
  return (
    <div className="route-rail">
      <div className="route-rail-track">
        <div className={`route-rail-fill ${isAlert ? "is-rto" : ""}`} style={{ width: pct + "%" }} />
        {!isAlert && <div className="route-rail-truck" style={{ left: pct + "%" }}><Truck size={14} /></div>}
      </div>
      <div className="route-rail-nodes">
        {STATUS_STEPS.map((s, i) => (
          <div key={s} className={`route-rail-node ${i <= idx && !isAlert ? "is-done" : ""} ${i === idx && !isAlert ? "is-current" : ""}`}>
            <span className="node-dot" />
            <span className="node-label">{s}</span>
          </div>
        ))}
      </div>
      {status === "RTO" && <div className="rto-flag"><AlertTriangle size={15} /> Returned to Origin</div>}
      {status === "NDR" && <div className="rto-flag" style={{ color: "var(--gold)" }}><AlertTriangle size={15} /> Delivery attempt failed</div>}
      {!isAlert && booking && booking.stagePlan && status !== "Delivered" && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} /> Expected by <b style={{ color: "var(--text)" }}>{formatEta(booking.stagePlan.etaISO)}</b>
          {typeof booking.stagePlan.km === "number" && <span>· {booking.stagePlan.km} km · {booking.stagePlan.international ? "International" : "Domestic"} route</span>}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    "Booked": { c: "var(--muted)", bg: "rgba(140,151,179,.14)" },
    "Picked Up": { c: "var(--blue)", bg: "rgba(61,123,250,.14)" },
    "In Transit": { c: "var(--brand)", bg: "rgba(212,175,55,.14)" },
    "Out for Delivery": { c: "var(--gold)", bg: "rgba(255,176,32,.14)" },
    "Delivered": { c: "var(--green)", bg: "rgba(46,212,146,.14)" },
    "RTO": { c: "var(--red)", bg: "rgba(224,35,60,.14)" },
    "NDR": { c: "var(--gold)", bg: "rgba(255,176,32,.14)" },
  };
  const s = map[status] || map["Booked"];
  return <span className="badge" style={{ color: s.c, background: s.bg }}>{status}</span>;
}
function PaymentBadge({ type }) {
  const info = PAYMENT_INFO[type] || PAYMENT_INFO.Paid;
  return <span className="badge" style={{ color: info.color, background: info.color + "22" }}>{type}</span>;
}

function KPI({ icon: Icon, label, value, sub, color = "var(--brand)" }) {
  return (
    <Tilt style={{ padding: "20px 22px" }} className="glide-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
          <div className="font-display" style={{ fontSize: 29, fontWeight: 700, marginTop: 6 }}>{value}</div>
          {sub && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `color-mix(in srgb, ${color} 18%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", color }}>
          <Icon size={19} />
        </div>
      </div>
    </Tilt>
  );
}

function Logo({ size = 60, showText = true, textScale = 1 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div className="logo-badge logo-shine logo-badge-anim" style={{ width: size, height: size }}>
        <img src={LOGO_SRC} alt="Metro Courier and Logistics" />
      </div>
      {showText && (
        <div>
          <div className="font-display logo-text-outline" style={{ fontWeight: 800, fontSize: 24 * textScale, lineHeight: 1.02, letterSpacing: ".01em", background: "linear-gradient(90deg,#fff,var(--brand) 70%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>METRO</div>
          <div className="font-mono" style={{ fontSize: 11.5 * textScale, color: "var(--muted)", letterSpacing: ".12em", fontWeight: 600, marginTop: 1, textShadow: "0 0 8px rgba(0,0,0,.6)" }}>COURIER AND LOGISTICS</div>
          <div className="font-mono" style={{ fontSize: 8.5 * textScale, color: "var(--brand)", letterSpacing: ".28em", marginTop: 1 }}>THE LOAD POINT</div>
        </div>
      )}
    </div>
  );
}

function HeroLogo({ size = 120 }) {
  return (
    <div className="logo-hero" style={{ width: size, height: size }}>
      <div className="logo-hero-glow" />
      <div className="logo-hero-ring" />
      <div className="logo-hero-ring r2" />
      <div className="logo-shine" style={{ width: size, height: size }}>
        <img src={LOGO_SRC} alt="Metro Courier and Logistics" style={{ width: size, height: size, objectFit: "contain" }} />
      </div>
    </div>
  );
}

/* ============================= NAV ============================= */

function Nav({ view, setView, adminLoggedIn, onLogout, syncing, lastSynced, onRefresh }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secsAgo = lastSynced ? Math.max(0, Math.round((Date.now() - lastSynced.getTime()) / 1000)) : null;

  return (
    <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(5,7,13,.78)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--line)" }}>
      <div style={{ height: 3, background: "linear-gradient(90deg,var(--brand),var(--navy),var(--brand))", backgroundSize: "200% 100%", animation: "marquee 6s linear infinite" }} />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ cursor: "pointer" }} onClick={() => setView("home")}><Logo size={76} /></div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {adminLoggedIn && (
            <div className="tab-btn" onClick={onRefresh} title="Refresh now" style={{ color: "var(--muted)" }}>
              <span className={syncing ? "spin-slow" : ""} style={{ display: "inline-flex" }}><RefreshCcw size={13} /></span>
              <span className="live-dot" /> {secsAgo !== null ? `Synced ${secsAgo}s ago` : "Syncing…"}
            </div>
          )}
          <div className={`tab-btn ${view === "home" ? "active" : ""}`} onClick={() => setView("home")}><Package size={15} /> Home</div>
          <div className={`tab-btn ${view === "track" ? "active" : ""}`} onClick={() => setView("track")}><Search size={15} /> Track</div>
          <div className={`tab-btn ${view === "admin" ? "active" : ""}`} onClick={() => setView("admin")}><ShieldCheck size={15} /> Admin</div>
          {adminLoggedIn && view === "admin" && (
            <div className="tab-btn" onClick={onLogout} style={{ color: "var(--red)" }}><LogOut size={15} /> Logout</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================= HOME VIEW ============================= */

function HomeView({ setView, bookings }) {
  const [demoIdx, setDemoIdx] = useState(0);
  const heroRef = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setDemoIdx((i) => (i + 1) % STATUS_STEPS.length), 1900);
    return () => clearInterval(t);
  }, []);
  const demoStatus = STATUS_STEPS[demoIdx];

  function onHeroMove(e) {
    const el = heroRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
    el.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
  }

  const features = [
    { icon: ScanLine, title: "Auto-generated AWB", desc: "Every booking gets a unique, sequential waybill number the moment it's saved — no manual entry, no duplicates." },
    { icon: MessageCircle, title: "Instant WhatsApp updates", desc: "Send the booking POD and tracking link straight to the customer's WhatsApp with one tap." },
    { icon: Wallet, title: "Paid, ToPay & Credit", desc: "Track every payment mode against every parcel, with running totals by day, week, month and year." },
    { icon: FileSpreadsheet, title: "Export & print", desc: "Pull any date range into Excel, or print a clean waybill / POD receipt for the parcel." },
    { icon: BarChart3, title: "Live dashboard", desc: "Booking volume, revenue split and delivery performance, updated in real time." },
    { icon: ShieldCheck, title: "Customer self-tracking", desc: "Customers track their own parcel by AWB number — no calls to the counter needed." },
  ];

  const recent = [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);

  return (
    <div>
      <div ref={heroRef} onMouseMove={onHeroMove} style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "64px 20px 40px" }}>
        <div className="spotlight" />
        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 48, alignItems: "center", position: "relative" }} className="hero-grid">
          <div className="glide-in">
            <div style={{ marginBottom: 22 }}><HeroLogo size={168} /></div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--brand)", marginBottom: 18, letterSpacing: ".08em" }}>
              <Globe2 size={14} className="spin-slow" /> {COMPANY.scope.toUpperCase()}
            </div>
            <h1 className="font-display" style={{ fontSize: 52, lineHeight: 1.04, fontWeight: 700, margin: 0 }}>
              Every parcel,<br /><span className="shimmer-text">on the record.</span>
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 16.5, lineHeight: 1.6, marginTop: 20, maxWidth: 480 }}>
              {COMPANY.name} runs booking, dispatch and delivery from one waybill —
              auto-numbered, WhatsApp-ready, and tracked door to door.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => setView("track")}><Search size={16} /> Track a shipment</button>
              <button className="btn btn-ghost" onClick={() => setView("admin")}><ShieldCheck size={16} /> Admin portal <ArrowRight size={15} /></button>
            </div>
            <div style={{ display: "flex", gap: 28, marginTop: 40, flexWrap: "wrap" }}>
              <div><div className="font-display" style={{ fontSize: 24, fontWeight: 700 }}>5</div><div style={{ fontSize: 12, color: "var(--muted)" }}>tracking stages</div></div>
              <div><div className="font-display" style={{ fontSize: 24, fontWeight: 700 }}>24/7</div><div style={{ fontSize: 12, color: "var(--muted)" }}>self-tracking</div></div>
            </div>
          </div>

          <Tilt style={{ padding: 28 }} className="glide-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: ".08em" }}>SAMPLE WAYBILL</div>
                <div className="font-mono" style={{ fontSize: 19, fontWeight: 600, marginTop: 3 }}>MCL260708-0143</div>
              </div>
              <div className="float-parcel" style={{ width: 46, height: 46, borderRadius: 12, background: "var(--panel2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Package size={22} color="var(--brand)" />
              </div>
            </div>
            <RouteRail status={demoStatus} />
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <div style={{ color: "var(--muted)" }}>Erode → Bengaluru</div>
              <StatusBadge status={demoStatus} />
            </div>
          </Tilt>
        </div>
      </div>

      <TrackingStagesSection />

      {recent.length > 0 && (
        <div className="no-print" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "12px 0", background: "rgba(212,175,55,.04)" }}>
          <div className="marquee-wrap">
            <div className="marquee-track font-mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {[...recent, ...recent].map((b, i) => (
                <span key={i} style={{ marginRight: 40 }}>
                  <span style={{ color: "var(--brand)" }}>●</span> {b.awb} &nbsp;{b.consignorCity} → {b.consigneeCity} &nbsp;<StatusInline status={b.status} />
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "50px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <Sparkles size={16} color="var(--brand)" />
          <div className="font-display" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)" }}>WHAT THE PLATFORM HANDLES</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }} className="feature-grid">
          {features.map((f, i) => (
            <Tilt key={i} style={{ padding: 24, animationDelay: `${i * 0.07}s` }} className="glide-in">
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(212,175,55,.14)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <f.icon size={18} color="var(--brand)" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{f.desc}</div>
            </Tilt>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 80px" }}>
        <div className="mcl-card" style={{ padding: 36, background: "linear-gradient(135deg, var(--panel-solid), var(--navy2))" }}>
          <div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>From counter to doorstep</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 }} className="steps-grid">
            {[
              ["01", "Book", "Admin enters sender, receiver, weight and payment details."],
              ["02", "Generate", "An AWB number is created automatically and the waybill is saved."],
              ["03", "Notify", "The customer gets the POD and tracking link on WhatsApp."],
              ["04", "Track", "Anyone can follow the parcel live using the AWB number."],
            ].map(([n, t, d]) => (
              <div key={n}>
                <div className="font-mono" style={{ color: "var(--brand)", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{n}</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{t}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ServicePlaces />

      <Footer />

      <style>{`
        @media (max-width: 880px){ .hero-grid{ grid-template-columns:1fr !important; } .feature-grid{ grid-template-columns:1fr 1fr !important; } .steps-grid{ grid-template-columns:1fr 1fr !important; } }
        @media (max-width: 560px){ .feature-grid{ grid-template-columns:1fr !important; } .steps-grid{ grid-template-columns:1fr !important; } }
      `}</style>
    </div>
  );
}

function StatusInline({ status }) {
  return <span style={{ color: "var(--text)" }}>{status}</span>;
}

function Footer() {
  return (
    <div className="no-print" style={{ borderTop: "1px solid var(--line)", background: "linear-gradient(180deg, transparent, rgba(0,0,0,.35))", padding: "48px 20px 28px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 32 }} className="footer-grid">
        <div>
          <Logo size={62} textScale={1} />
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 16, maxWidth: 300, lineHeight: 1.7 }}>{COMPANY.address}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <a href={`tel:${COMPANY.mobile}`} className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}><PhoneCall size={13} /> {COMPANY.mobile}</a>
            <a href={`https://wa.me/91${digitsOnly(COMPANY.whatsapp)}`} target="_blank" rel="noreferrer" className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}><MessageCircle size={13} /> WhatsApp</a>
          </div>
        </div>
        <div>
          <div className="font-display" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: "var(--brand)", marginBottom: 14 }}>CONTACT</div>
          <div style={{ display: "grid", gap: 10, fontSize: 13, color: "var(--muted)" }}>
            <a href={`mailto:${COMPANY.email}`} style={{ color: "var(--muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}><Mail size={14} /> {COMPANY.email}</a>
            <a href={`tel:${COMPANY.phone}`} style={{ color: "var(--muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}><PhoneCall size={14} /> {COMPANY.phone}</a>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Globe2 size={14} /> {COMPANY.website}</div>
          </div>
        </div>
        <div>
          <div className="font-display" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: "var(--brand)", marginBottom: 14 }}>COMPANY</div>
          <div style={{ display: "grid", gap: 10, fontSize: 13, color: "var(--muted)" }}>
            <div>GST: <span className="font-mono">{COMPANY.gst}</span></div>
            <div>{COMPANY.tagline}</div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1180, margin: "26px auto 0", borderTop: "1px solid var(--line)", paddingTop: 18, textAlign: "center", fontSize: 12, color: "var(--muted2)" }}>
        © {new Date().getFullYear()} {COMPANY.name} — {COMPANY.tagline}
      </div>
      <style>{`@media (max-width:700px){ .footer-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

/* ============================= TRACK VIEW ============================= */

function TrackView({ bookings, onPrint }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResults, setBulkResults] = useState(null);

  function doSearch(e) {
    e && e.preventDefault();
    setSearching(true);
    setTimeout(() => {
      const found = bookings.find((b) => b.awb.toLowerCase() === q.trim().toLowerCase());
      setResult(found || null);
      setSearched(true);
      setSearching(false);
    }, 420);
  }

  function doBulkSearch(e) {
    e && e.preventDefault();
    const awbs = bulkText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const rows = awbs.map((awb) => {
      const found = bookings.find((b) => b.awb.toLowerCase() === awb.toLowerCase());
      return { awb, found };
    });
    setBulkResults(rows);
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "56px 20px 80px" }}>
      <div className="glide-in" style={{ textAlign: "center", marginBottom: 32 }}>
        <div className="font-display" style={{ fontSize: 34, fontWeight: 700 }}>Track your parcel</div>
        <div style={{ color: "var(--muted)", marginTop: 8 }}>Enter the AWB number printed on your receipt or WhatsApp message.</div>
        <div style={{ marginTop: 14 }}>
          <span className="tab-btn" style={{ display: "inline-flex" }} onClick={() => setBulkMode(!bulkMode)}>
            {bulkMode ? <Search size={14} /> : <ListChecks size={14} />} {bulkMode ? "Track a single AWB" : "Track multiple parcels at once"}
          </span>
        </div>
      </div>

      {!bulkMode ? (
        <form onSubmit={doSearch} className="glass glide-in" style={{ padding: 10, display: "flex", gap: 8 }}>
          <input className="in font-mono" style={{ border: "none", background: "transparent" }} placeholder="e.g. MCL2607080001"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={searching}>
            {searching ? <RefreshCcw size={16} className="spin-slow" /> : <Search size={16} />} Track
          </button>
        </form>
      ) : (
        <form onSubmit={doBulkSearch} className="glass glide-in" style={{ padding: 16 }}>
          <label className="lb">Paste AWB numbers — one per line, or comma-separated</label>
          <textarea className="in font-mono" rows={5} style={{ resize: "vertical" }} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"MCL2607080001\nMCL2607080002\nMCL2607080003"} />
          <button className="btn btn-primary" type="submit" style={{ marginTop: 10 }}><ListChecks size={16} /> Track all</button>

          {bulkResults && (
            <div className="mcl-card-2" style={{ marginTop: 18, padding: 0, overflow: "hidden" }}>
              <table className="mcl-table">
                <thead><tr><th>AWB</th><th>Route</th><th>Status</th></tr></thead>
                <tbody>
                  {bulkResults.map((r) => (
                    <tr key={r.awb}>
                      <td className="font-mono">{r.awb}</td>
                      <td>{r.found ? `${r.found.consignorCity} → ${r.found.consigneeCity}` : "—"}</td>
                      <td>{r.found ? <StatusBadge status={r.found.status} /> : <span style={{ color: "var(--red)", fontSize: 12.5 }}>Not found</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
      )}

      {searched && !result && !searching && (
        <div className="mcl-card glide-in" style={{ padding: 28, marginTop: 22, textAlign: "center" }}>
          <AlertTriangle color="var(--red)" style={{ margin: "0 auto 10px" }} />
          <div style={{ fontWeight: 700 }}>No parcel found for that AWB number</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6 }}>Double-check the number on your receipt — it's case-insensitive but must match exactly.</div>
        </div>
      )}

      {result && (
        <div className="mcl-card glide-in" style={{ padding: 28, marginTop: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: ".08em" }}>AWB NUMBER</div>
              <div className="font-mono" style={{ fontSize: 21, fontWeight: 600 }}>{result.awb}</div>
            </div>
            <StatusBadge status={result.status} />
          </div>

          <div style={{ margin: "26px 0" }}><RouteRail status={result.status} booking={result} /></div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, fontSize: 13.5 }} className="track-grid">
            <div className="mcl-card-2" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 8 }}>FROM</div>
              <div style={{ fontWeight: 600 }}>{result.consignorCity}</div>
              <div style={{ color: "var(--muted)" }}>{maskAddress(result.consignorAddress)}</div>
            </div>
            <div className="mcl-card-2" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 8 }}>TO</div>
              <div style={{ fontWeight: 600 }}>{result.consigneeCity}</div>
              <div style={{ color: "var(--muted)" }}>{maskAddress(result.consigneeAddress)}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 22, marginTop: 18, flexWrap: "wrap", fontSize: 13.5 }}>
            <div><span style={{ color: "var(--muted)" }}>Weight </span><b>{result.weight} kg</b></div>
            <div><span style={{ color: "var(--muted)" }}>Pieces </span><b>{result.pieces}</b></div>
            <div><span style={{ color: "var(--muted)" }}>Mode </span><b>{result.mode}</b></div>
            <div><span style={{ color: "var(--muted)" }}>Payment </span><PaymentBadge type={result.paymentType} /></div>
            <div><span style={{ color: "var(--muted)" }}>Booked </span><b>{fmtDate(result.createdAt)}</b></div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button className="btn btn-dark btn-sm" onClick={() => onPrint(result)}><Printer size={14} /> Save / print receipt</button>
          </div>
        </div>
      )}

      <style>{`@media (max-width:600px){ .track-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

/* ============================= ADMIN: LOGIN ============================= */

function LoginScreen({ onLogin, branches }) {
  const [role, setRole] = useState("admin");
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  function fail(msg) {
    setErr(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  function submit(e) {
    e.preventDefault();
    if (role === "admin") {
      if (pw === ADMIN_PASS) onLogin({ role: "admin", name: "Admin" });
      else fail("Incorrect admin password.");
      return;
    }
    const branch = branches.find((b) => b.active && b.managerUsername.toLowerCase() === username.trim().toLowerCase());
    if (!branch) { fail("No active branch found for that username."); return; }
    if (branch.managerPassword !== pw) { fail("Incorrect password for this branch."); return; }
    onLogin({ role: "branch", branchId: branch.id, branchName: branch.name, name: branch.name });
  }

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 60px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", overflow: "hidden" }}>
      <div className="login-orbit">
        <span /><span /><span />
      </div>
      <div className={`mcl-card glide-in ${shake ? "shake" : ""}`} style={{ padding: 36, width: 420, maxWidth: "100%", position: "relative", zIndex: 1, boxShadow: "0 30px 80px -30px rgba(212,175,55,.25)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <HeroLogo size={128} />
        </div>
        <div className="font-display" style={{ fontSize: 23, fontWeight: 700, textAlign: "center" }}>{COMPANY.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, marginBottom: 22, textAlign: "center", letterSpacing: ".04em" }}>{COMPANY.tagline}</div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "var(--ink2)", padding: 4, borderRadius: 12 }}>
          <div className={`tab-btn ${role === "admin" ? "active" : ""}`} style={{ flex: 1, justifyContent: "center" }} onClick={() => { setRole("admin"); setErr(""); }}><ShieldCheck size={14} /> Admin</div>
          <div className={`tab-btn ${role === "branch" ? "active" : ""}`} style={{ flex: 1, justifyContent: "center" }} onClick={() => { setRole("branch"); setErr(""); }}><Building2 size={14} /> Branch Manager</div>
        </div>

        <form onSubmit={submit}>
          {role === "branch" && (
            <div style={{ marginBottom: 12 }}>
              <label className="lb">Username</label>
              <input className="in" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. erode.manager" autoFocus />
            </div>
          )}
          <label className="lb">Password</label>
          <div style={{ position: "relative" }}>
            <input className="in" type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoFocus={role === "admin"} style={{ paddingRight: 40 }} />
            <span onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--muted)" }}>
              {showPw ? <X size={15} /> : <Search size={15} />}
            </span>
          </div>
          {err && <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 18 }} type="submit">
            <ShieldCheck size={16} /> Sign in
          </button>
        </form>

        <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 18, lineHeight: 1.6, textAlign: "center" }}>
          Demo admin password: <span className="font-mono">metro2026</span><br />
          Demo branch login: <span className="font-mono">erode.manager</span> / <span className="font-mono">erode123</span>
        </div>
      </div>

      <style>{`
        .login-orbit{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
        .login-orbit span{ position:absolute; border-radius:50%; border:1px solid rgba(212,175,55,.18); }
        .login-orbit span:nth-child(1){ width:340px; height:340px; animation:spin 30s linear infinite; }
        .login-orbit span:nth-child(2){ width:520px; height:520px; border-color:rgba(61,123,250,.12); animation:spin 46s linear infinite reverse; }
        .login-orbit span:nth-child(3){ width:700px; height:700px; border-color:rgba(212,175,55,.08); animation:spin 60s linear infinite; }
        .login-logo-glow{ filter:drop-shadow(0 0 22px rgba(212,175,55,.45)); animation:floaty 4s ease-in-out infinite; }
        .shake{ animation:shakeX .45s; }
        @keyframes shakeX{ 10%,90%{ transform:translateX(-1px);} 20%,80%{ transform:translateX(2px);} 30%,50%,70%{ transform:translateX(-4px);} 40%,60%{ transform:translateX(4px);} }
      `}</style>
    </div>
  );
}

/* ============================= ADMIN: NEW BOOKING ============================= */

function NewBooking({ onSave, notify, customers = [], branches = [], currentUser, existingAwbs }) {
  const isBranchUser = currentUser.role === "branch";
  const defaultBranchId = isBranchUser ? currentUser.branchId : (branches[0] && branches[0].id) || "";
  const [form, setForm] = useState(emptyForm(defaultBranchId));
  const [saved, setSaved] = useState(null);
  const [awbError, setAwbError] = useState("");
  const total = ["amount", "otherCharges", "fodCharges", "awbCharges", "pickupCharges", "deliveryCharges", "fuelCharges", "ewayCharges", "rcmGst"]
    .reduce((s, k) => s + (Number(form[k]) || 0), 0);
  const suggested = estimateFreight(form.weight, form.mode);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const etaPreview = useMemo(() => {
    if (!form.consignorCity || !form.consigneeCity) return null;
    return buildStagePlan({
      createdAt: new Date().toISOString(),
      consignorCity: form.consignorCity, consignorCountry: form.consignorCountry,
      consigneeCity: form.consigneeCity, consigneeCountry: form.consigneeCountry,
      mode: form.mode,
    });
  }, [form.consignorCity, form.consignorCountry, form.consigneeCity, form.consigneeCountry, form.mode]);

  function pickCustomer(name) {
    const c = customers.find((x) => x.consignorName === name);
    if (!c) return;
    setForm((f) => ({ ...f, consignorName: c.consignorName, consignorPhone: c.consignorPhone, consignorAddress: c.consignorAddress, consignorCity: c.consignorCity, consignorPincode: c.consignorPincode }));
  }

  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setAwbError("");
    if (!form.consignorName || !form.consigneeName || !form.consigneePhone || !form.weight) {
      notify({ title: "Missing details", msg: "Fill in consignor name, consignee name, consignee phone and weight.", color: "var(--gold)" });
      return;
    }
    if (!form.branchId) {
      notify({ title: "Select a branch", msg: "Every booking must belong to a branch.", color: "var(--gold)" });
      return;
    }
    if (form.awbMode === "manual") {
      const candidate = form.manualAwb.trim().toUpperCase();
      if (!AWB_REGEX.test(candidate)) {
        setAwbError("AWB must be MCL followed by exactly 7 digits, e.g. MCL2026001.");
        return;
      }
      if (existingAwbs.has(candidate)) {
        setAwbError("This AWB number already exists. Each AWB must be unique.");
        return;
      }
    }
    if (form.invoiceValue && Number(form.invoiceValue) < 0) {
      notify({ title: "Invalid invoice value", msg: "Invoice value can't be negative.", color: "var(--gold)" });
      return;
    }
    setSaving(true);
    const booking = await onSave(form, total);
    setSaving(false);
    if (!booking) {
      setAwbError("That AWB was just taken by another booking — please try again.");
      return;
    }
    setSaved(booking);
    setForm(emptyForm(defaultBranchId));
    notify({ title: "Booking saved", msg: booking.awb, color: "var(--green)" });
  }

  if (saved) {
    return (
      <div className="mcl-card ring-pop" style={{ padding: 32, maxWidth: 560, margin: "0 auto" }}>
        <div style={{ width: 50, height: 50, borderRadius: 999, background: "rgba(46,212,146,.14)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path className="check-draw" d="M4 12.5L9.5 18L20 6" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>Booking saved</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6 }}>{saved.awbMode === "manual" ? "Manual AWB number recorded." : "AWB number generated automatically."}</div>
        <div className="mcl-card-2" style={{ padding: 18, marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="font-mono" style={{ fontSize: 19, fontWeight: 600 }}>{saved.awb}</span>
          <StatusBadge status={saved.status} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" onClick={() => sendWhatsapp(saved)}><MessageCircle size={14} /> Send WhatsApp POD</button>
          <button className="btn btn-dark btn-sm" onClick={() => setSaved(null)}><PlusCircle size={14} /> Book another parcel</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="glide-in">
      <div className="mcl-card" style={{ padding: 22, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontWeight: 700 }}><ScanLine size={16} color="var(--brand)" /> AWB generation</div>
        <div style={{ display: "flex", gap: 10, marginBottom: form.awbMode === "manual" ? 12 : 0, flexWrap: "wrap" }}>
          <label className={`tab-btn ${form.awbMode === "auto" ? "active" : ""}`} style={{ cursor: "pointer" }}>
            <input type="radio" checked={form.awbMode === "auto"} onChange={() => { set("awbMode", "auto"); setAwbError(""); }} style={{ display: "none" }} />
            <RefreshCcw size={14} /> Automatic — system generates the AWB
          </label>
          <label className={`tab-btn ${form.awbMode === "manual" ? "active" : ""}`} style={{ cursor: "pointer" }}>
            <input type="radio" checked={form.awbMode === "manual"} onChange={() => { set("awbMode", "manual"); setAwbError(""); }} style={{ display: "none" }} />
            <FileText size={14} /> Manual — enter an AWB already printed
          </label>
        </div>
        {form.awbMode === "manual" && (
          <div>
            <label className="lb">AWB number (format: MCL + 7 digits, e.g. MCL2026001)</label>
            <input className="in font-mono" value={form.manualAwb} onChange={(e) => { set("manualAwb", e.target.value); setAwbError(""); }} placeholder="MCL2026001" />
            {awbError && <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 6 }}>{awbError}</div>}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, alignItems: "start" }} className="form-grid">
        <div className="mcl-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}><Building2 size={16} color="var(--brand)" /> Consignor (From)</div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {customers.length > 0 && (
              <div>
                <label className="lb">Quick-select saved customer</label>
                <select className="in" defaultValue="" onChange={(e) => e.target.value && pickCustomer(e.target.value)}>
                  <option value="">— choose a repeat customer —</option>
                  {customers.map((c) => <option key={c.consignorName + c.consignorPhone} value={c.consignorName}>{c.consignorName} · {c.consignorPhone}</option>)}
                </select>
              </div>
            )}
            <div><label className="lb">Branch</label>
              {isBranchUser ? (
                <div className="in" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}><ShieldCheck size={14} /> {currentUser.branchName}</div>
              ) : (
                <select className="in" value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>
                  <option value="">— select branch —</option>
                  {branches.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
            <div><label className="lb">Full name *</label><input className="in" value={form.consignorName} onChange={(e) => set("consignorName", e.target.value)} placeholder="Consignor's name" /></div>
            <div><label className="lb">Phone</label><input className="in" value={form.consignorPhone} onChange={(e) => set("consignorPhone", e.target.value)} placeholder="10-digit mobile number" /></div>
            <div><label className="lb">Address</label><input className="in" value={form.consignorAddress} onChange={(e) => set("consignorAddress", e.target.value)} placeholder="Street, area" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label className="lb">City / State / District</label><input className="in" value={form.consignorCity} onChange={(e) => set("consignorCity", e.target.value)} /></div>
              <div><label className="lb">Pincode</label><input className="in" value={form.consignorPincode} onChange={(e) => set("consignorPincode", e.target.value)} /></div>
            </div>
            <div><label className="lb">Country</label>
              <input className="in" list="mcl-country-list" value={form.consignorCountry} onChange={(e) => set("consignorCountry", e.target.value)} placeholder="India" />
            </div>
          </div>
        </div>

        <div className="mcl-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontWeight: 700 }}><User size={16} color="var(--brand)" /> Consignee (To)</div>
          <div style={{ display: "grid", gap: 12 }}>
            <div><label className="lb">Full name *</label><input className="in" value={form.consigneeName} onChange={(e) => set("consigneeName", e.target.value)} placeholder="Consignee's name" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label className="lb">Phone *</label><input className="in" value={form.consigneePhone} onChange={(e) => set("consigneePhone", e.target.value)} placeholder="10-digit mobile number" /></div>
              <div><label className="lb">WhatsApp no.</label><input className="in" value={form.consigneeWhatsapp} onChange={(e) => set("consigneeWhatsapp", e.target.value)} placeholder="Defaults to phone" /></div>
            </div>
            <div><label className="lb">Address</label><input className="in" value={form.consigneeAddress} onChange={(e) => set("consigneeAddress", e.target.value)} placeholder="Street, area" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label className="lb">City / State / District</label><input className="in" value={form.consigneeCity} onChange={(e) => set("consigneeCity", e.target.value)} /></div>
              <div><label className="lb">Pincode</label><input className="in" value={form.consigneePincode} onChange={(e) => set("consigneePincode", e.target.value)} /></div>
            </div>
            <div><label className="lb">Country</label>
              <input className="in" list="mcl-country-list" value={form.consigneeCountry} onChange={(e) => set("consigneeCountry", e.target.value)} placeholder="India" />
            </div>
            <div><label className="lb">Delivery type</label>
              <select className="in" value={form.deliveryType} onChange={(e) => set("deliveryType", e.target.value)}>
                {DELIVERY_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        <datalist id="mcl-country-list">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>

        <div className="mcl-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontWeight: 700 }}><Weight size={16} color="var(--brand)" /> Parcel details</div>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label className="lb">Weight (kg) *</label><input className="in" type="number" step="0.1" value={form.weight} onChange={(e) => set("weight", e.target.value)} placeholder="2.5" /></div>
              <div><label className="lb">Pieces</label><input className="in" type="number" min="1" value={form.pieces} onChange={(e) => set("pieces", e.target.value)} /></div>
            </div>
            <div>
              <label className="lb">Size — L × B × H (cm), optional</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <input className="in" type="number" step="0.1" value={form.lengthCm} onChange={(e) => set("lengthCm", e.target.value)} placeholder="L" />
                <input className="in" type="number" step="0.1" value={form.widthCm} onChange={(e) => set("widthCm", e.target.value)} placeholder="B" />
                <input className="in" type="number" step="0.1" value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} placeholder="H" />
              </div>
            </div>
            <div><label className="lb">Description</label><input className="in" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Documents, garments, electronics…" /></div>
            <div><label className="lb">Service mode</label>
              <select className="in" value={form.mode} onChange={(e) => set("mode", e.target.value)}>
                <option value="Surface">Surface (Road/Train)</option>
                <option value="Express">Express (Priority Road)</option>
                <option value="Air">Air</option>
              </select>
            </div>
            <div><label className="lb">Expected delivery <span style={{ fontWeight: 400, color: "var(--muted)" }}>(auto-estimated, editable)</span></label><input className="in" type="date" value={form.expectedDelivery} onChange={(e) => set("expectedDelivery", e.target.value)} /></div>
            {etaPreview && (
              <div className="mcl-card-2" style={{ padding: 12, fontSize: 12.5, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <span style={{ color: "var(--muted)" }}>Auto-tracking estimate</span>
                <span><b>{etaPreview.km} km</b> · {etaPreview.international ? "International" : "Domestic"} · ETA <b>{formatEta(etaPreview.etaISO)}</b></span>
              </div>
            )}
          </div>
        </div>

        <div className="mcl-card payment-card" style={{ padding: 22, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontWeight: 700 }}><Wallet size={16} color="var(--brand)" /> Payment</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 26 }} className="payment-grid">
            <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label className="lb">Payment type</label>
                  <select className="in" value={form.paymentType} onChange={(e) => set("paymentType", e.target.value)}>
                    <option>Paid</option><option>ToPay</option><option>Credit</option>
                  </select>
                </div>
                <div><label className="lb">Freight amount</label><input className="in" type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" /></div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -6 }}>{PAYMENT_INFO[form.paymentType].note}</div>
              {suggested > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--muted)", flexWrap: "wrap", gap: 6 }}>
                  <span>Suggested {form.mode} rate for {form.weight}kg: <b style={{ color: "var(--text)" }}>{currency(suggested)}</b></span>
                  <button type="button" className="btn btn-dark btn-sm" onClick={() => set("amount", String(suggested))}>Use rate</button>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label className="lb">Invoice number</label><input className="in" value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} placeholder="INV-0001" /></div>
                <div><label className="lb">Invoice value</label><input className="in" type="number" value={form.invoiceValue} onChange={(e) => set("invoiceValue", e.target.value)} placeholder="0" /></div>
              </div>
              <div><label className="lb">E-Way bill number</label><input className="in font-mono" value={form.ewayBill} onChange={(e) => set("ewayBill", e.target.value)} placeholder="Required for goods above the GST threshold" /></div>
              <div><label className="lb">Remarks</label><input className="in" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} placeholder="Handle with care, fragile, etc." /></div>
            </div>

            <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
              <label className="lb">Charges breakdown — printed on the receipt</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }} className="charges-grid">
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>FOD charges</span><input className="in" type="number" value={form.fodCharges} onChange={(e) => set("fodCharges", e.target.value)} placeholder="0" /></div>
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>AWB charges</span><input className="in" type="number" value={form.awbCharges} onChange={(e) => set("awbCharges", e.target.value)} placeholder="0" /></div>
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>Pickup charges</span><input className="in" type="number" value={form.pickupCharges} onChange={(e) => set("pickupCharges", e.target.value)} placeholder="0" /></div>
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>Delivery charges</span><input className="in" type="number" value={form.deliveryCharges} onChange={(e) => set("deliveryCharges", e.target.value)} placeholder="0" /></div>
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>Fuel charges</span><input className="in" type="number" value={form.fuelCharges} onChange={(e) => set("fuelCharges", e.target.value)} placeholder="0" /></div>
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>E-Way charges</span><input className="in" type="number" value={form.ewayCharges} onChange={(e) => set("ewayCharges", e.target.value)} placeholder="0" /></div>
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>Other charges</span><input className="in" type="number" value={form.otherCharges} onChange={(e) => set("otherCharges", e.target.value)} placeholder="0" /></div>
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>RCM GST</span><input className="in" type="number" value={form.rcmGst} onChange={(e) => set("rcmGst", e.target.value)} placeholder="0" /></div>
                <div><span style={{ fontSize: 11.5, color: "var(--muted)" }}>GST % (printed on receipt)</span><input className="in" type="number" value={form.gstPercent} onChange={(e) => set("gstPercent", e.target.value)} placeholder="e.g. 18" /></div>
              </div>
              <div className="mcl-card-2" style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>GRAND TOTAL</span>
                <span className="font-display" style={{ fontSize: 24, fontWeight: 700, color: "var(--brand)" }}>{currency(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mcl-card" style={{ padding: 22, marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowAdvanced(!showAdvanced)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}><FileText size={16} color="var(--brand)" /> Advanced / MIS details</div>
          <ChevronRight size={16} style={{ transform: showAdvanced ? "rotate(90deg)" : "none", transition: "transform .25s ease" }} />
        </div>
        {showAdvanced && (
          <div className="glide-in advanced-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
            <div><label className="lb">Client / account</label><input className="in" value={form.clientAccount} onChange={(e) => set("clientAccount", e.target.value)} placeholder="Cash Customer" /></div>
            <div><label className="lb">Consignee company</label><input className="in" value={form.consigneeCompany} onChange={(e) => set("consigneeCompany", e.target.value)} placeholder="Optional company name" /></div>
            <div><label className="lb">ODA / Regular</label>
              <select className="in" value={form.oda} onChange={(e) => set("oda", e.target.value)}>
                <option>Regular</option><option>ODA</option>
              </select>
            </div>
            <div><label className="lb">Shipment type</label>
              <select className="in" value={form.shipmentType} onChange={(e) => set("shipmentType", e.target.value)}>
                {SHIPMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="lb">PO number</label><input className="in" value={form.poNumber} onChange={(e) => set("poNumber", e.target.value)} placeholder="Customer PO reference" /></div>
            <div><label className="lb">Forwarder name</label><input className="in" value={form.forwarderName} onChange={(e) => set("forwarderName", e.target.value)} placeholder="If interlined via another carrier" /></div>
            <div><label className="lb">Forwarder LR number</label><input className="in font-mono" value={form.forwarderLrNo} onChange={(e) => set("forwarderLrNo", e.target.value)} placeholder="Forwarder's LR / tracking no." /></div>
          </div>
        )}
      </div>

      <button className="btn btn-primary" style={{ marginTop: 20, width: "100%", justifyContent: "center", padding: "13px 20px" }} type="submit" disabled={saving}>
        {saving ? <RefreshCcw size={17} className="spin-slow" /> : <ScanLine size={17} />} {saving ? "Saving…" : (form.awbMode === "manual" ? "Save booking with manual AWB" : "Generate AWB & save booking")}
      </button>

      <style>{`
        @media (max-width:1240px){ .form-grid{ grid-template-columns:1fr 1fr !important; } }
        @media (max-width:860px){ .form-grid{ grid-template-columns:1fr !important; } .advanced-grid{ grid-template-columns:1fr !important; } .charges-grid{ grid-template-columns:1fr 1fr !important; } .payment-grid{ grid-template-columns:1fr !important; } }
        @media (max-width:560px){ .charges-grid{ grid-template-columns:1fr !important; } }
      `}</style>
    </form>
  );
}

function sendWhatsapp(b) {
  const phone = digitsOnly(b.consigneeWhatsapp || b.consigneePhone);
  const withCountry = phone.length === 10 ? "91" + phone : phone;
  const msg =
    `Hi ${b.consigneeName}, your parcel has been booked with ${COMPANY.name}.\n\n` +
    `AWB: ${b.awb}\nFrom: ${b.consignorCity}\nTo: ${b.consigneeCity}\nWeight: ${b.weight}kg\n` +
    `Payment: ${b.paymentType} - ${currency(b.total)}\nExpected delivery: ${b.expectedDelivery || "TBD"}\n\n` +
    `Track anytime using your AWB number. For help call ${COMPANY.mobile}. Thank you for shipping with us!`;
  window.open(`https://wa.me/${withCountry}?text=${encodeURIComponent(msg)}`, "_blank");
}

/* ============================= ADMIN: BOOKINGS TABLE ============================= */

function BookingsTable({ bookings, onUpdateStatus, onPrint, onDelete, notify }) {
  const [range, setRange] = useState("all");
  const [q, setQ] = useState("");
  const [copiedAwb, setCopiedAwb] = useState("");
  const [confirmDel, setConfirmDel] = useState("");
  const [ndrModal, setNdrModal] = useState(null); // { awb }

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => dateInRange(b.createdAt, range))
      .filter((b) => {
        if (!q.trim()) return true;
        const s = q.toLowerCase();
        return b.awb.toLowerCase().includes(s) || b.consigneeName.toLowerCase().includes(s) ||
          b.consigneePhone.includes(s) || b.consignorName.toLowerCase().includes(s);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [bookings, range, q]);

  function exportExcel() {
    const rows = filtered.map((b) => ({
      AWB: b.awb, Status: b.status, Booked: fmtDate(b.createdAt), Branch: b.branchName || "",
      Client: b.clientAccount, Consignor: b.consignorName, "Consignor City": b.consignorCity, "Consignor Phone": b.consignorPhone,
      Consignee: b.consigneeName, "Consignee Company": b.consigneeCompany, "Consignee City": b.consigneeCity, "Consignee Phone": b.consigneePhone,
      "Weight (kg)": b.weight, Pieces: b.pieces, Mode: b.mode, "Delivery Type": b.deliveryType, "ODA/Regular": b.oda, "Shipment Type": b.shipmentType,
      "Payment Type": b.paymentType, Amount: b.amount, "Other Charges": b.otherCharges, Total: b.total,
      "Invoice No": b.invoiceNumber, "Invoice Value": b.invoiceValue, "E-Way Bill": b.ewayBill, "PO Number": b.poNumber,
      "Forwarder Name": b.forwarderName, "Forwarder LR No": b.forwarderLrNo, "RTO Awb No": b.rtoAwbNo,
      "On Time/Delay": onTimeStatus(b), "Delay Days": delayDays(b),
      Remarks: b.remarks,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    XLSX.writeFile(wb, `metro-bookings-${range}-${Date.now()}.xlsx`);
    notify({ title: "Excel exported", msg: `${rows.length} bookings`, color: "var(--blue)" });
  }
  function copyAwb(awb) { setCopiedAwb(awb); setTimeout(() => setCopiedAwb(""), 1500); }

  return (
    <div className="glide-in">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["today", "week", "month", "year", "all"].map((r) => (
            <div key={r} className={`tab-btn ${range === r ? "active" : ""}`} onClick={() => setRange(r)} style={{ textTransform: "capitalize" }}><Calendar size={13} /> {r}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="in" style={{ width: 220 }} placeholder="Search AWB, name, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-dark btn-sm" onClick={exportExcel}><FileSpreadsheet size={14} /> Export Excel</button>
        </div>
      </div>

      <div className="mcl-card" style={{ overflowX: "auto", padding: filtered.length ? 0 : 40 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)" }}>
            <Boxes size={30} style={{ margin: "0 auto 10px", opacity: .5 }} />
            <div style={{ fontWeight: 600, color: "var(--text)" }}>No bookings in this range yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Create a booking from the "New Booking" tab to see it here.</div>
          </div>
        ) : (
          <table className="mcl-table">
            <thead><tr><th>AWB</th><th>Branch</th><th>Route</th><th>Consignee</th><th>Wt</th><th>Payment</th><th>Total</th><th>Status</th><th>Booked</th><th></th></tr></thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.awb}>
                  <td>
                    <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                      {b.awb}
                      <span onClick={() => { navigator.clipboard?.writeText(b.awb); copyAwb(b.awb); }} style={{ cursor: "pointer", color: "var(--muted)" }}>
                        {copiedAwb === b.awb ? <Check size={13} color="var(--green)" /> : <Copy size={13} />}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{b.branchName || "—"}</td>
                  <td>{b.consignorCity} <ArrowRight size={11} style={{ margin: "0 2px", opacity: .6 }} /> {b.consigneeCity}</td>
                  <td>
                    {b.consigneeName}<div style={{ fontSize: 11.5, color: "var(--muted)" }}>{b.consigneePhone}</div>
                    {b.status === "NDR" && b.ndrReason && <div style={{ fontSize: 11, color: "var(--gold)", marginTop: 2 }}>NDR: {b.ndrReason}</div>}
                  </td>
                  <td>{b.weight}kg</td>
                  <td>
                    <PaymentBadge type={b.paymentType} />
                    {b.paymentType === "ToPay" && b.status === "Delivered" && (
                      <div style={{ fontSize: 10.5, marginTop: 4, color: b.codRemitted ? "var(--green)" : "var(--gold)" }}>{b.codRemitted ? "COD remitted" : "COD pending"}</div>
                    )}
                  </td>
                  <td style={{ fontWeight: 700 }}>{currency(b.total)}</td>
                  <td>
                    <select className="in" style={{ padding: "5px 8px", fontSize: 12 }} value={b.status} onChange={(e) => {
                      const val = e.target.value;
                      if (val === "NDR") {
                        setNdrModal({ awb: b.awb });
                      } else if (val === "Delivered") {
                        onUpdateStatus(b.awb, val, { ndrReason: null, deliveredAt: new Date().toISOString() });
                      } else if (val === "RTO") {
                        onUpdateStatus(b.awb, val, { ndrReason: null, rtoAwbNo: b.rtoAwbNo || ("R" + b.awb) });
                      } else {
                        onUpdateStatus(b.awb, val, { ndrReason: null });
                      }
                    }}>
                      {STATUS_STEPS.map((s) => <option key={s}>{s}</option>)}
                      <option>NDR</option>
                      <option>RTO</option>
                    </select>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDateShort(b.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {b.status === "NDR" && (
                        <button className="btn btn-sm" style={{ background: "var(--gold)", color: "#1A1408" }}
                          onClick={() => onUpdateStatus(b.awb, "Out for Delivery", { ndrReason: null, reattempts: (b.reattempts || 0) + 1 })}
                          title="Reattempt delivery">Reattempt</button>
                      )}
                      {b.paymentType === "ToPay" && b.status === "Delivered" && !b.codRemitted && (
                        <button className="btn btn-dark btn-sm" onClick={() => onUpdateStatus(b.awb, b.status, { codRemitted: true })} title="Mark COD remitted"><Wallet size={13} /></button>
                      )}
                      <button className="btn btn-dark btn-sm" onClick={() => onPrint(b)} title="Print / PDF"><Printer size={13} /></button>
                      <button className="btn btn-dark btn-sm" onClick={() => sendWhatsapp(b)} title="Send WhatsApp"><MessageCircle size={13} /></button>
                      {confirmDel === b.awb ? (
                        <button className="btn btn-sm" style={{ background: "var(--red)", color: "#fff" }} onClick={() => { onDelete(b.awb); notify({ title: "Booking deleted", msg: b.awb, color: "var(--red)" }); setConfirmDel(""); }}>Confirm</button>
                      ) : (
                        <button className="btn btn-dark btn-sm" onClick={() => setConfirmDel(b.awb)} title="Delete"><Trash2 size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ndrModal && (
        <NdrReasonModal
          awb={ndrModal.awb}
          onCancel={() => setNdrModal(null)}
          onConfirm={(reason) => {
            onUpdateStatus(ndrModal.awb, "NDR", { ndrReason: reason });
            setNdrModal(null);
          }}
        />
      )}
    </div>
  );
}

function NdrReasonModal({ awb, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(NDR_REASONS[0]);
  const [custom, setCustom] = useState("");
  const isOther = selected === "Other";
  const canConfirm = isOther ? custom.trim().length > 0 : true;

  return (
    <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(3,4,8,.7)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onCancel}>
      <div className="mcl-card glide-in" style={{ padding: 26, width: 440, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,176,32,.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={17} color="var(--gold)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>Reason for failed delivery</div>
            <div className="font-mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{awb}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
          {NDR_REASONS.map((r) => (
            <div
              key={r}
              onClick={() => setSelected(r)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${selected === r ? "var(--brand)" : "var(--line)"}`,
                background: selected === r ? "rgba(212,175,55,.1)" : "var(--panel2)",
                transition: "border-color .2s ease, background .2s ease",
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${selected === r ? "var(--brand)" : "var(--muted2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {selected === r && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand)" }} />}
              </div>
              <span style={{ fontSize: 14 }}>{r}</span>
            </div>
          ))}
          {isOther && (
            <input className="in glide-in" autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Describe the reason…" style={{ marginTop: 2 }} />
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button className="btn btn-dark" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={!canConfirm} onClick={() => onConfirm(isOther ? custom.trim() : selected)}>Save reason</button>
        </div>
      </div>
    </div>
  );
}

/* ============================= ADMIN: OVERVIEW / CHARTS ============================= */

function Overview({ bookings }) {
  const last14 = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const count = bookings.filter((b) => new Date(b.createdAt).toDateString() === key).length;
      days.push({ day: fmtDateShort(d.toISOString()), count });
    }
    return days;
  }, [bookings]);

  const last6Months = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.getMonth() + "-" + d.getFullYear();
      const rev = bookings.filter((b) => { const bd = new Date(b.createdAt); return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear(); })
        .reduce((s, b) => s + (Number(b.total) || 0), 0);
      months.push({ month: fmtMonth(d.toISOString()), revenue: rev });
    }
    return months;
  }, [bookings]);

  const paymentSplit = useMemo(() => {
    const totals = { Paid: 0, ToPay: 0, Credit: 0 };
    bookings.forEach((b) => { totals[b.paymentType] = (totals[b.paymentType] || 0) + (Number(b.total) || 0); });
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [bookings]);

  const COLORS = { Paid: "#2ED492", ToPay: "#FFB020", Credit: "#3D7BFA" };
  const totalRevenue = bookings.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const delivered = bookings.filter((b) => b.status === "Delivered").length;
  const pending = bookings.filter((b) => b.status !== "Delivered" && b.status !== "RTO").length;
  const recentActivity = [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

  const todayStr = new Date().toDateString();
  const bookedToday = bookings.filter((b) => new Date(b.createdAt).toDateString() === todayStr).length;
  const deliveredToday = bookings.filter((b) => b.deliveredAt && new Date(b.deliveredAt).toDateString() === todayStr).length;
  const outForDeliveryToday = bookings.filter((b) => b.status === "Out for Delivery").length;
  const delayedToday = bookings.filter((b) => onTimeStatus(b) === "Delay").length;

  return (
    <div className="glide-in">
      <div className="mcl-card" style={{ padding: "16px 22px", marginBottom: 18, background: "linear-gradient(135deg, var(--panel-solid), var(--navy2))", border: "1px solid rgba(212,175,55,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontWeight: 700, fontSize: 13.5 }}>
          <Sparkles size={15} color="var(--brand)" /> Today's booking &amp; delivery snapshot
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }} className="today-grid">
          <div><div className="font-display" style={{ fontSize: 24, fontWeight: 700 }}>{bookedToday}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>Booked today</div></div>
          <div><div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: "var(--green)" }}>{deliveredToday}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>Delivered today</div></div>
          <div><div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: "var(--gold)" }}>{outForDeliveryToday}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>Out for delivery</div></div>
          <div><div className="font-display" style={{ fontSize: 24, fontWeight: 700, color: delayedToday > 0 ? "var(--red)" : "var(--text)" }}>{delayedToday}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>Running delayed</div></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 22 }} className="kpi-grid">
        <KPI icon={Boxes} label="Total bookings" value={bookings.length} sub="All time" />
        <KPI icon={Wallet} label="Total revenue" value={currency(totalRevenue)} sub="Paid + ToPay + Credit" color="var(--green)" />
        <KPI icon={Truck} label="In pipeline" value={pending} sub="Not yet delivered" color="var(--blue)" />
        <KPI icon={CheckCircle2} label="Delivered" value={delivered} sub="Completed parcels" color="var(--brand)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }} className="chart-grid">
        <div className="mcl-card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Bookings — last 14 days</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Daily parcel volume</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={last14}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, color: "#fff" }} />
              <Bar dataKey="count" fill="#E0233C" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mcl-card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Revenue by payment type</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>All-time totals</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={paymentSplit} dataKey="value" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={3}>
                {paymentSplit.map((entry, i) => <Cell key={i} fill={COLORS[entry.name]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, color: "#fff" }} formatter={(v) => currency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }} className="chart-grid">
        <div className="mcl-card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Revenue trend — 6 months</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Booked value by month</div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={last6Months}>
              <defs><linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E0233C" stopOpacity={0.5} /><stop offset="100%" stopColor="#E0233C" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, color: "#fff" }} formatter={(v) => currency(v)} />
              <Area type="monotone" dataKey="revenue" stroke="#E0233C" fill="url(#revFill)" strokeWidth={2.4} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mcl-card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><Activity size={15} color="var(--brand)" /> Recent activity</div>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {recentActivity.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No bookings yet.</div>}
            {recentActivity.map((b, i) => (
              <div key={b.awb} className="glide-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, animationDelay: `${i * .05}s` }}>
                <div className="font-mono" style={{ color: "var(--muted)" }}>{b.awb}</div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width:900px){ .kpi-grid{ grid-template-columns:1fr 1fr !important; } .chart-grid{ grid-template-columns:1fr !important; } .today-grid{ grid-template-columns:1fr 1fr !important; } }
        @media (max-width:520px){ .kpi-grid{ grid-template-columns:1fr !important; } .today-grid{ grid-template-columns:1fr 1fr !important; } }
      `}</style>
    </div>
  );
}

/* ============================= PRINTABLE WAYBILL ============================= */

function ConsignmentCheckbox({ label, checked }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5 }}>
      <div style={{ width: 11, height: 11, border: "1.3px solid #1A1408", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {checked && <Check size={9} strokeWidth={3.5} />}
      </div>
      {label}
    </div>
  );
}

function ConsignmentBar({ children }) {
  return (
    <div style={{ background: "#12172a", color: "#fff", fontWeight: 700, fontSize: 11, letterSpacing: ".04em", padding: "4px 10px" }}>
      {children}
    </div>
  );
}

// Matches the company's actual paper consignment note exactly: logo header,
// PICKUP DETAILS box, NATURE OF GOODS box, AIRWAY BILL NO. box, consignor/
// consignee blocks and a vertical copy-label strip — three copies (Consignor
// / Consignee / POD) print together on a single A4 sheet.
function ConsignmentCopy({ booking, branch, copyLabel }) {
  const natureChecks = {
    dox: booking.shipmentType === "Document",
    nonDox: booking.shipmentType !== "Document",
    cash: booking.paymentType === "Paid",
    toPay: booking.paymentType === "ToPay",
    credit: booking.paymentType === "Credit",
  };
  const modeChecks = {
    air: booking.mode === "Air",
    train: false,
    surface: booking.mode === "Surface" || booking.mode === "Express",
  };
  const size = [booking.lengthCm, booking.widthCm, booking.heightCm];
  const hasSize = size.some((v) => v);
  const total = ["amount", "otherCharges", "fodCharges", "awbCharges", "pickupCharges", "deliveryCharges", "fuelCharges", "ewayCharges", "rcmGst"]
    .reduce((s, k) => s + (Number(booking[k]) || 0), 0);
  const bookedByName = (branch && branch.managerName) || COMPANY.md;
  const branchName = branch ? branch.name : COMPANY.name;

  return (
    <div style={{ border: "1.6px solid #1A1408", display: "grid", gridTemplateColumns: "1.15fr 1.3fr 1.15fr 20px", fontFamily: "var(--font-body)", color: "#1A1408", background: "#fff", fontSize: 11 }}>
      {/* ---- Column 1: identity + consignor/consignee ---- */}
      <div style={{ borderRight: "1.6px solid #1A1408", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 10px", borderBottom: "1.6px solid #1A1408", display: "flex", gap: 7, alignItems: "flex-start" }}>
          <img src={LOGO_SRC} alt="logo" style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }} />
          <div>
            <div className="font-display" style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.08 }}>METRO</div>
            <div style={{ fontSize: 8.7, fontWeight: 700, letterSpacing: ".03em" }}>COURIER AND LOGISTICS</div>
            <div style={{ fontSize: 7, letterSpacing: ".14em", color: "#6b5f3f" }}>— THE LOAD POINT —</div>
            <div style={{ fontSize: 7, marginTop: 3, lineHeight: 1.3, color: "#3a3222" }}>
              {branch ? branch.address : COMPANY.address}<br />GST: {COMPANY.gst}
            </div>
          </div>
        </div>

        <div style={{ padding: "7px 10px", borderBottom: "1.6px solid #1A1408" }}>
          <div style={{ fontWeight: 700, fontSize: 10 }}>CONSIGNOR</div>
          <div style={{ fontSize: 10.5, marginTop: 2 }}>Name: {booking.consignorName}</div>
          <div style={{ fontSize: 10.5 }}>Address: {booking.consignorAddress}</div>
          <div style={{ fontSize: 9.8 }}>Phone: {booking.consignorPhone}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.8 }}>
            <span>City: {booking.consignorCity}</span><span>PIN: {booking.consignorPincode}</span>
          </div>
        </div>

        <div style={{ padding: "7px 10px", flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 10 }}>CONSIGNEE</div>
          <div style={{ fontSize: 10.5, marginTop: 2 }}>Name: {booking.consigneeName}</div>
          <div style={{ fontSize: 10.5 }}>Address: {booking.consigneeAddress}</div>
          <div style={{ fontSize: 9.8 }}>Phone: {booking.consigneePhone}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.8 }}>
            <span>City: {booking.consigneeCity}</span><span>PIN: {booking.consigneePincode}</span>
          </div>
        </div>
      </div>

      {/* ---- Column 2: pickup details + nature of goods + total ---- */}
      <div style={{ borderRight: "1.6px solid #1A1408", display: "flex", flexDirection: "column" }}>
        <ConsignmentBar>PICKUP DETAILS</ConsignmentBar>
        <div style={{ padding: "7px 10px", fontSize: 10.3, borderBottom: "1.6px solid #1A1408", lineHeight: 1.75 }}>
          <div>EMP. NAME &amp; SIGN.: <b>{bookedByName} - {branchName}</b></div>
          <div>DATE: <b>{fmtDate(booking.createdAt).split(",")[0]}</b></div>
          <div>TIME: <b>{new Date(booking.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</b></div>
          <div>Declared Invoice Value Rs.: <b>{booking.invoiceValue ? currency(booking.invoiceValue) : "—"}</b></div>
        </div>

        <ConsignmentBar>NATURE OF GOODS</ConsignmentBar>
        <div style={{ padding: "7px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, borderBottom: "1.6px solid #1A1408" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <ConsignmentCheckbox label="DOX" checked={natureChecks.dox} />
            <ConsignmentCheckbox label="NON DOX" checked={natureChecks.nonDox} />
            <ConsignmentCheckbox label="CASH" checked={natureChecks.cash} />
            <ConsignmentCheckbox label="TO-PAY" checked={natureChecks.toPay} />
            <ConsignmentCheckbox label="CREDIT" checked={natureChecks.credit} />
          </div>
          <div style={{ fontSize: 10.3, display: "grid", gap: 4, alignContent: "start" }}>
            <div>WEIGHT: <b>{booking.weight} Kg</b></div>
            <div>No.of Pcs: <b>{booking.pieces}</b></div>
            <div>CONTENT: <b>{booking.description || "—"}</b></div>
            <div>FUEL CHARGES: <b>{currency(Number(booking.fuelCharges) || 0)}</b></div>
            <div>GST: <b>{booking.gstPercent ? `${booking.gstPercent}%` : "—"}</b></div>
          </div>
        </div>

        <div style={{ padding: "7px 10px", borderBottom: "1.6px solid #1A1408", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 11 }}>TOTAL AMOUNT</span>
          <span className="font-mono" style={{ fontWeight: 800, fontSize: 13 }}>{currency(total)}/-</span>
        </div>

        <div style={{ padding: "7px 10px", fontSize: 10.3, display: "flex", gap: 12, borderBottom: "1.6px solid #1A1408" }}>
          <span>SIZE:</span>
          <span>L <b style={{ borderBottom: "1px solid #1A1408", padding: "0 7px" }}>{hasSize ? booking.lengthCm : ""}</b></span>
          <span>B <b style={{ borderBottom: "1px solid #1A1408", padding: "0 7px" }}>{hasSize ? booking.widthCm : ""}</b></span>
          <span>H <b style={{ borderBottom: "1px solid #1A1408", padding: "0 7px" }}>{hasSize ? booking.heightCm : ""}</b></span>
        </div>

        <div style={{ padding: "7px 10px", fontSize: 7.6, color: "#3a3222", lineHeight: 1.45 }}>
          This is a non-negotiable Consignment note and is subject to standard conditions of carriage. Carrier's liability is limited to Rs. 100/- per consignment for any case.
        </div>
      </div>

      {/* ---- Column 3: AWB, e-way, mode, contact, POD ---- */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "9px 10px", borderBottom: "1.6px solid #1A1408" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#6b5f3f" }}>AIRWAY BILL NO.</div>
          <div className="font-mono" style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".02em" }}>{booking.awb}</div>
          <div style={{ marginTop: 6, background: "#12172a", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 10.5, padding: "3px 6px" }}>
            {branchName} - {booking.consigneeCity || "—"}
          </div>
        </div>

        <div style={{ padding: "7px 10px", borderBottom: "1.6px solid #1A1408" }}>
          <div style={{ fontSize: 9.8, marginBottom: 5 }}>E-Way B.No.: <b>{booking.ewayBill || "—"}</b></div>
          <div style={{ display: "flex", gap: 10 }}>
            <ConsignmentCheckbox label="AIR" checked={modeChecks.air} />
            <ConsignmentCheckbox label="TRAIN" checked={modeChecks.train} />
            <ConsignmentCheckbox label="SURFACE" checked={modeChecks.surface} />
          </div>
        </div>

        <div style={{ padding: "7px 10px", borderBottom: "1.6px solid #1A1408", fontSize: 9.3, lineHeight: 1.85 }}>
          <div>☎ Ph: {COMPANY.phone}</div>
          <div>WhatsApp: {COMPANY.whatsapp}</div>
          <div>e-mail: {COMPANY.email}</div>
          <div>web: {COMPANY.website}</div>
        </div>

        <ConsignmentBar>RECEIVED BY CONSIGNMENT IN GOOD ORDER / CONDITION</ConsignmentBar>
        <div style={{ padding: "7px 10px", fontSize: 9.8, lineHeight: 2, flex: 1 }}>
          <div>NAME: <span style={{ borderBottom: "1px solid #1A1408", display: "inline-block", width: "60%" }}>&nbsp;</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>SIGN: <span style={{ borderBottom: "1px solid #1A1408", display: "inline-block", width: 60 }}>&nbsp;</span></span>
            <span>STAMP: <span style={{ borderBottom: "1px solid #1A1408", display: "inline-block", width: 55 }}>&nbsp;</span></span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>DATE: <span style={{ borderBottom: "1px solid #1A1408", display: "inline-block", width: 60 }}>&nbsp;</span></span>
            <span>TIME: <span style={{ borderBottom: "1px solid #1A1408", display: "inline-block", width: 55 }}>&nbsp;</span> AM/PM</span>
          </div>
        </div>
      </div>

      {/* ---- Vertical copy label strip ---- */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 1px" }}>
        <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", whiteSpace: "nowrap" }}>
          {copyLabel}
        </div>
      </div>
    </div>
  );
}

function PrintableWaybill({ booking, onClose, branches = [] }) {
  useEffect(() => { const t = setTimeout(() => window.print(), 300); return () => clearTimeout(t); }, []);
  if (!booking) return null;
  const branch = branches.find((b) => b.id === booking.branchId);
  const copies = ["CONSIGNOR COPY", "CONSIGNEE COPY", "POD COPY"];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "30px 16px" }}>
      <div className="waybill-sheet" style={{ background: "#fff", width: 900, maxWidth: "100%", borderRadius: 6, padding: 18 }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
          <button className="btn btn-dark btn-sm" onClick={() => window.print()}><Printer size={13} /> Print all 3 copies — 1 page</button>
          <button className="btn btn-dark btn-sm" onClick={onClose}><X size={13} /> Close</button>
        </div>

        {copies.map((label) => (
          <div key={label} className="waybill-copy" style={{ marginBottom: 14 }}>
            <ConsignmentCopy booking={booking} branch={branch} copyLabel={label} />
          </div>
        ))}

        <style>{`
          @page{ size:A4; margin:8mm; }
          @media print{
            .waybill-sheet{ width:auto !important; padding:0 !important; }
            .waybill-copy{ break-inside: avoid; page-break-inside: avoid; margin-bottom:8px !important; }
            .waybill-copy:last-child{ margin-bottom:0 !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

/* ============================= PRINTABLE MANIFEST ============================= */

function ManifestField({ label, value }) {
  return (
    <div style={{ fontSize: "2.5mm" }}>
      <span style={{ color: "#6b5f3f", fontWeight: 600 }}>{label}: </span>
      <span style={{ fontWeight: 700 }}>{value || "—"}</span>
    </div>
  );
}

// Printable "Dispatch Entry" manifest — mirrors a real carrier dispatch
// sheet: From/To branch + dispatch no. up top, driver / vehicle / vendor /
// route details below, then a per-parcel table with a totals row.
function PrintableManifest({ manifest, onClose }) {
  useEffect(() => { const t = setTimeout(() => window.print(), 300); return () => clearTimeout(t); }, []);
  if (!manifest) return null;
  const totalWeight = manifest.items.reduce((s, b) => s + (Number(b.weight) || 0), 0);
  const totalPcs = manifest.items.reduce((s, b) => s + (Number(b.pieces) || 0), 0);
  const cellBorder = "0.3mm solid #1A1408";
  const destinations = [...new Set(manifest.items.map((b) => b.consigneeCity).filter(Boolean))];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "30px 16px" }}>
      <div className="manifest-sheet" style={{ background: "#fff", color: "#1A1408", width: "210mm", maxWidth: "100%", borderRadius: 6, padding: "10mm", fontFamily: "var(--font-body)", fontSize: "2.6mm" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
          <button className="btn btn-dark btn-sm" onClick={() => window.print()}><Printer size={13} /> Print</button>
          <button className="btn btn-dark btn-sm" onClick={onClose}><X size={13} /> Close</button>
        </div>

        <div style={{ border: "0.5mm solid #1A1408" }}>
          {/* Company header */}
          <div style={{ display: "flex", alignItems: "center", gap: "3mm", padding: "3mm 4mm", borderBottom: cellBorder }}>
            <img src={LOGO_SRC} alt="logo" style={{ width: "13mm", height: "13mm", objectFit: "contain" }} />
            <div style={{ flex: 1 }}>
              <div className="font-display" style={{ fontSize: "4.4mm", fontWeight: 800 }}>{COMPANY.name}</div>
              <div style={{ fontSize: "2.2mm", color: "#6b5f3f" }}>{COMPANY.address} &nbsp;|&nbsp; Ph: {COMPANY.phone} &nbsp;|&nbsp; {COMPANY.email}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: "2.3mm" }}>{fmtDate(manifest.createdAt)}</div>
          </div>

          {/* Title bar */}
          <div style={{ background: "#12172a", color: "#fff", textAlign: "center", fontWeight: 800, letterSpacing: ".12em", fontSize: "3.4mm", padding: "1.8mm", borderBottom: cellBorder }}>
            DISPATCH ENTRY
          </div>

          {/* From / To / Dispatch No */}
          <div style={{ display: "flex", borderBottom: cellBorder }}>
            <div style={{ flex: 1, padding: "2.2mm 4mm", borderRight: cellBorder, display: "grid", gap: "1mm" }}>
              <ManifestField label="From Branch" value={manifest.fromBranch || (manifest.items[0] && manifest.items[0].branchName)} />
              <ManifestField label="Dispatch Date" value={fmtDate(manifest.createdAt).split(",")[0]} />
            </div>
            <div style={{ flex: 1, padding: "2.2mm 4mm", borderRight: cellBorder, display: "grid", gap: "1mm" }}>
              <ManifestField label="To Branch / Destination" value={manifest.toBranch || destinations.join(", ")} />
              <ManifestField label="Route Name" value={manifest.routeName} />
            </div>
            <div style={{ width: "50mm", padding: "2.2mm 4mm", flexShrink: 0 }}>
              <div style={{ fontSize: "2.3mm", color: "#6b5f3f", fontWeight: 700 }}>DISPATCH NO.</div>
              <div className="font-mono" style={{ fontSize: "4mm", fontWeight: 800 }}>{manifest.id}</div>
            </div>
          </div>

          {/* Driver / vehicle / vendor details */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: cellBorder }}>
            <div style={{ padding: "2.2mm 4mm", borderRight: cellBorder, display: "grid", gap: "1mm" }}>
              <ManifestField label="Driver Name" value={manifest.driver} />
              <ManifestField label="Driver DL Number" value={manifest.driverDl} />
            </div>
            <div style={{ padding: "2.2mm 4mm", borderRight: cellBorder, display: "grid", gap: "1mm" }}>
              <ManifestField label="Vehicle No." value={manifest.vehicle} />
              <ManifestField label="Driver Contact No." value={manifest.driverContact} />
            </div>
            <div style={{ padding: "2.2mm 4mm", display: "grid", gap: "1mm" }}>
              <ManifestField label="Vendor Name" value={manifest.vendor} />
              <ManifestField label="Total AWB No." value={manifest.items.length} />
            </div>
          </div>

          {/* Parcel table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "2.4mm" }}>
            <thead>
              <tr style={{ background: "#efe9d8" }}>
                {["S.No", "LR No.", "Booking Branch", "Consignor", "Consignee", "Destination", "PinCode", "Pcs", "Weight (Kg)"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "1.6mm 2mm", borderRight: cellBorder, borderBottom: cellBorder, fontSize: "2.2mm" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {manifest.items.map((b, i) => (
                <tr key={b.awb}>
                  <td style={{ padding: "1.5mm 2mm", borderRight: cellBorder, borderBottom: cellBorder }}>{i + 1}</td>
                  <td className="font-mono" style={{ padding: "1.5mm 2mm", borderRight: cellBorder, borderBottom: cellBorder }}>{b.awb}</td>
                  <td style={{ padding: "1.5mm 2mm", borderRight: cellBorder, borderBottom: cellBorder }}>{b.branchName || "—"}</td>
                  <td style={{ padding: "1.5mm 2mm", borderRight: cellBorder, borderBottom: cellBorder }}>{b.consignorName}</td>
                  <td style={{ padding: "1.5mm 2mm", borderRight: cellBorder, borderBottom: cellBorder }}>{b.consigneeName}</td>
                  <td style={{ padding: "1.5mm 2mm", borderRight: cellBorder, borderBottom: cellBorder }}>{b.consigneeCity}</td>
                  <td style={{ padding: "1.5mm 2mm", borderRight: cellBorder, borderBottom: cellBorder }}>{b.consigneePincode}</td>
                  <td style={{ padding: "1.5mm 2mm", borderRight: cellBorder, borderBottom: cellBorder }}>{b.pieces}</td>
                  <td style={{ padding: "1.5mm 2mm", borderBottom: cellBorder }}>{Number(b.weight).toFixed(1)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, background: "#f4efe3" }}>
                <td colSpan={7} style={{ padding: "1.8mm 2mm", borderRight: cellBorder, textAlign: "right" }}>TOTAL</td>
                <td style={{ padding: "1.8mm 2mm", borderRight: cellBorder }}>{totalPcs}</td>
                <td style={{ padding: "1.8mm 2mm" }}>{totalWeight.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ padding: "2.5mm 4mm", fontSize: "2.2mm", color: "#6b5f3f", textAlign: "center", borderTop: cellBorder }}>
            {COMPANY.address} • {COMPANY.phone} / {COMPANY.mobile} • {COMPANY.email}
          </div>
        </div>

        <style>{`
          @page{ size:A4; margin:8mm; }
          @media print{ .manifest-sheet{ width:auto !important; padding:0 !important; } }
        `}</style>
      </div>
    </div>
  );
}

/* ============================= ADMIN: MANIFEST & DISPATCH ============================= */

function emptyManifestForm() {
  return { vehicle: "", driver: "", driverDl: "", driverContact: "", vendor: "", fromBranch: "", toBranch: "", routeName: "" };
}

function ManifestPanel({ bookings, onCreateManifest, onPrintManifest, notify, branches = [], currentUser }) {
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState(() => ({
    ...emptyManifestForm(),
    fromBranch: currentUser && currentUser.role === "branch" ? currentUser.branchName : "",
  }));
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const pending = bookings.filter((b) => b.status === "Booked" && !b.manifestId);
  const manifests = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      if (!b.manifestId) return;
      if (!map.has(b.manifestId)) map.set(b.manifestId, {
        id: b.manifestId, vehicle: b.manifestVehicle, driver: b.manifestDriver, createdAt: b.manifestCreatedAt,
        driverDl: b.manifestDriverDl, driverContact: b.manifestDriverContact, vendor: b.manifestVendor,
        fromBranch: b.manifestFromBranch, toBranch: b.manifestToBranch, routeName: b.manifestRouteName, items: [],
      });
      map.get(b.manifestId).items.push(b);
    });
    return [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [bookings]);

  function toggle(awb) {
    setSelected((s) => { const n = new Set(s); n.has(awb) ? n.delete(awb) : n.add(awb); return n; });
  }

  async function create() {
    if (selected.size === 0) { notify({ title: "Select parcels", msg: "Choose at least one booked parcel to dispatch.", color: "var(--gold)" }); return; }
    const manifest = await onCreateManifest([...selected], form);
    setSelected(new Set());
    setForm({ ...emptyManifestForm(), fromBranch: form.fromBranch });
    notify({ title: "Manifest created", msg: manifest.id, color: "var(--green)" });
    onPrintManifest(manifest);
  }

  return (
    <div className="glide-in" style={{ display: "grid", gap: 18 }}>
      <div className="mcl-card" style={{ padding: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><Truck size={16} color="var(--brand)" /> Create dispatch manifest</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }} className="manifest-form">
          <div><label className="lb">From branch</label><input className="in" value={form.fromBranch} onChange={(e) => set("fromBranch", e.target.value)} placeholder="Erode" /></div>
          <div><label className="lb">To branch / destination</label><input className="in" value={form.toBranch} onChange={(e) => set("toBranch", e.target.value)} placeholder="Salem" /></div>
          <div><label className="lb">Route name</label><input className="in" value={form.routeName} onChange={(e) => set("routeName", e.target.value)} placeholder="Optional" /></div>
          <div><label className="lb">Vendor name</label><input className="in" value={form.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="Transport vendor, if any" /></div>
          <div><label className="lb">Vehicle number</label><input className="in" value={form.vehicle} onChange={(e) => set("vehicle", e.target.value)} placeholder="TN 33 AB 1234" /></div>
          <div><label className="lb">Driver name</label><input className="in" value={form.driver} onChange={(e) => set("driver", e.target.value)} placeholder="Driver's name" /></div>
          <div><label className="lb">Driver DL number</label><input className="in" value={form.driverDl} onChange={(e) => set("driverDl", e.target.value)} placeholder="Licence number" /></div>
          <div><label className="lb">Driver contact number</label><input className="in" value={form.driverContact} onChange={(e) => set("driverContact", e.target.value)} placeholder="10-digit mobile" /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={create}><ScanLine size={15} /> Dispatch {selected.size > 0 ? `(${selected.size})` : ""}</button>
        </div>
        {pending.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>
            <Boxes size={26} style={{ opacity: .5, margin: "0 auto 8px" }} />
            No parcels waiting for dispatch — everything "Booked" has already gone out.
          </div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="mcl-table">
              <thead><tr><th></th><th>AWB</th><th>Route</th><th>Consignee</th><th>Wt</th></tr></thead>
              <tbody>
                {pending.map((b) => (
                  <tr key={b.awb} style={{ cursor: "pointer" }} onClick={() => toggle(b.awb)}>
                    <td><input type="checkbox" checked={selected.has(b.awb)} onChange={() => toggle(b.awb)} /></td>
                    <td className="font-mono">{b.awb}</td>
                    <td>{b.consignorCity} <ArrowRight size={11} style={{ margin: "0 2px", opacity: .6 }} /> {b.consigneeCity}</td>
                    <td>{b.consigneeName}</td>
                    <td>{b.weight}kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {manifests.length > 0 && (
        <div className="mcl-card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Past manifests</div>
          <div style={{ display: "grid", gap: 10 }}>
            {manifests.map((m) => (
              <div key={m.id} className="mcl-card-2" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span className="font-mono" style={{ fontWeight: 700 }}>{m.id}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 10 }}>{m.items.length} parcels · {m.vehicle || "no vehicle"} · {m.driver || "no driver"}</span>
                </div>
                <button className="btn btn-dark btn-sm" onClick={() => onPrintManifest(m)}><Printer size={13} /> Reprint</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`
        @media (max-width:900px){ .manifest-form{ grid-template-columns:1fr 1fr !important; } }
        @media (max-width:520px){ .manifest-form{ grid-template-columns:1fr !important; } }
      `}</style>
    </div>
  );
}

/* ============================= ADMIN: REPORTS ============================= */

function ReportsSection({ title, icon: Icon, color, rows, columns, emptyText, notify, filename }) {
  function exportExcel() {
    const data = rows.map((r) => {
      const o = {};
      columns.forEach((c) => { o[c.label] = c.get(r); });
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30));
    XLSX.writeFile(wb, `${filename}-${Date.now()}.xlsx`);
    notify({ title: "Excel exported", msg: `${data.length} rows`, color: "var(--blue)" });
  }
  return (
    <div className="mcl-card" style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}><Icon size={16} color={color} /> {title} <span style={{ color: "var(--muted)", fontWeight: 500 }}>({rows.length})</span></div>
        {rows.length > 0 && <button className="btn btn-dark btn-sm" onClick={exportExcel}><FileSpreadsheet size={13} /> Export</button>}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{emptyText}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="mcl-table">
            <thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r) => (
                <tr key={r.awb}>{columns.map((c) => <td key={c.label}>{c.render ? c.render(r) : c.get(r)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>Showing 50 of {rows.length} — export to Excel for the full list.</div>}
        </div>
      )}
    </div>
  );
}

function ReportsPanel({ bookings, onUpdateStatus, notify }) {
  const rto = bookings.filter((b) => b.status === "RTO");
  const ndr = bookings.filter((b) => b.status === "NDR");
  const pending = bookings.filter((b) => b.status !== "Delivered" && b.status !== "RTO");
  const codBookings = bookings.filter((b) => b.paymentType === "ToPay" && b.status === "Delivered");
  const codCollected = codBookings.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const codRemitted = codBookings.filter((b) => b.codRemitted).reduce((s, b) => s + (Number(b.total) || 0), 0);
  const codPending = codCollected - codRemitted;

  return (
    <div className="glide-in" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }} className="cod-kpi">
        <KPI icon={Wallet} label="COD collected" value={currency(codCollected)} sub="Delivered ToPay parcels" color="var(--green)" />
        <KPI icon={CheckCircle2} label="COD remitted" value={currency(codRemitted)} sub="Already handed over" color="var(--blue)" />
        <KPI icon={AlertTriangle} label="COD pending remit" value={currency(codPending)} sub="Still with delivery staff" color="var(--gold)" />
      </div>

      <ReportsSection title="COD remittance" icon={Wallet} color="var(--green)" notify={notify} filename="metro-cod-remittance"
        rows={codBookings} emptyText="No delivered ToPay parcels yet."
        columns={[
          { label: "AWB", get: (r) => r.awb },
          { label: "Consignee", get: (r) => r.consigneeName },
          { label: "Amount", get: (r) => r.total },
          { label: "Status", get: (r) => (r.codRemitted ? "Remitted" : "Pending"), render: (r) => (
            <span onClick={() => onUpdateStatus(r.awb, r.status, { codRemitted: !r.codRemitted })} style={{ cursor: "pointer", color: r.codRemitted ? "var(--green)" : "var(--gold)", fontWeight: 700 }}>
              {r.codRemitted ? "Remitted ✓" : "Mark remitted"}
            </span>
          ) },
        ]}
      />

      <ReportsSection title="NDR — failed delivery attempts" icon={AlertTriangle} color="var(--gold)" notify={notify} filename="metro-ndr-report"
        rows={ndr} emptyText="No pending NDR parcels."
        columns={[
          { label: "AWB", get: (r) => r.awb },
          { label: "Consignee", get: (r) => r.consigneeName },
          { label: "Reason", get: (r) => r.ndrReason || "—" },
          { label: "Attempts", get: (r) => r.reattempts || 0 },
        ]}
      />

      <ReportsSection title="RTO — returned to origin" icon={AlertTriangle} color="var(--red)" notify={notify} filename="metro-rto-report"
        rows={rto} emptyText="No RTO parcels."
        columns={[
          { label: "AWB", get: (r) => r.awb },
          { label: "Route", get: (r) => `${r.consignorCity} → ${r.consigneeCity}` },
          { label: "Weight", get: (r) => r.weight + "kg" },
          { label: "Booked", get: (r) => fmtDateShort(r.createdAt) },
        ]}
      />

      <ReportsSection title="Pending delivery" icon={Clock} color="var(--blue)" notify={notify} filename="metro-pending-report"
        rows={pending} emptyText="Nothing pending — everything is delivered or returned."
        columns={[
          { label: "AWB", get: (r) => r.awb },
          { label: "Status", get: (r) => r.status },
          { label: "Route", get: (r) => `${r.consignorCity} → ${r.consigneeCity}` },
          { label: "Expected", get: (r) => r.expectedDelivery || "—" },
        ]}
      />
      <style>{`@media (max-width:800px){ .cod-kpi{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

/* ============================= ADMIN: BRANCH MANAGEMENT ============================= */

function emptyBranchForm() {
  return { name: "", code: "", city: "", address: "", contact: "", managerName: "", managerUsername: "", managerPassword: "" };
}

function BranchManagement({ branches, onAdd, onUpdate, onDelete, notify }) {
  const [form, setForm] = useState(emptyBranchForm());
  const [editingId, setEditingId] = useState(null);
  const [confirmDel, setConfirmDel] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // Suggest a branch code/ID the moment a name is typed — "Erode" -> "ERD",
  // "Salem" -> "SAL" — but leave it alone once the user edits it themselves.
  const suggestedCode = useMemo(() => {
    if (!form.name) return "";
    const existing = branches.filter((b) => b.id !== editingId).map((b) => b.code);
    return deriveBranchCode(form.name, existing);
  }, [form.name, branches, editingId]);
  useEffect(() => { if (!codeTouched) set("code", suggestedCode); }, [suggestedCode, codeTouched]);

  function startEdit(b) {
    setEditingId(b.id);
    setCodeTouched(true);
    setForm({ name: b.name, code: b.code, city: b.city || "", address: b.address, contact: b.contact, managerName: b.managerName || "", managerUsername: b.managerUsername, managerPassword: b.managerPassword });
  }
  function cancelEdit() { setEditingId(null); setCodeTouched(false); setForm(emptyBranchForm()); }

  function submit(e) {
    e.preventDefault();
    if (!form.name || !form.managerUsername || !form.managerPassword) {
      notify({ title: "Missing details", msg: "Branch name, manager username and password are required.", color: "var(--gold)" });
      return;
    }
    const usernameTaken = branches.some((b) => b.managerUsername.toLowerCase() === form.managerUsername.toLowerCase() && b.id !== editingId);
    if (usernameTaken) {
      notify({ title: "Username already used", msg: "Pick a different manager username.", color: "var(--gold)" });
      return;
    }
    if (editingId) {
      onUpdate(editingId, form);
      notify({ title: "Branch updated", msg: form.name, color: "var(--green)" });
    } else {
      onAdd(form);
      notify({ title: "Branch added", msg: form.name, color: "var(--green)" });
    }
    cancelEdit();
  }

  return (
    <div className="glide-in" style={{ display: "grid", gap: 18 }}>
      <div className="mcl-card" style={{ padding: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={16} color="var(--brand)" /> {editingId ? "Edit branch" : "Add a new branch"}
        </div>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }} className="branch-form-grid">
            <div><label className="lb">Branch name *</label><input className="in" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Chennai Branch" /></div>
            <div><label className="lb">Branch ID / code <span style={{ fontWeight: 400, color: "var(--muted)" }}>(auto)</span></label>
              <input className="in font-mono" value={form.code} onChange={(e) => { setCodeTouched(true); set("code", e.target.value.toUpperCase()); }} placeholder="Auto-generated from name" />
            </div>
            <div><label className="lb">Contact number</label><input className="in" value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Branch phone number" /></div>
            <div><label className="lb">City <span style={{ fontWeight: 400, color: "var(--muted)" }}>(for auto-tracking + incoming matches)</span></label><input className="in" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Defaults to branch name" /></div>
            <div style={{ gridColumn: "1 / -1" }}><label className="lb">Address</label><input className="in" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Branch address" /></div>
            <div><label className="lb">Branch manager name</label><input className="in" value={form.managerName} onChange={(e) => set("managerName", e.target.value)} placeholder="Shown on printed AWB / POD copies" /></div>
            <div><label className="lb">Manager username *</label><input className="in" value={form.managerUsername} onChange={(e) => set("managerUsername", e.target.value)} placeholder="chennai.manager" /></div>
            <div><label className="lb">Manager password *</label><input className="in" value={form.managerPassword} onChange={(e) => set("managerPassword", e.target.value)} placeholder="Set a password" /></div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit"><PlusCircle size={15} /> {editingId ? "Save changes" : "Add branch"}</button>
            {editingId && <button className="btn btn-dark" type="button" onClick={cancelEdit}><X size={15} /> Cancel</button>}
          </div>
        </form>
      </div>

      <div className="mcl-card" style={{ padding: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>All branches ({branches.length})</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="branch-list-grid">
          {branches.map((b) => (
            <div key={b.id} className="mcl-card-2" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {b.name} <span className="font-mono badge" style={{ fontSize: 11, color: "var(--brand)", background: "rgba(212,175,55,.14)" }}>ID: {b.id}</span>
                  {!b.active && <span className="badge" style={{ color: "var(--muted)", background: "rgba(140,151,179,.14)" }}>Inactive</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{b.city ? `${b.city} · ` : ""}{b.address}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{b.contact} · login: <span className="font-mono">{b.managerUsername}</span></div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-dark btn-sm" onClick={() => onUpdate(b.id, { active: !b.active })}>{b.active ? "Deactivate" : "Activate"}</button>
                <button className="btn btn-dark btn-sm" onClick={() => startEdit(b)}>Edit</button>
                {confirmDel === b.id ? (
                  <button className="btn btn-sm" style={{ background: "var(--red)", color: "#fff" }} onClick={() => { onDelete(b.id); notify({ title: "Branch deleted", msg: b.name, color: "var(--red)" }); setConfirmDel(""); }}>Confirm</button>
                ) : (
                  <button className="btn btn-dark btn-sm" onClick={() => setConfirmDel(b.id)}><Trash2 size={13} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width:900px){ .branch-form-grid{ grid-template-columns:1fr 1fr !important; } .branch-list-grid{ grid-template-columns:1fr !important; } }
        @media (max-width:600px){ .branch-form-grid{ grid-template-columns:1fr !important; } }
      `}</style>
    </div>
  );
}

/* ============================= MIS REPORT (DETAILED, FILTERABLE) ============================= */

function MISReportPanel({ bookings, notify }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(todayIso);
  const [toDate, setToDate] = useState(todayIso);
  const [client, setClient] = useState("");
  const [applied, setApplied] = useState({ fromDate: todayIso, toDate: todayIso, client: "" });

  const filtered = useMemo(() => {
    const from = new Date(applied.fromDate); from.setHours(0, 0, 0, 0);
    const to = new Date(applied.toDate); to.setHours(23, 59, 59, 999);
    return bookings.filter((b) => {
      const d = new Date(b.createdAt);
      if (d < from || d > to) return false;
      if (applied.client && !(b.clientAccount || "").toLowerCase().includes(applied.client.toLowerCase())) return false;
      return true;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [bookings, applied]);

  function search() { setApplied({ fromDate, toDate, client }); }
  function reset() { setFromDate(todayIso); setToDate(todayIso); setClient(""); setApplied({ fromDate: todayIso, toDate: todayIso, client: "" }); }

  function exportReport() {
    const rows = filtered.map((b, i) => ({
      SrNo: i + 1, "Booking Date": fmtDateShort(b.createdAt), "Awb No": b.awb,
      "Consignor Name": b.consignorName, "Consignor City": b.consignorCity, "Consignor Country": "INDIA",
      Client: b.clientAccount, "Consignee Company": b.consigneeCompany, "Consignee Name": b.consigneeName,
      Address: b.consigneeAddress, "Consignee City": b.consigneeCity, "Consignee Pincode": b.consigneePincode,
      "Origin Branch": b.branchName, "Destination Branch": b.consigneeCity,
      "Delivery Date": b.deliveredAt ? fmtDateShort(b.deliveredAt) : "", "Expected Delivery Date": b.expectedDelivery || "",
      "OnTime/Delay": onTimeStatus(b), "Delayed by (No. of Days)": delayDays(b),
      "Receiver Name": b.consigneeName, "RTO Awb No": b.rtoAwbNo || "",
      "Forwarder Name": b.forwarderName || "", "Forwarder LR No": b.forwarderLrNo || "",
      "Last Known City": currentStation(b), Remark: b.remarks || "",
      "ODA/REGULAR": b.oda, "E-WAYBILLVALIDITY": b.ewayBill || "",
      "Invoice No": b.invoiceNumber || "", Piece: b.pieces, "Actual Weight": b.weight,
      "Current Date": fmtDateShort(new Date().toISOString()), "Current Station": currentStation(b), "Current Status": b.status.toUpperCase(),
      "PO Number": b.poNumber || "", "Shipment Type": b.shipmentType,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MIS Report");
    XLSX.writeFile(wb, `MISReport_${fmtDateShort(new Date().toISOString())}.xlsx`);
    notify({ title: "MIS Report exported", msg: `${rows.length} shipments`, color: "var(--blue)" });
  }

  return (
    <div className="glide-in" style={{ display: "grid", gap: 16 }}>
      <div className="mcl-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontWeight: 700 }}><FileText size={16} color="var(--brand)" /> MIS Report</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><label className="lb">From date</label><input className="in" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div><label className="lb">To date</label><input className="in" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
          <div style={{ minWidth: 160 }}><label className="lb">Client</label><input className="in" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client / account name" /></div>
          <button className="btn btn-primary btn-sm" onClick={search}><Search size={14} /> Search</button>
          <button className="btn btn-dark btn-sm" onClick={exportReport} disabled={filtered.length === 0}><FileSpreadsheet size={14} /> Export</button>
          <button className="btn btn-dark btn-sm" onClick={reset}><RefreshCcw size={14} /> Reset</button>
        </div>
      </div>

      <div className="mcl-card" style={{ padding: filtered.length ? 0 : 40, overflowX: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)" }}>
            <Boxes size={26} style={{ opacity: .5, margin: "0 auto 8px" }} />
            No shipments match this date range / client filter.
          </div>
        ) : (
          <table className="mcl-table">
            <thead>
              <tr>
                <th>Awb No</th><th>Booking Date</th><th>Client</th><th>Consignor</th><th>Consignee</th>
                <th>Origin</th><th>Current Station</th><th>Status</th><th>ODA</th><th>Type</th>
                <th>On Time/Delay</th><th>Delay (days)</th><th>Forwarder</th><th>PO No</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 80).map((b) => {
                const ot = onTimeStatus(b);
                const dd = delayDays(b);
                return (
                  <tr key={b.awb}>
                    <td className="font-mono">{b.awb}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDateShort(b.createdAt)}</td>
                    <td>{b.clientAccount}</td>
                    <td>{b.consignorName}<div style={{ fontSize: 11, color: "var(--muted)" }}>{b.consignorCity}</div></td>
                    <td>{b.consigneeName}<div style={{ fontSize: 11, color: "var(--muted)" }}>{b.consigneeCity}</div></td>
                    <td>{b.branchName}</td>
                    <td>{currentStation(b)}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>{b.oda === "ODA" ? <span className="badge" style={{ color: "var(--gold)", background: "rgba(255,176,32,.14)" }}>ODA</span> : <span style={{ fontSize: 12, color: "var(--muted)" }}>Regular</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{b.shipmentType}</td>
                    <td style={{ color: ot === "Delay" ? "var(--red)" : ot === "On Time" ? "var(--green)" : "var(--muted)", fontWeight: 600 }}>{ot}</td>
                    <td>{dd > 0 ? dd : "—"}</td>
                    <td style={{ fontSize: 12 }}>{b.forwarderName || "—"}</td>
                    <td style={{ fontSize: 12 }}>{b.poNumber || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filtered.length > 80 && <div style={{ padding: "10px 16px", fontSize: 11.5, color: "var(--muted)" }}>Showing 80 of {filtered.length} — export to Excel for the complete report with every MIS column.</div>}
      </div>
    </div>
  );
}

/* ============================= ADMIN: MIS (MANAGEMENT INFORMATION SYSTEM) ============================= */

function MISPanel({ bookings, branches, notify }) {
  const branchStats = useMemo(() => {
    return branches.map((br) => {
      const items = bookings.filter((b) => b.branchId === br.id);
      const revenue = items.reduce((s, b) => s + (Number(b.total) || 0), 0);
      const delivered = items.filter((b) => b.status === "Delivered").length;
      const rto = items.filter((b) => b.status === "RTO").length;
      const ndr = items.filter((b) => b.status === "NDR").length;
      const codPending = items.filter((b) => b.paymentType === "ToPay" && b.status === "Delivered" && !b.codRemitted)
        .reduce((s, b) => s + (Number(b.total) || 0), 0);
      return {
        id: br.id, name: br.name, active: br.active, bookings: items.length, revenue, delivered, rto, ndr, codPending,
        deliveryRate: items.length ? Math.round((delivered / items.length) * 100) : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [bookings, branches]);

  const topRoutes = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      const key = `${b.consignorCity || "—"} → ${b.consigneeCity || "—"}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [bookings]);

  const totalRevenue = bookings.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const bestBranch = branchStats[0];
  const activeBranches = branches.filter((b) => b.active).length;

  function exportMIS() {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(branchStats.map((s) => ({
      Branch: s.name, Bookings: s.bookings, Revenue: s.revenue, "Delivery Rate %": s.deliveryRate,
      Delivered: s.delivered, RTO: s.rto, NDR: s.ndr, "COD Pending": s.codPending,
    })));
    XLSX.utils.book_append_sheet(wb, ws1, "Branch Summary");
    const ws2 = XLSX.utils.json_to_sheet(topRoutes);
    XLSX.utils.book_append_sheet(wb, ws2, "Top Routes");
    XLSX.writeFile(wb, `metro-mis-report-${Date.now()}.xlsx`);
    notify({ title: "MIS report exported", msg: "Branch summary + top routes", color: "var(--blue)" });
  }

  return (
    <div className="glide-in" style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Company-wide performance across all branches.</div>
        <button className="btn btn-dark btn-sm" onClick={exportMIS}><FileSpreadsheet size={14} /> Export full MIS report</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }} className="mis-kpi">
        <KPI icon={Building2} label="Active branches" value={activeBranches} sub={`${branches.length} total`} />
        <KPI icon={Wallet} label="Company revenue" value={currency(totalRevenue)} sub="All branches, all time" color="var(--green)" />
        <KPI icon={TrendingUp} label="Top branch" value={bestBranch ? bestBranch.name.split(" ")[0] : "—"} sub={bestBranch ? currency(bestBranch.revenue) : "No data yet"} color="var(--blue)" />
        <KPI icon={Boxes} label="Total bookings" value={bookings.length} sub="Across all branches" />
      </div>

      <div className="mcl-card" style={{ padding: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Revenue by branch</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>All-time revenue comparison</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={branchStats} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
            <XAxis type="number" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} width={140} />
            <Tooltip contentStyle={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, color: "#fff" }} formatter={(v) => currency(v)} />
            <Bar dataKey="revenue" fill="#D4AF37" radius={[0, 5, 5, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mcl-card" style={{ padding: 22, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Branch comparison</div>
        <table className="mcl-table">
          <thead><tr><th>Branch</th><th>Bookings</th><th>Revenue</th><th>Delivery rate</th><th>RTO</th><th>NDR</th><th>COD pending</th></tr></thead>
          <tbody>
            {branchStats.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name} {!s.active && <span className="badge" style={{ color: "var(--muted)", background: "rgba(140,151,179,.14)", marginLeft: 6 }}>Inactive</span>}</td>
                <td>{s.bookings}</td>
                <td>{currency(s.revenue)}</td>
                <td>{s.deliveryRate}%</td>
                <td style={{ color: s.rto > 0 ? "var(--red)" : "var(--muted)" }}>{s.rto}</td>
                <td style={{ color: s.ndr > 0 ? "var(--gold)" : "var(--muted)" }}>{s.ndr}</td>
                <td>{currency(s.codPending)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mcl-card" style={{ padding: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Top routes</div>
        {topRoutes.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No bookings yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {topRoutes.map((r, i) => (
              <div key={r.route} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="font-mono" style={{ width: 20, color: "var(--muted)", fontSize: 12 }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: 13 }}>{r.route}</div>
                <div style={{ fontSize: 12.5, color: "var(--brand)", fontWeight: 700 }}>{r.count} parcels</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`@media (max-width:900px){ .mis-kpi{ grid-template-columns:1fr 1fr !important; } } @media (max-width:520px){ .mis-kpi{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

/* ============================= INCOMING TODAY (destination branch) ============================= */

function IncomingTodayPanel({ bookings, branches, isAdmin, onUpdateStatus, notify }) {
  const [filter, setFilter] = useState("today");
  const branchName = (id) => (branches.find((b) => b.id === id) || {}).name || "—";

  const rows = useMemo(() => {
    return bookings
      .filter((b) => (filter === "today" ? (b.stagePlan && dateInRange(b.stagePlan.etaISO, "today")) : true))
      .sort((a, b) => new Date((a.stagePlan || {}).etaISO || a.expectedDelivery) - new Date((b.stagePlan || {}).etaISO || b.expectedDelivery));
  }, [bookings, filter]);

  function confirmDelivered(b) {
    onUpdateStatus(b.awb, "Delivered", { deliveredAt: new Date().toISOString() });
    notify({ title: "Marked delivered", msg: b.awb, color: "var(--green)" });
  }
  function markNotYet(b) {
    onUpdateStatus(b.awb, "Out for Delivery", {});
    notify({ title: "Kept as Out for Delivery", msg: b.awb, color: "var(--gold)" });
  }

  return (
    <div className="glide-in" style={{ display: "grid", gap: 16 }}>
      <div className="mcl-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Incoming parcels {isAdmin ? "— all destination branches" : "for your branch"}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
              Parcels booked at another branch and heading here. Stages update automatically as they move — confirm delivery once it's actually handed over.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div className={`tab-btn ${filter === "today" ? "active" : ""}`} onClick={() => setFilter("today")}>Arriving today</div>
            <div className={`tab-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All incoming</div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mcl-card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
          <Boxes size={26} style={{ marginBottom: 8, opacity: .5 }} />
          <div>No incoming parcels {filter === "today" ? "expected today" : "right now"}.</div>
        </div>
      ) : (
        <div className="mcl-card-2" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="mcl-table">
              <thead>
                <tr>
                  <th>AWB</th><th>From</th>{isAdmin && <th>Destination branch</th>}<th>Consignee</th>
                  <th>Mode</th><th>Status</th><th>ETA</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.awb}>
                    <td className="font-mono">{b.awb}</td>
                    <td style={{ fontSize: 12.5 }}>{b.branchName || b.consignorCity}</td>
                    {isAdmin && <td style={{ fontSize: 12.5 }}>{branchName(b.destinationBranchId)}</td>}
                    <td style={{ fontSize: 12.5 }}>{b.consigneeName}<br /><span style={{ color: "var(--muted)" }}>{b.consigneeCity}</span></td>
                    <td>{b.mode}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td style={{ fontSize: 12 }}>{b.stagePlan ? formatEta(b.stagePlan.etaISO) : "—"}</td>
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {b.status === "Out for Delivery" ? (
                        <>
                          <button className="btn btn-sm" style={{ background: "var(--green)", color: "#fff" }} onClick={() => confirmDelivered(b)}><CheckCircle2 size={13} /> Delivered</button>
                          <button className="btn btn-dark btn-sm" onClick={() => markNotYet(b)}>Not yet</button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>In transit — auto-updates</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================= ADMIN SHELL ============================= */

function AdminPanel({ bookings, onSaveBooking, onUpdateStatus, onPrint, onDelete, notify, customers, onCreateManifest, onPrintManifest, currentUser, branches, existingAwbs, onAddBranch, onUpdateBranch, onDeleteBranch }) {
  const isAdmin = currentUser.role === "admin";
  const [tab, setTab] = useState("overview");
  const scopedBookings = isAdmin ? bookings : bookings.filter((b) => b.branchId === currentUser.branchId);
  const currentBranch = !isAdmin ? branches.find((b) => b.id === currentUser.branchId) : null;

  // "Incoming" = parcels whose destination branch is this branch (or, for
  // admin, any branch) — this is the Erode-books-to-Salem / Salem-confirms
  // workflow: the receiving branch sees what's arriving today and closes
  // the loop with a delivered/not-delivered tap.
  const incomingBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === "Delivered" || b.status === "RTO") return false;
      if (!isAdmin && b.destinationBranchId !== currentUser.branchId) return false;
      if (isAdmin && !b.destinationBranchId) return false;
      return true;
    });
  }, [bookings, isAdmin, currentUser.branchId]);
  const incomingCount = useMemo(
    () => incomingBookings.filter((b) => b.stagePlan && dateInRange(b.stagePlan.etaISO, "today")).length,
    [incomingBookings]
  );

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "30px 20px 80px" }}>
      <div className="admin-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <div className="logo-badge logo-shine logo-badge-anim" style={{ width: 64, height: 64, flexShrink: 0 }}><img src={LOGO_SRC} alt="" /></div>
          <div style={{ minWidth: 0 }}>
            <div className="font-display" style={{ fontSize: 24, fontWeight: 700, overflowWrap: "break-word" }}>{isAdmin ? "Admin dashboard" : `${currentUser.branchName} — Branch Portal`}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{isAdmin ? "Book parcels, dispatch, manage branches and pull reports." : "Book parcels and see today's activity for your branch."}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} className="admin-tabs">
          <div className={`tab-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}><LayoutDashboard size={15} /> Overview</div>
          <div className={`tab-btn ${tab === "new" ? "active" : ""}`} onClick={() => setTab("new")}><PlusCircle size={15} /> New booking</div>
          <div className={`tab-btn ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}><ListChecks size={15} /> {isAdmin ? "All bookings" : "Today's bookings"}</div>
          <div className={`tab-btn ${tab === "incoming" ? "active" : ""}`} onClick={() => setTab("incoming")}>
            <Boxes size={15} /> Incoming {incomingCount > 0 && <span className="badge" style={{ marginLeft: 4, color: "var(--gold)", background: "rgba(255,176,32,.16)" }}>{incomingCount}</span>}
          </div>
          <div className={`tab-btn ${tab === "manifest" ? "active" : ""}`} onClick={() => setTab("manifest")}><Truck size={15} /> Manifest</div>
          <div className={`tab-btn ${tab === "reports" ? "active" : ""}`} onClick={() => setTab("reports")}><FileText size={15} /> Reports</div>
          <div className={`tab-btn ${tab === "misreport" ? "active" : ""}`} onClick={() => setTab("misreport")}><FileText size={15} /> MIS Report</div>
          {isAdmin && <div className={`tab-btn ${tab === "mis" ? "active" : ""}`} onClick={() => setTab("mis")}><BarChart3 size={15} /> MIS</div>}
          {isAdmin && <div className={`tab-btn ${tab === "branches" ? "active" : ""}`} onClick={() => setTab("branches")}><Building2 size={15} /> Branches</div>}
          {isAdmin && <div className={`tab-btn ${tab === "places" ? "active" : ""}`} onClick={() => setTab("places")}><MapPin size={15} /> Service Places</div>}
        </div>
      </div>
      <style>{`
        @media (max-width:700px){ .admin-header{ flex-direction:column; align-items:flex-start; } .admin-tabs{ width:100%; overflow-x:auto; flex-wrap:nowrap !important; padding-bottom:4px; } .admin-tabs .tab-btn{ flex-shrink:0; } }
      `}</style>
      <div key={tab} className="view-enter">
        {tab === "overview" && <Overview bookings={scopedBookings} />}
        {tab === "new" && <NewBooking onSave={onSaveBooking} notify={notify} customers={customers} branches={branches} currentUser={currentUser} existingAwbs={existingAwbs} />}
        {tab === "all" && <BookingsTable bookings={scopedBookings} onUpdateStatus={onUpdateStatus} onPrint={onPrint} onDelete={onDelete} notify={notify} />}
        {tab === "incoming" && <IncomingTodayPanel bookings={incomingBookings} branches={branches} isAdmin={isAdmin} onUpdateStatus={onUpdateStatus} notify={notify} />}
        {tab === "manifest" && <ManifestPanel bookings={scopedBookings} onCreateManifest={onCreateManifest} onPrintManifest={onPrintManifest} notify={notify} branches={branches} currentUser={currentUser} />}
        {tab === "reports" && <ReportsPanel bookings={scopedBookings} onUpdateStatus={onUpdateStatus} notify={notify} />}
        {tab === "misreport" && <MISReportPanel bookings={scopedBookings} notify={notify} />}
        {tab === "mis" && isAdmin && <MISPanel bookings={bookings} branches={branches} notify={notify} />}
        {tab === "branches" && isAdmin && <BranchManagement branches={branches} onAdd={onAddBranch} onUpdate={onUpdateBranch} onDelete={onDeleteBranch} notify={notify} />}
        {tab === "places" && isAdmin && <ServicePlacesAdmin notify={notify} />}
      </div>
    </div>
  );
}

/* ============================= ROOT APP ============================= */

export default function App() {
  const [view, setView] = useState("home");
  const [bookings, setBookings] = useState([]);
  const [seq, setSeq] = useState(1);
  const [manifestSeq, setManifestSeq] = useState(1);
  const [branches, setBranches] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);
  const [printManifest, setPrintManifest] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const customers = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      const key = b.consignorName + "|" + b.consignorPhone;
      if (b.consignorName && !map.has(key)) map.set(key, b);
    });
    return [...map.values()];
  }, [bookings]);

  const existingAwbs = useMemo(() => new Set(bookings.map((b) => b.awb.toUpperCase())), [bookings]);

  const notify = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((cur) => [...cur, { id, ...t }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 3200);
  }, []);

  async function fetchLatestBookings() {
    try {
      const res = await window.storage.get(STORE_KEY, true);
      return res && res.value ? JSON.parse(res.value) : [];
    } catch (e) { return bookings; }
  }
  async function fetchLatestBranches() {
    try {
      const res = await window.storage.get(BRANCH_STORE_KEY, true);
      return res && res.value ? JSON.parse(res.value) : branches;
    } catch (e) { return branches; }
  }

  // Initial load
  useEffect(() => {
    (async () => {
      try { const res = await window.storage.get(STORE_KEY, true); if (res && res.value) setBookings(JSON.parse(res.value)); } catch (e) { }
      try { const s = await window.storage.get(SEQ_KEY, true); if (s && s.value) setSeq(JSON.parse(s.value)); } catch (e) { }
      try { const m = await window.storage.get(MANIFEST_SEQ_KEY, true); if (m && m.value) setManifestSeq(JSON.parse(m.value)); } catch (e) { }
      try {
        const br = await window.storage.get(BRANCH_STORE_KEY, true);
        if (br && br.value) setBranches(JSON.parse(br.value));
        else {
          const seeded = [makeDefaultBranch()];
          setBranches(seeded);
          window.storage.set(BRANCH_STORE_KEY, JSON.stringify(seeded), true).catch(() => {});
        }
      } catch (e) {
        const seeded = [makeDefaultBranch()];
        setBranches(seeded);
        window.storage.set(BRANCH_STORE_KEY, JSON.stringify(seeded), true).catch(() => {});
      }
      setLoaded(true);
      setLastSynced(new Date());
    })();
  }, []);

  // Live sync: poll shared storage periodically so multiple branch managers
  // working at the same time see each other's bookings/branches without
  // reloading the page.
  useEffect(() => {
    const t = setInterval(async () => {
      setSyncing(true);
      try {
        const [freshBookings, freshBranches] = await Promise.all([fetchLatestBookings(), fetchLatestBranches()]);
        setBookings(freshBookings);
        setBranches(freshBranches);
        setLastSynced(new Date());
      } catch (e) { /* ignore transient errors */ }
      setSyncing(false);
    }, 7000);
    return () => clearInterval(t);
  }, []);

  // Automatic stage progression: every minute, check every non-terminal
  // booking's stage plan against the clock and push forward any parcel
  // that has crossed its next planned stage — Booked → Picked Up →
  // In Transit → Out for Delivery happen with zero manual clicks. Final
  // "Delivered" confirmation is deliberately left to a human at the
  // destination branch (see IncomingTodayPanel) so nothing is ever marked
  // delivered without someone actually confirming it.
  useEffect(() => {
    const t = setInterval(async () => {
      const latest = await fetchLatestBookings();
      const now = new Date();
      let changed = false;
      const next = latest.map((b) => {
        const autoIdx = computeAutoStageIndex(b, now);
        if (autoIdx === null) return b;
        const curIdx = STATUS_STEPS.indexOf(b.status);
        if (autoIdx > curIdx) { changed = true; return { ...b, status: STATUS_STEPS[autoIdx], autoAdvancedAt: now.toISOString() }; }
        return b;
      });
      if (changed) await persist(next);
    }, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function manualRefresh() {
    setSyncing(true);
    const [freshBookings, freshBranches] = await Promise.all([fetchLatestBookings(), fetchLatestBranches()]);
    setBookings(freshBookings);
    setBranches(freshBranches);
    setLastSynced(new Date());
    setSyncing(false);
    notify({ title: "Synced", msg: "Latest data loaded", color: "var(--blue)" });
  }

  async function persist(next, nextSeq) {
    setBookings(next);
    try {
      await window.storage.set(STORE_KEY, JSON.stringify(next), true);
    } catch (e) {
      console.error(e);
      notify({ title: "Save failed", msg: "Could not reach the database — check your connection and try again.", color: "var(--red)" });
    }
    if (nextSeq !== undefined) {
      setSeq(nextSeq);
      try { await window.storage.set(SEQ_KEY, JSON.stringify(nextSeq), true); } catch (e) { console.error(e); }
    }
    setLastSynced(new Date());
  }

  async function persistBranches(next) {
    setBranches(next);
    try {
      await window.storage.set(BRANCH_STORE_KEY, JSON.stringify(next), true);
    } catch (e) {
      console.error(e);
      notify({ title: "Save failed", msg: "Branch changes could not be saved to the database — check your connection and try again.", color: "var(--red)" });
    }
    setLastSynced(new Date());
  }

  // Fetches the freshest copy of bookings from shared storage before writing,
  // so two branch managers saving at the same moment don't silently overwrite
  // each other's work (best-effort — a real backend with atomic writes is the
  // full fix, but this closes most of the gap for a browser-only app).
  async function handleSaveBooking(form, total) {
    const latest = await fetchLatestBookings();
    const latestAwbs = new Set(latest.map((b) => b.awb.toUpperCase()));
    let awb;
    if (form.awbMode === "manual") {
      awb = form.manualAwb.trim().toUpperCase();
      if (latestAwbs.has(awb)) return null; // duplicate slipped in from another session
    } else {
      let trySeq = seq;
      awb = generateAWB(trySeq);
      while (latestAwbs.has(awb)) { trySeq += 1; awb = generateAWB(trySeq); }
    }
    const branch = branches.find((b) => b.id === form.branchId);
    const createdAt = new Date().toISOString();
    const stagePlan = buildStagePlan({
      createdAt,
      consignorCity: form.consignorCity, consignorCountry: form.consignorCountry,
      consigneeCity: form.consigneeCity, consigneeCountry: form.consigneeCountry,
      mode: form.mode,
    });
    // Match the consignee city/country to a live branch, if the company has
    // one there — this is what lets the destination branch see the parcel
    // on its "Incoming Today" list without anyone typing a branch by hand.
    const destBranch = branches.find((b) => {
      if (!b.active || b.id === form.branchId) return false;
      const bc = (b.city || b.name || "").trim().toLowerCase();
      const cc = (form.consigneeCity || "").trim().toLowerCase();
      return bc && cc && (cc.includes(bc) || bc.includes(cc));
    });
    const booking = {
      ...form, awb, total, status: "Booked", createdAt,
      branchName: branch ? branch.name : "",
      destinationBranchId: destBranch ? destBranch.id : null,
      stagePlan,
      expectedDelivery: form.expectedDelivery || stagePlan.etaISO.slice(0, 10),
      reattempts: 0, codRemitted: false, ndrReason: null, manifestId: null,
    };
    await persist([...latest, booking], seq + 1);
    return booking;
  }
  async function handleUpdateStatus(awb, status, extra = {}) {
    const latest = await fetchLatestBookings();
    await persist(latest.map((b) => (b.awb === awb ? { ...b, status, ...extra } : b)));
  }
  async function handleDelete(awb) {
    const latest = await fetchLatestBookings();
    await persist(latest.filter((b) => b.awb !== awb));
  }

  async function handleCreateManifest(awbs, form = {}) {
    const latest = await fetchLatestBookings();
    const id = generateManifestId(manifestSeq);
    const createdAt = new Date().toISOString();
    const patch = {
      manifestVehicle: form.vehicle || "", manifestDriver: form.driver || "",
      manifestDriverDl: form.driverDl || "", manifestDriverContact: form.driverContact || "",
      manifestVendor: form.vendor || "", manifestFromBranch: form.fromBranch || "",
      manifestToBranch: form.toBranch || "", manifestRouteName: form.routeName || "",
    };
    const next = latest.map((b) => (awbs.includes(b.awb) ? { ...b, status: "Picked Up", manifestId: id, ...patch, manifestCreatedAt: createdAt } : b));
    await persist(next);
    const nextSeq = manifestSeq + 1;
    setManifestSeq(nextSeq);
    window.storage.set(MANIFEST_SEQ_KEY, JSON.stringify(nextSeq), true).catch((e) => console.error(e));
    return {
      id, createdAt, vehicle: patch.manifestVehicle, driver: patch.manifestDriver,
      driverDl: patch.manifestDriverDl, driverContact: patch.manifestDriverContact, vendor: patch.manifestVendor,
      fromBranch: patch.manifestFromBranch, toBranch: patch.manifestToBranch, routeName: patch.manifestRouteName,
      items: next.filter((b) => b.manifestId === id),
    };
  }

  async function handleAddBranch(form) {
    const latest = await fetchLatestBranches();
    const existingCodes = latest.map((b) => b.code).filter(Boolean);
    const existingIds = new Set(latest.map((b) => b.id));
    const code = (form.code && form.code.trim()) || deriveBranchCode(form.name, existingCodes);
    let id = code;
    while (existingIds.has(id)) id = code + Math.floor(Math.random() * 10); // extremely rare collision fallback
    const branch = { id, ...form, code, city: form.city || form.name, active: true, createdAt: new Date().toISOString() };
    await persistBranches([...latest, branch]);
  }
  async function handleUpdateBranch(id, patch) {
    const latest = await fetchLatestBranches();
    await persistBranches(latest.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  async function handleDeleteBranch(id) {
    const latest = await fetchLatestBranches();
    await persistBranches(latest.filter((b) => b.id !== id));
  }

  return (
    <div className="mcl-root">
      <GlobalStyle />
      <div className="aurora"><span className="a1" /><span className="a2" /><span className="a3" /></div>
      <div className="grid-veil" />
      <div className="content-layer">
        <Nav view={view} setView={setView} adminLoggedIn={!!currentUser} onLogout={() => setCurrentUser(null)} syncing={syncing} lastSynced={lastSynced} onRefresh={manualRefresh} />

        {!loaded ? (
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 20px" }}>
            <div className="shimmer" style={{ height: 220, marginBottom: 16 }} />
            <div className="shimmer" style={{ height: 60, marginBottom: 16 }} />
            <div className="shimmer" style={{ height: 60 }} />
          </div>
        ) : (
          <div key={view} className="view-enter">
            {view === "home" && <HomeView setView={setView} bookings={bookings} />}
            {view === "track" && <TrackView bookings={bookings} onPrint={setPrintTarget} />}
            {view === "admin" && (
              currentUser
                ? <AdminPanel bookings={bookings} onSaveBooking={handleSaveBooking} onUpdateStatus={handleUpdateStatus} onPrint={setPrintTarget} onDelete={handleDelete} notify={notify} customers={customers} onCreateManifest={handleCreateManifest} onPrintManifest={setPrintManifest} currentUser={currentUser} branches={branches} existingAwbs={existingAwbs} onAddBranch={handleAddBranch} onUpdateBranch={handleUpdateBranch} onDeleteBranch={handleDeleteBranch} />
                : <LoginScreen onLogin={setCurrentUser} branches={branches} />
            )}
          </div>
        )}
      </div>

      {printTarget && <PrintableWaybill booking={printTarget} onClose={() => setPrintTarget(null)} branches={branches} />}
      {printManifest && <PrintableManifest manifest={printManifest} onClose={() => setPrintManifest(null)} />}
      <ToastHost toasts={toasts} remove={() => {}} />
    </div>
  );
}
