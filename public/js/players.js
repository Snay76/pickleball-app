import { apiFetch } from "./api.js";

export async function loadPlayersByVenue(venueId){
  if(!venueId) return [];
  return await apiFetch(`/rest/v1/players?select=id,name,venue_id,created_at&venue_id=eq.${venueId}&order=created_at.asc`) || [];
}

export async function addPlayer({ name, venue_id }){
  const inserted = await apiFetch("/rest/v1/players?select=id,name,venue_id,created_at", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "Prefer":"return=representation" },
    body: JSON.stringify({ name, venue_id })
  });
  return inserted?.[0] || null;
}

export async function deletePlayer(id){
  await apiFetch(`/rest/v1/players?id=eq.${id}`, { method:"DELETE" });
}
