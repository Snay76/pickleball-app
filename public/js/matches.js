import { apiFetch } from "./api.js";

function todayISODate(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function loadMatchesForToday({ venueId }){
  const date = todayISODate();
  if(!venueId) return [];
  return await apiFetch(`/rest/v1/matches?select=id,court,status,a1,a2,b1,b2,created_at,session_date,end_reason,score_a,score_b,created_by,venue_id&venue_id=eq.${venueId}&session_date=eq.${date}&order=created_at.desc`) || [];
}

export async function createMatch({ venue_id, created_by, court, a1, a2, b1, b2 }){
  // Singles: a2 et b2 peuvent être null
  const payload = {
    venue_id,
    created_by,
    court,
    status: "open",
    a1, a2, b1, b2
  };
  const inserted = await apiFetch("/rest/v1/matches?select=id,court,status,a1,a2,b1,b2,created_at,session_date", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "Prefer":"return=representation" },
    body: JSON.stringify(payload)
  });
  return inserted?.[0] || null;
}

export async function endMatch({ id, end_reason, score_a=null, score_b=null }){
  const payload = {
    status: "done",
    end_reason,
    score_a,
    score_b,
    ended_at: new Date().toISOString()
  };
  await apiFetch(`/rest/v1/matches?id=eq.${id}`, {
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
}

export async function abandonMatch({ id }){
  await endMatch({ id, end_reason: "abandoned", score_a: null, score_b: null });
}

export async function finishAllOpenMatches({ venueId }){
  // termine tout “open/locked” du jour, sans score
  const date = todayISODate();
  const payload = { status:"done", end_reason:"done", ended_at: new Date().toISOString() };
  await apiFetch(`/rest/v1/matches?venue_id=eq.${venueId}&session_date=eq.${date}&status=in.(open,locked)`, {
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
}
