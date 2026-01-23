import { apiFetch } from "./api.js";

// Matchs du jour pour un lieu (ISO range)
export async function listMatchesForVenueToday(venueId, fromIso, toIso) {
  if (!venueId) return [];
  // created_at filter
  const q = `/rest/v1/matches?select=id,location_id,court,status,a1,a2,b1,b2,created_at,ended_at,ended_by_user_id,ended_at,ended_by_user_id,score_a,score_b`
          + `&location_id=eq.${venueId}`
          + `&created_at=gte.${encodeURIComponent(fromIso)}`
          + `&created_at=lt.${encodeURIComponent(toIso)}`
          + `&order=created_at.desc`;
  try {
    return (await apiFetch(q)) || [];
  } catch (e) {
    // Si la table n'a pas encore score_a/score_b, Supabase renverra 400.
    // On retente sans ces colonnes.
    const q2 = `/rest/v1/matches?select=id,location_id,court,status,a1,a2,b1,b2,created_at,ended_at,ended_by_user_id`
            + `&location_id=eq.${venueId}`
            + `&created_at=gte.${encodeURIComponent(fromIso)}`
            + `&created_at=lt.${encodeURIComponent(toIso)}`
            + `&order=created_at.desc`;
    return (await apiFetch(q2)) || [];
  }
}

export async function createMatchForVenue(venueId, payload) {
  if (!venueId) throw new Error("venueId requis");
  const toInsert = { ...payload, location_id: venueId };

  // Preferred: atomic RPC (match + match_players + billing)
  try{
    const r = await apiFetch("/rest/v1/rpc/create_match_with_billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toInsert)
    });
    // RPC can return inserted match (object)
    if(r?.id) return r;
  }catch(e){ /* fallback */ }

  const inserted = await apiFetch("/rest/v1/matches?select=id,location_id,court,status,a1,a2,b1,b2,created_at,ended_at,score_a,score_b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(toInsert)
  });

  return inserted?.[0] || null;
}

// Terminer un match (PATCH). Tolère l'absence de colonnes score_a/score_b.
export async function finishMatchById(matchId, { status = "done", score_a = null, score_b = null, ended_by_user_id = null } = {}) {
  if (!matchId) throw new Error("matchId requis");

  // 1) tentative avec score
  const ended_at = new Date().toISOString();
  const payload1 = { status, score_a, score_b, ended_at, ended_by_user_id };
  try {
    await apiFetch(`/rest/v1/matches?id=eq.${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload1)
    });
    return true;
  } catch (e) {
    // 2) fallback sans score
    const payload2 = { status, ended_at, ended_by_user_id };
    await apiFetch(`/rest/v1/matches?id=eq.${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload2)
    });
    return true;
  }
}

// Terminer tous les matchs du jour pour un lieu (sans score)
export async function finishAllMatchesForVenueToday(venueId, fromIso, toIso) {
  if (!venueId) throw new Error("venueId requis");
  const matches = await listMatchesForVenueToday(venueId, fromIso, toIso);
  const toFinish = matches.filter(m => (m.status || "") !== "done");
  for (const m of toFinish) {
    await finishMatchById(m.id, { status: "done", score_a: null, score_b: null });
  }
  return toFinish.length;
}
