import { apiFetch } from "./api.js";
import { LS_VENUE_ID } from "./config.js";

/**
 * Approche: venues dans la DB.
 * - listVenues: charge tout
 * - ensureVenueByName: crée si absent
 * - selected venue stocké en localStorage
 */

export function getSelectedVenueId(){
  return localStorage.getItem(LS_VENUE_ID) || "";
}
export function setSelectedVenueId(id){
  localStorage.setItem(LS_VENUE_ID, id);
}

export async function listVenues(){
  return await apiFetch("/rest/v1/venues?select=id,name,created_at&order=name.asc") || [];
}

export async function ensureVenueByName(name){
  const found = await apiFetch(`/rest/v1/venues?select=id,name&name=eq.${encodeURIComponent(name)}`) || [];
  if(found[0]) return found[0];

  const inserted = await apiFetch("/rest/v1/venues?select=id,name", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "Prefer":"return=representation" },
    body: JSON.stringify({ name })
  });
  return inserted?.[0] || null;
}
