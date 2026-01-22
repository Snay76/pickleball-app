import { listVenues, createVenue, fillVenueSelect, getSelectedVenueId, setSelectedVenueId } from "./venues.js";
import { listPlayersForVenue, createPlayerGlobal, addPlayerToVenue, removePlayerFromVenue } from "./players.js";
import { listMatchesForVenue, createMatchForVenue } from "./matches.js";

export function bindMainUI(ctx) {
  // ctx attendu: { me, log }
  const { me, log } = ctx;

  const venueSelect = document.getElementById("venueSelect");
  const addVenueBtn = document.getElementById("addVenueBtn");

  const playerNameEl = document.getElementById("playerName");
  const addPlayerBtn = document.getElementById("addPlayerBtn");
  const playersWrap = document.getElementById("playersWrap");
  const playersEmpty = document.getElementById("playersEmpty");

  const courtEl = document.getElementById("court");
  const statusMatchEl = document.getElementById("statusMatch");
  const a1El = document.getElementById("a1");
  const a2El = document.getElementById("a2");
  const b1El = document.getElementById("b1");
  const b2El = document.getElementById("b2");
  const createMatchBtn = document.getElementById("createMatchBtn");
  const matchesWrap = document.getElementById("matchesWrap");
  const matchesEmpty = document.getElementById("matchesEmpty");

  let venues = [];
  let currentVenueId = "";

  let cachedPlayers = [];
  let cachedMatches = [];

  function esc(s){
    return String(s || "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function initCourtSelect(max=12){
    if(!courtEl) return;
    courtEl.innerHTML = "";
    for(let i=1;i<=max;i++){
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `Terrain ${i}`;
      courtEl.appendChild(o);
    }
  }

  function fillPlayerSelect(sel) {
    if(!sel) return;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "(choisir)";
    sel.appendChild(o0);

    for (const p of cachedPlayers) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.name} (${p.id.slice(0,8)})`;
      sel.appendChild(o);
    }
  }

  async function refreshVenues() {
    venues = await listVenues();
    const saved = getSelectedVenueId(me?.id);
    currentVenueId = saved && venues.some(v => v.id === saved) ? saved : (venues[0]?.id || "");
    setSelectedVenueId(me?.id, currentVenueId);
    fillVenueSelect(venueSelect, venues, currentVenueId);
  }

  async function refreshPlayers() {
    if(playersWrap) playersWrap.innerHTML = "";

    if (!currentVenueId) {
      if(playersEmpty) playersEmpty.textContent = "Choisis un lieu.";
      cachedPlayers = [];
      fillPlayerSelect(a1El); fillPlayerSelect(a2El); fillPlayerSelect(b1El); fillPlayerSelect(b2El);
      return;
    }

    cachedPlayers = await listPlayersForVenue(currentVenueId);

    if (!cachedPlayers.length) {
      if(playersEmpty) playersEmpty.textContent = "(aucun joueur dans ce lieu)";
    } else {
      if(playersEmpty) playersEmpty.textContent = "";
      for (const p of cachedPlayers) {
        const row = document.createElement("div");
        row.className = "listItem";

        const left = document.createElement("div");
        left.innerHTML = `<div class="name">${esc(p.name)}</div><div class="muted" style="font-size:12px">ID: ${esc(p.id)}</div>`;

        const actions = document.createElement("div");

        // Corbeille = retire du lieu (pas delete global)
        const del = document.createElement("button");
        del.className = "miniBtn btnDanger";
        del.innerHTML = "🗑️";
        del.title = "Retirer du lieu";
        del.onclick = async () => {
          if (!confirm(`Retirer "${p.name}" de ce lieu ?`)) return;
          try {
            await removePlayerFromVenue(currentVenueId, p.id);
            log?.(`[VENUE PLAYER REMOVE OK] ${p.name}`);
            await refreshPlayers();
            await refreshMatches(); // car selects
          } catch (e) {
            log?.("[VENUE PLAYER REMOVE ERROR]\n" + e.message);
            alert("Erreur retrait joueur (voir debug).");
          }
        };

        actions.appendChild(del);
        row.appendChild(left);
        row.appendChild(actions);
        playersWrap?.appendChild(row);
      }
    }

    fillPlayerSelect(a1El); fillPlayerSelect(a2El); fillPlayerSelect(b1El); fillPlayerSelect(b2El);
  }

  async function refreshMatches() {
    if(matchesWrap) matchesWrap.innerHTML = "";

    if (!currentVenueId) {
      if(matchesEmpty) matchesEmpty.textContent = "Choisis un lieu.";
      cachedMatches = [];
      return;
    }

    cachedMatches = await listMatchesForVenue(currentVenueId);

    if (!cachedMatches.length) {
      if(matchesEmpty) matchesEmpty.textContent = "(aucun match)";
      return;
    }
    if(matchesEmpty) matchesEmpty.textContent = "";

    const byId = (id) => cachedPlayers.find(p => p.id === id)?.name || "(?)";

    for (const m of cachedMatches.slice(0, 25)) {
      const box = document.createElement("div");
      box.className = "listItem";
      box.style.flexDirection = "column";
      box.style.alignItems = "stretch";

      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <div>
            <div class="name">Terrain ${esc(m.court)} — ${esc(m.status || "")}</div>
            <div class="muted" style="font-size:12px;margin-top:2px">
              A: ${esc(byId(m.a1))} + ${esc(byId(m.a2))} •
              B: ${esc(byId(m.b1))} + ${esc(byId(m.b2))}
            </div>
          </div>
          <div class="muted" style="font-size:12px">${esc(new Date(m.created_at).toLocaleString())}</div>
        </div>
      `;
      matchesWrap?.appendChild(box);
    }
  }

  // Events
  venueSelect?.addEventListener("change", async () => {
    currentVenueId = venueSelect.value || "";
    setSelectedVenueId(me?.id, currentVenueId);
    await refreshPlayers();
    await refreshMatches();
  });

  addVenueBtn?.addEventListener("click", async () => {
    const name = prompt("Nom du lieu (ex: Ste-Élie Débutant-2026) :");
    if (!name) return;
    try {
      const created = await createVenue({ name: name.trim(), created_by: me.id });
      if (!created) return alert("Création échouée.");
      await refreshVenues();
      currentVenueId = created.id;
      setSelectedVenueId(me?.id, currentVenueId);
      fillVenueSelect(venueSelect, venues, currentVenueId);
      await refreshPlayers();
      await refreshMatches();
      alert("Lieu créé.");
    } catch (e) {
      log?.("[VENUE CREATE ERROR]\n" + e.message);
      alert("Erreur création lieu (voir debug).");
    }
  });

  addPlayerBtn?.addEventListener("click", async () => {
    if (!currentVenueId) return alert("Choisis un lieu d’abord.");
    const name = (playerNameEl?.value || "").trim();
    if (!name) return alert("Nom requis");

    addPlayerBtn.disabled = true;
    try {
      const player = await createPlayerGlobal(name);       // joueur global
      await addPlayerToVenue(currentVenueId, player.id);   // inscription lieu
      if(playerNameEl) playerNameEl.value = "";
      await refreshPlayers();
      await refreshMatches();
    } catch (e) {
      log?.("[ADD PLAYER ERROR]\n" + e.message);
      alert("Erreur ajout joueur (voir debug).");
    } finally {
      addPlayerBtn.disabled = false;
    }
  });

  createMatchBtn?.addEventListener("click", async () => {
    if (!currentVenueId) return alert("Choisis un lieu d’abord.");
    createMatchBtn.disabled = true;
    try {
      const court = Number(courtEl?.value);
      const status = statusMatchEl?.value;

      const a1 = a1El?.value || null;
      const a2 = a2El?.value || null;
      const b1 = b1El?.value || null;
      const b2 = b2El?.value || null;

      if (!Number.isFinite(court) || court <= 0) return alert("Terrain invalide");
      if (!a1 || !a2 || !b1 || !b2) return alert("A1, A2, B1, B2 requis.");

      await createMatchForVenue(currentVenueId, { court, status, a1, a2, b1, b2 });
      await refreshMatches();
      alert("Match créé.");
    } catch (e) {
      log?.("[MATCH CREATE ERROR]\n" + e.message);
      alert("Erreur création match (voir debug).");
    } finally {
      createMatchBtn.disabled = false;
    }
  });

  // Init
  async function initVenuesFlow() {
    initCourtSelect(12);
    await refreshVenues();
    await refreshPlayers();
    await refreshMatches();
  }

  return { initVenuesFlow };
}
