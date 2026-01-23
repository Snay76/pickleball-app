import { apiFetch } from "./api.js";

// Liste des joueurs du lieu courant (JOIN via location_players)
// Retourne: [{ id, name, player_id, present }]
export async function listPlayersForVenue(venueId) {
  if (!venueId) return [];

  // NOTE:
  // - on sélectionne 'present' sur location_players
  // - le tri 'order=created_at.asc' sur players n'est pas fiable via join
  //   -> on trie côté JS sur players.created_at si présent
  const rows = await apiFetch(
    `/rest/v1/location_players?select=player_id,present,players(id,name,created_at)&location_id=eq.${venueId}`
  );

  const flattened = (rows || [])
    .map(r => ({
      id: r.players?.id,
      name: r.players?.name,
      created_at: r.players?.created_at || null,
      player_id: r.player_id,
      present: (r.present === null || r.present === undefined) ? true : !!r.present,
    }))
    .filter(p => p.id);

  // tri stable: par date création joueur, sinon par nom
  flattened.sort((a,b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (da !== db) return da - db;
    return String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity:"base" });
  });

  return flattened;
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
  // present: true (si la colonne existe)
  await apiFetch("/rest/v1/location_players", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Prefer": "resolution=ignore-duplicates"
    },
    body: JSON.stringify({ location_id: venueId, player_id: playerId, present: true })
  });
}

// Désinscrire un joueur du lieu (ne supprime pas le joueur global)
export async function removePlayerFromVenue(venueId, playerId) {
  if (!venueId || !playerId) return;
  await apiFetch(`/rest/v1/location_players?location_id=eq.${venueId}&player_id=eq.${playerId}`, {
    method: "DELETE"
  });
}

// Mettre à jour la présence d'un joueur dans un lieu
export async function setPlayerPresence(venueId, playerId, present) {
  if (!venueId) throw new Error("venueId requis");
  if (!playerId) throw new Error("playerId requis");

  await apiFetch(
    `/rest/v1/location_players?location_id=eq.${venueId}&player_id=eq.${playerId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ present: !!present })
    }
  );
}
