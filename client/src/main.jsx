import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import storage from "./utils/storage.js";

// The app calls window.storage.get/set(...) for persistence. That call now
// goes over HTTP to the Express + PostgreSQL API in /server (see
// src/utils/storage.js), so all bookings, branches and service places are
// stored centrally in the database instead of a single browser's storage.
window.storage = storage;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
