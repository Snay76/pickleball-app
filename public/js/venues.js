import { apiFetch } from "./api.js";

const LS_VENUE_PREFIX = "pb_selected_venue_"; // + userId

export function getSelectedVenueId(userId) {
  if (!userId) return localStorage.getItem("pb_selected_venue") || "";
  return localStorage.getItem(LS_VENUE_PREFIX + userId) || "";
}

export function setSelectedVenueId(userId, venueId) {
  if (!userId) localStorage.setItem("pb_selected_venue", venueId || "");
  else localStorage.setItem(LS_VENUE_PREFIX + userId, venueId || "");
}

export async function listVenues() {
  return (await apiFetch("/rest/v1/locations?select=id,name,created_at&order=name.asc")) || [];
}

export async function createVenue({ name, created_by }) {
  const payload = { name, created_by };
  const inserted = await apiFetch("/rest/v1/locations?select=id,name,created_at", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(payload),
  });
  return inserted?.[0] || null;
}

export function fillVenueSelect(selectEl, venues, selectedId) {
  selectEl.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "(choisir un lieu)";
  selectEl.appendChild(opt0);

  for (const v of venues) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    if (v.id === selectedId) o.selected = true;
    selectEl.appendChild(o);
  }
}
