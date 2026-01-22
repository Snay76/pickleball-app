import { apiFetch } from "./api.js";

// Liste des joueurs du lieu courant (JOIN via location_players)
export async function listPlayersForVenue(venueId) {
  if (!venueId) return [];
  // location_players -> players
  // select=player_id,players(id,name)
  const rows = await apiFetch(
    `/rest/v1/location_players?select=player_id,players(id,name,created_at)&location_id=eq.${venueId}&order=created_at.asc`
  );
  // Flatten
  return (rows || []).map(r => ({
    id: r.players?.id,
    name: r.players?.name,
    player_id: r.player_id,
  })).filter(p => p.id);
}

// Crée un joueur global (players) puis retourne la ligne créée
export async function createPlayerGlobal(name) {
  const inserted = await apiFetch("/rest/v1/players?select=id,name,created_at", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify({ name })
  });
  return inserted?.[0] || null;
}

// Inscrire un joueur dans un lieu
export async function addPlayerToVenue(venueId, playerId) {
  if (!venueId) throw new Error("venueId requis");
  if (!playerId) throw new Error("playerId requis");

  // ignore duplicates: on s’appuie sur PK (location_id, player_id)
  await apiFetch("/rest/v1/location_players", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Prefer": "resolution=ignore-duplicates"
    },
    body: JSON.stringify({ location_id: venueId, player_id: playerId })
  });
}

// Désinscrire un joueur du lieu (ne supprime pas le joueur global)
export async function removePlayerFromVenue(venueId, playerId) {
  if (!venueId || !playerId) return;
  await apiFetch(`/rest/v1/location_players?location_id=eq.${venueId}&player_id=eq.${playerId}`, {
    method: "DELETE"
  });
}
