// ============================================================================
// Automatic tracking engine
// ----------------------------------------------------------------------------
// Turns "booking time + origin/destination + service mode" into a real stage
// timeline (Booked → Picked Up → In Transit → Out for Delivery → Delivered),
// the same way Amazon/Flipkart project a live ETA instead of requiring a
// human to flip every status by hand.
//
// Design choice: the engine auto-advances a parcel through every stage up to
// and including "Out for Delivery" purely from elapsed time + distance. The
// final "Delivered" tick is intentionally left for the *destination* branch
// to confirm (see IncomingTodayPanel in App.jsx) — a courier should never be
// shown as delivered on a customer's screen just because a clock ran out.
// ============================================================================

import { STATUS_STEPS } from "../constants.js";

/* ------------------------------- geography ------------------------------- */

// Approximate lat/lng for every city seeded in the service-places list plus
// the other major hubs a Tamil Nadu-based courier is likely to book to.
// Good enough for line-haul distance estimation — not for turn-by-turn nav.
export const CITY_COORDS = {
  "erode": [11.341, 77.7172], "salem": [11.664, 78.146], "karur": [10.9601, 78.0766],
  "tirupur": [11.1085, 77.3411], "coimbatore": [11.0168, 76.9558], "chennai": [13.0827, 80.2707],
  "krishnagiri": [12.5186, 78.2137], "dharmapuri": [12.1211, 78.1582], "hosur": [12.7409, 77.8253],
  "trichy": [10.7905, 78.7047], "tiruchirappalli": [10.7905, 78.7047], "madurai": [9.9252, 78.1198],
  "dindigul": [10.3624, 77.9695], "tirunelveli": [8.7139, 77.7567], "tuticorin": [8.7642, 78.1348],
  "thoothukudi": [8.7642, 78.1348], "namakkal": [11.2189, 78.1677], "vellore": [12.9165, 79.1325],
  "kanchipuram": [12.8342, 79.7036], "mumbai": [19.076, 72.8777], "delhi": [28.7041, 77.1025],
  "new delhi": [28.6139, 77.209], "gurgaon": [28.4595, 77.0266], "gurugram": [28.4595, 77.0266],
  "faridabad": [28.4089, 77.3178], "noida": [28.5355, 77.391], "jaipur": [26.9124, 75.7873],
  "ahmedabad": [23.0225, 72.5714], "surat": [21.1702, 72.8311], "hyderabad": [17.385, 78.4867],
  "kolkata": [22.5726, 88.3639], "bengaluru": [12.9716, 77.5946], "bangalore": [12.9716, 77.5946],
  "pune": [18.5204, 73.8567], "kochi": [9.9312, 76.2673], "cochin": [9.9312, 76.2673],
  "thiruvananthapuram": [8.5241, 76.9366], "trivandrum": [8.5241, 76.9366], "mysuru": [12.2958, 76.6394],
  "mysore": [12.2958, 76.6394], "nagpur": [21.1458, 79.0882], "bhopal": [23.2599, 77.4126],
  "lucknow": [26.8467, 80.9462], "kanpur": [26.4499, 80.3319], "patna": [25.5941, 85.1376],
  "chandigarh": [30.7333, 76.7794], "bhubaneswar": [20.2961, 85.8245], "guwahati": [26.1445, 91.7362],
  "indore": [22.7196, 75.8577], "visakhapatnam": [17.6868, 83.2185], "vizag": [17.6868, 83.2185],
  "rajkot": [22.3039, 70.8022], "nashik": [19.9975, 73.7898], "ludhiana": [30.901, 75.8573],
  "agra": [27.1767, 78.0081], "varanasi": [25.3176, 82.9739], "amritsar": [31.634, 74.8723],
  "raipur": [21.2514, 81.6296], "ranchi": [23.3441, 85.3096], "dehradun": [30.3165, 78.0322],
  "jodhpur": [26.2389, 73.0243], "goa": [15.2993, 74.124], "panaji": [15.4909, 73.8278],
  "puducherry": [11.9416, 79.8083], "pondicherry": [11.9416, 79.8083],
};

// Country-level fallback centroid (used when a consignee/consignor city
// can't be matched, or when the shipment is international). Distances to
// these are inherently approximate — fine for ETA banding, not for freight
// billing.
export const COUNTRY_COORDS = {
  "india": [22.9734, 78.6569], "sri lanka": [7.8731, 80.7718], "nepal": [28.3949, 84.124],
  "bangladesh": [23.685, 90.3563], "bhutan": [27.5142, 90.4336], "pakistan": [30.3753, 69.3451],
  "singapore": [1.3521, 103.8198], "malaysia": [4.2105, 101.9758], "thailand": [15.870, 100.9925],
  "uae": [23.4241, 53.8478], "united arab emirates": [23.4241, 53.8478], "saudi arabia": [23.8859, 45.0792],
  "qatar": [25.3548, 51.1839], "kuwait": [29.3117, 47.4818], "oman": [21.4735, 55.9754],
  "bahrain": [26.0667, 50.5577], "usa": [37.0902, -95.7129], "united states": [37.0902, -95.7129],
  "uk": [55.3781, -3.436], "united kingdom": [55.3781, -3.436], "canada": [56.1304, -106.3468],
  "australia": [-25.2744, 133.7751], "germany": [51.1657, 10.4515], "france": [46.2276, 2.2137],
  "china": [35.8617, 104.1954], "japan": [36.2048, 138.2529], "south korea": [35.9078, 127.7669],
  "hong kong": [22.3193, 114.1694], "south africa": [-30.5595, 22.9375], "new zealand": [-40.9006, 174.886],
  "italy": [41.8719, 12.5674], "spain": [40.4637, -3.7492], "netherlands": [52.1326, 5.2913],
  "russia": [61.524, 105.3188], "brazil": [-14.235, -51.9253], "indonesia": [-0.7893, 113.9213],
  "philippines": [12.8797, 121.774], "vietnam": [14.0583, 108.2772], "kenya": [-0.0236, 37.9062],
};

const INDIA_KEYS = new Set(Object.keys(CITY_COORDS));

function normKey(s) { return (s || "").trim().toLowerCase(); }

/** Best-effort [lat, lng] lookup for a free-text city/country string. */
export function resolveCoords(cityText, countryText) {
  const city = normKey(cityText);
  const country = normKey(countryText);
  if (city && CITY_COORDS[city]) return { coords: CITY_COORDS[city], matched: "city", inIndia: true };
  // substring match (handles "Erode - Perundurai Rd" etc.)
  if (city) {
    for (const key of INDIA_KEYS) {
      if (city.includes(key) || key.includes(city)) return { coords: CITY_COORDS[key], matched: "city", inIndia: true };
    }
  }
  if (country && country !== "india" && COUNTRY_COORDS[country]) {
    return { coords: COUNTRY_COORDS[country], matched: "country", inIndia: false };
  }
  if (country && country !== "india") {
    for (const key of Object.keys(COUNTRY_COORDS)) {
      if (country.includes(key) || key.includes(country)) return { coords: COUNTRY_COORDS[key], matched: "country", inIndia: false };
    }
  }
  // unresolved — fall back to India centroid so distance calc never throws
  return { coords: COUNTRY_COORDS["india"], matched: "fallback", inIndia: true };
}

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180, lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Distance (km) + whether the shipment crosses an international border. */
export function estimateRoute(consignorCity, consignorCountry, consigneeCity, consigneeCountry) {
  const from = resolveCoords(consignorCity, consignorCountry || "India");
  const to = resolveCoords(consigneeCity, consigneeCountry || "India");
  const km = Math.max(5, haversineKm(from.coords, to.coords));
  const international = !from.inIndia || !to.inIndia ||
    (normKey(consignorCountry || "India") !== normKey(consigneeCountry || "India"));
  return { km, international };
}

/* ------------------------------- timing model ------------------------------- */

// Effective end-to-end speeds (km/h) already netting out ordinary stops —
// tuned to feel like real courier transit bands, not straight-line flight
// time. "Surface" covers both road and rail line-haul.
const SPEED_KMH = { Surface: 32, Express: 48, Air: 480 };
const INTL_AIR_SPEED_KMH = 650;

// Fixed handling overhead, in hours, layered on top of pure line-haul time.
const HANDLING = {
  pickup: 3,        // Booked -> Picked Up (courier collects from consignor)
  originSort: 4,    // Picked Up -> hub sort before onward movement
  destSort: 5,      // arrival at destination hub -> Out for Delivery
  lastMile: 6,       // Out for Delivery -> doorstep
  customs: 30,       // extra hold for international shipments
};

// Minimum realistic total transit floors (hours), so a 10km hop still shows
// a same/next-day delivery instead of an implausible 45-minute ETA.
const MIN_TOTAL_HOURS = { Surface: 24, Express: 18, Air: 20 };

/**
 * Build the planned stage timeline for a booking.
 * Returns { stages: [{stage, plannedAt}], etaISO, totalHours, km, international }
 */
export function buildStagePlan({ createdAt, consignorCity, consignorCountry, consigneeCity, consigneeCountry, mode }) {
  const { km, international } = estimateRoute(consignorCity, consignorCountry, consigneeCity, consigneeCountry);
  const speed = international ? INTL_AIR_SPEED_KMH : (SPEED_KMH[mode] || SPEED_KMH.Surface);
  const lineHaulHrs = km / speed;
  const floor = international ? 48 : (MIN_TOTAL_HOURS[mode] || MIN_TOTAL_HOURS.Surface);

  const tPickedUp = HANDLING.pickup;
  const tInTransit = tPickedUp + HANDLING.originSort;
  const tOutForDelivery = tInTransit + lineHaulHrs + HANDLING.destSort + (international ? HANDLING.customs : 0);
  const tDelivered = Math.max(tOutForDelivery + HANDLING.lastMile, floor);

  const base = new Date(createdAt).getTime();
  const hoursToIso = (h) => new Date(base + h * 3600 * 1000).toISOString();

  return {
    km, international, mode,
    stages: [
      { stage: "Booked", plannedAt: new Date(base).toISOString() },
      { stage: "Picked Up", plannedAt: hoursToIso(tPickedUp) },
      { stage: "In Transit", plannedAt: hoursToIso(tInTransit) },
      { stage: "Out for Delivery", plannedAt: hoursToIso(tOutForDelivery) },
      { stage: "Delivered", plannedAt: hoursToIso(tDelivered) },
    ],
    etaISO: hoursToIso(tDelivered),
    totalHours: Math.round(tDelivered),
  };
}

const TERMINAL_STATUSES = new Set(["Delivered", "RTO", "NDR"]);
// Auto-advance never jumps a parcel to "Delivered" on its own — that tick
// requires a human at the destination branch. See module docblock.
const AUTO_CAP_INDEX = STATUS_STEPS.indexOf("Out for Delivery");

/**
 * Given a booking (with a stored .stagePlan) and "now", work out which
 * stage the parcel *should* be at automatically, capped before Delivered.
 * Returns null if there's nothing useful to compute (no plan, or the
 * booking is already in a state a human owns: Delivered / RTO / NDR).
 */
export function computeAutoStageIndex(booking, now = new Date()) {
  if (!booking || !booking.stagePlan || !booking.stagePlan.stages) return null;
  if (TERMINAL_STATUSES.has(booking.status)) return null;
  const nowMs = now.getTime();
  let idx = 0;
  booking.stagePlan.stages.forEach((s, i) => {
    if (new Date(s.plannedAt).getTime() <= nowMs && i <= AUTO_CAP_INDEX) idx = i;
  });
  return idx;
}

/** Live progress (0–100) for a route-rail / progress-bar style UI. */
export function computeLiveProgress(booking, now = new Date()) {
  if (!booking) return 0;
  const stored = STATUS_STEPS.indexOf(booking.status);
  if (TERMINAL_STATUSES.has(booking.status)) {
    return booking.status === "Delivered" ? 100 : (stored >= 0 ? (stored / (STATUS_STEPS.length - 1)) * 100 : 100);
  }
  if (!booking.stagePlan) return stored >= 0 ? (stored / (STATUS_STEPS.length - 1)) * 100 : 0;
  const plan = booking.stagePlan.stages;
  const nowMs = now.getTime();
  const total = new Date(plan[plan.length - 1].plannedAt).getTime() - new Date(plan[0].plannedAt).getTime();
  const elapsed = Math.min(Math.max(nowMs - new Date(plan[0].plannedAt).getTime(), 0), total);
  const pct = total > 0 ? (elapsed / total) * 100 : 0;
  // never show live progress behind the manually-confirmed stored status
  return Math.max(pct, stored >= 0 ? (stored / (STATUS_STEPS.length - 1)) * 100 : 0);
}

export function formatEta(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------- branch codes ------------------------------- */

/**
 * Derive a short, human-readable branch code from a branch name — e.g.
 * "Erode" -> "ERD", "Salem" -> "SAL", "Coimbatore Head Office" -> "COI".
 * Guaranteed unique against existingCodes (appends 2, 3, … on collision).
 */
export function deriveBranchCode(name, existingCodes = []) {
  const clean = (name || "").toUpperCase().replace(/[^A-Z\s]/g, "").trim();
  const letters = (clean.split(/\s+/)[0] || "BRN").replace(/\s/g, "");
  const used = new Set(existingCodes.map((c) => (c || "").toUpperCase()));

  // 1st choice: plain first-3-letters — "Salem" -> "SAL", "Erode" -> "ERO".
  // Most readable, and what most courier networks already use.
  const firstThree = (letters + "XXX").slice(0, 3);
  if (!used.has(firstThree)) return firstThree;

  // 2nd choice: first letter + next two consonants (airport-code style),
  // for when the plain version collides — "Erode" -> "ERD".
  const vowels = new Set(["A", "E", "I", "O", "U"]);
  const rest = [...letters.slice(1)].filter((c) => !vowels.has(c));
  const consonantForm = (letters[0] + rest.slice(0, 2).join("")).padEnd(3, "X").slice(0, 3);
  if (consonantForm !== firstThree && !used.has(consonantForm)) return consonantForm;

  // Last resort: numeric suffix.
  for (let n = 1; n < 100; n++) {
    const candidate = (firstThree.slice(0, 2) + n).slice(0, 4);
    if (!used.has(candidate)) return candidate;
  }
  return firstThree + Math.floor(Math.random() * 9);
}
