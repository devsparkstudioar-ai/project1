// Shared constants used across App.jsx and the standalone components in
// /components. Kept in their own module (rather than exported from App.jsx)
// so those components never need to import App.jsx itself.

export const STATUS_STEPS = ["Booked", "Picked Up", "In Transit", "Out for Delivery", "Delivered"];

export const COMPANY = {
  name: "METRO COURIER AND LOGISTICS",
  tagline: "THE LOAD POINT",
  scope: "Domestic & International",
  address: "No. 1, Sathya Street, Municipal Colony, Erode - 638 004 (TN)",
  gst: "33BFZPG9691E3ZR",
  phone: "0424-3560190",
  mobile: "8883055119",
  whatsapp: "7305055119",
  email: "metrologistics4862@gmail.com",
  md: "Gunasheelan K",
  website: "www.metrologistics.org.in",
};

// Courier service-place listings shown on the Home page, grouped into
// South Zone / North Zone boxes. Admins can add, edit and remove these from
// the "Service Places" tab in the Admin panel — everyone else only sees the
// read-only list. Bumped the storage key to v2 since the shape changed from
// "tier" (District/State/Country) to "zone" (South/North) with a fixed
// starter list of cities.
export const SERVICE_PLACES_KEY = "metro_service_places_v2";

export const ZONES = ["South", "North"];

// Used for the consignor/consignee "Country" fields (auto-tracking engine
// needs this to tell domestic vs. international shipments apart) and any
// other place a quick country picker is useful.
export const COUNTRIES = [
  "India", "Sri Lanka", "Nepal", "Bangladesh", "Bhutan", "Pakistan",
  "Singapore", "Malaysia", "Thailand", "UAE", "Saudi Arabia", "Qatar",
  "Kuwait", "Oman", "Bahrain", "USA", "UK", "Canada", "Australia",
  "Germany", "France", "China", "Japan", "South Korea", "Hong Kong",
  "South Africa", "New Zealand", "Italy", "Spain", "Netherlands",
  "Russia", "Brazil", "Indonesia", "Philippines", "Vietnam", "Kenya",
];

// Seeded automatically the first time the app runs (see ServicePlacesAdmin).
// Admins can then fill in contact numbers / details for each, or add/remove
// cities from here as coverage changes.
export const DEFAULT_SERVICE_PLACES = [
  ...[
    "Erode", "Salem", "Karur", "Tirupur", "Coimbatore", "Chennai",
    "Krishnagiri", "Dharmapuri", "Hosur", "Trichy", "Madurai", "Dindigul",
    "Tirunelveli", "Tuticorin", "Namakkal", "Vellore", "Kanchipuram",
  ].map((name, i) => ({ id: `SP-S-${i + 1}`, zone: "South", name, contact: "", details: "" })),
  ...[
    "Mumbai", "Delhi", "Gurgaon", "Faridabad", "Noida", "Jaipur",
    "Ahmedabad", "Surat", "Hyderabad", "Kolkata",
  ].map((name, i) => ({ id: `SP-N-${i + 1}`, zone: "North", name, contact: "", details: "" })),
];
