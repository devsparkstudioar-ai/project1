# METRO Courier & Logistics

A full-stack booking, dispatch and tracking system for METRO Courier and
Logistics — React frontend, Express + PostgreSQL backend.

```
metro-project/
├── client/          React (Vite) frontend — booking UI, tracking, admin panel
│   ├── src/
│   │   ├── App.jsx              Main application (views, admin, printing)
│   │   ├── constants.js         Shared constants (company info, status stages, storage keys)
│   │   ├── components/
│   │   │   ├── TrackingStagesSection.jsx   Home page "how tracking works" stepper
│   │   │   ├── ServicePlaces.jsx           Home page service-coverage boxes (read-only)
│   │   │   └── ServicePlacesAdmin.jsx      Admin CRUD for service-coverage boxes
│   │   └── utils/storage.js     API client — talks to the backend (see below)
│   └── public/logo.png          Company logo (brightened, outlined version)
│
└── server/          Express API backed by PostgreSQL
    ├── src/
    │   ├── index.js             Server entry point
    │   ├── db.js                PostgreSQL connection pool
    │   ├── schema.sql           Database schema (run via `npm run migrate`)
    │   ├── migrate.js           Applies schema.sql
    │   └── routes/
    │       ├── storage.js       Generic key/value data store (bookings, branches, service places, counters)
    │       └── files.js         Binary file storage (POD photos, ID proofs, etc.)
    └── .env.example
```

## Why this structure

Everything the app saves — bookings, branches, sequence counters, and the
new service-place listings — now lives in **PostgreSQL** instead of the
browser. The frontend talks to it through one small, generic API
(`/api/storage/:key`) rather than one bespoke endpoint per feature. That
keeps the booking/dispatch/reporting logic in `App.jsx` completely intact
(nothing about how bookings or manifests work had to be rewritten) while
giving you a real multi-branch, multi-device database behind it. You can
still query any of it directly with plain SQL any time you want
(`SELECT * FROM app_storage;`).

Splitting the project into `client/` and `server/` is the standard shape for
a React + Node app — it's what you'll see if you open this in VS Code,
GitHub Codespaces, StackBlitz, or any other browser-based editor, and it's
what platforms like Vercel (frontend) and Render/Railway (backend) expect
when you connect a repo for automatic deployment.

## 1. Set up PostgreSQL

Install PostgreSQL locally, **or** create a free managed database on
Neon (neon.tech), Supabase (supabase.com), or Render (render.com) — any of
these give you a `DATABASE_URL` connection string in about a minute, and
work well for "edit from anywhere" since there's nothing to run locally.

```bash
cd server
cp .env.example .env
# edit .env and paste your DATABASE_URL
npm install
npm run migrate      # creates the tables
npm run dev           # starts the API on http://localhost:4000
```

## 2. Run the frontend

```bash
cd client
cp .env.example .env    # VITE_API_URL should point at your server, e.g. http://localhost:4000
npm install
npm run dev              # opens http://localhost:5173
```

Log into the admin portal with the default password `metro2026` (change this
in `client/src/App.jsx` — search for `ADMIN_PASS` — before going live).

## 3. Editing the project from anywhere (no local install)

Since you want to keep editing this from the browser rather than a local
machine:

- **GitHub Codespaces** — push this project to a GitHub repo, then open it
  as a Codespace. You get a full VS Code + terminal in Chrome, and can run
  both `npm run dev` commands from its integrated terminal.
- **StackBlitz / CodeSandbox** — import the GitHub repo directly; both run
  Node in-browser, so `client/` works with zero local setup. For `server/`,
  point it at a managed Postgres URL (Neon/Supabase) rather than a local DB.
- Either way, the `client/` and `server/` split above means each half can be
  opened, edited and redeployed independently.

## 4. Deploying

- **Frontend (`client/`)** → Vercel or Netlify. Set the build command to
  `npm run build`, output directory `dist`, and add an environment variable
  `VITE_API_URL` pointing at your deployed backend.
- **Backend (`server/`)** → Render, Railway, or Fly.io. Set `DATABASE_URL`
  and `CORS_ORIGIN` (your Vercel domain) as environment variables, and run
  `npm run migrate` once against the production database before first use.

## What changed in this update

- **Database**: all data (bookings, branches, service places, AWB/manifest
  counters) now persists in PostgreSQL via the `server/` API instead of
  browser storage.
- **Home page**: removed the "parcels on file" counter; added a dedicated
  "How every shipment is tracked" section showing the 5 tracking stages, and
  a "Where we deliver" section grouped into **South Zone** and **North
  Zone** banners (each with its own background art), pre-loaded with your
  city list (Erode, Salem, Karur, Tirupur, Coimbatore, Chennai, Krishnagiri,
  Dharmapuri, Hosur, Trichy, Madurai, Dindigul, Tirunelveli, Tuticorin,
  Namakkal, Vellore, Kanchipuram for South; Mumbai, Delhi, Gurgaon,
  Faridabad, Noida, Jaipur, Ahmedabad, Surat, Hyderabad, Kolkata for North).
- **Admin panel**: Service Places tab — admins can add, edit and delete
  cities/zones, and fill in each one's contact number and details; a zone
  filter makes it easy to manage South vs North separately. Nobody else can
  edit this list.
- **Logo**: re-processed for a brighter, higher-contrast look with a dark
  outline for legibility on any background, plus CSS filters for extra
  sharpness on screen. The original file is kept at
  `client/public/logo-original.png` if you ever want to revert or re-edit it.

## What changed in this update (v7)

- **New logo**: replaced with the navy-and-gold "METRO COURIER AND LOGISTICS —
  THE LOAD POINT" logo, background removed and re-processed for a bright,
  sharp look with a dark outline and a soft navy+gold glow that echoes the
  logo's own colours. Applied across the header, login screen, hero, and
  print copies. Original raw upload kept at `client/public/logo-original.png`.
- **Printable AWB / POD copies**: rebuilt to match your consignment-note
  template — pickup details, nature-of-goods checkboxes (DOX/NON DOX/CASH/
  TO-PAY/CREDIT), transport-mode checkboxes (AIR/TRAIN/SURFACE), package
  size (L×B×H — new fields on the booking form), declared invoice value,
  E-Way bill number, and a "received in good order" sign-off block. Printing
  now produces two copies back-to-back — **Consignor Copy** and **Office
  Copy** — each labelled on its own vertical strip like the original slip.
- **Branch manager contact on prints**: each branch can now have a manager
  name (Admin → Branches), and both the manager's name and the branch
  contact number are printed prominently on every AWB/POD copy so the
  recipient always has someone local to call.
- **Storage reliability**: booking, branch, and service-place saves now
  surface a visible red toast if the write to PostgreSQL fails (e.g. lost
  connection), instead of silently failing while the screen still looked
  saved. Nothing changes if the save succeeds — it's purely a safety net for
  when it doesn't.

## Notes
- The `/api/storage/:key` endpoint stores each record as JSON in a
  `storage_key` column, matching the shape the app already used — this was
  the lowest-risk way to move roughly 2,300 lines of working
  booking/dispatch logic onto a real database without rewriting it from
  scratch. If you'd like a fully normalized schema (separate `bookings`,
  `branches`, `service_places` tables with proper columns and SQL
  joins/reporting) as a next step, that's a good follow-up project — just ask.
- `server/src/routes/files.js` gives you a ready-made place to store photos
  or documents (POD photos, ID proofs, signed waybills) directly in
  PostgreSQL as you add those features later.
#   p r o j e c t 1  
 