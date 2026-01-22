import { apiFetch } from "./api.js";

export async function listMatchesForVenue(venueId) {
  if (!venueId) return [];
  return await apiFetch(
    `/rest/v1/matches?select=id,location_id,court,status,a1,a2,b1,b2,created_at&location_id=eq.${venueId}&order=created_at.desc`
  ) || [];
}

export async function createMatchForVenue(venueId, payload) {
  if (!venueId) throw new Error("venueId requis");
  const toInsert = { ...payload, location_id: venueId };

  const inserted = await apiFetch("/rest/v1/matches?select=id,location_id,court,status,a1,a2,b1,b2,created_at", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(toInsert)
  });

  return inserted?.[0] || null;
}
