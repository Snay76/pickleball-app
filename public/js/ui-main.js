import { apiFetch } from "./api.js";
import { listVenues, createVenue, fillVenueSelect, getSelectedVenueId, setSelectedVenueId } from "./venues.js";
import { listPlayersForVenue, createPlayerGlobal, addPlayerToVenue, removePlayerFromVenue } from "./players.js";
import {
  listMatchesForVenueToday,
  createMatchForVenue,
  finishMatchById,
  finishAllMatchesForVenueToday,
} from "./matches.js";

export function bindMainUI(ctx) {
  const { me, log } = ctx;

  // Lieux
  const venueSelect = document.getElementById("venueSelect");
  const addVenueBtn = document.getElementById("addVenueBtn");

  // Joueurs
  const playerNameEl = document.getElementById("playerName");
  const addPlayerBtn = document.getElementById("addPlayerBtn");
  const playersWrap = document.getElementById("playersWrap");
  const playersEmpty = document.getElementById("playersEmpty");

  // Matchs
  const courtEl = document.getElementById("court");
  const statusMatchEl = document.getElementById("statusMatch");
  const matchModeEl = document.getElementById("matchMode");          // 2 ou 4
  const matchFilterEl = document.getElementById("matchFilter");      // today_all | today_inprogress | today_mine
  const suggestTeamsBtn = document.getElementById("suggestTeamsBtn");
  const finishAllTodayBtn = document.getElementById("finishAllTodayBtn");

  const a1El = document.getElementById("a1");
  const a2El = document.getElementById("a2");
  const b1El = document.getElementById("b1");
  const b2El = document.getElementById("b2");
  const createMatchBtn = document.getElementById("createMatchBtn");

  const matchesWrap = document.getElementById("matchesWrap");
  const matchesEmpty = document.getElementById("matchesEmpty");

  // Score modal
  const scoreOverlay = document.getElementById("scoreOverlay");
  const scoreCloseBtn = document.getElementById("scoreCloseBtn");
  const scoreConfirmBtn = document.getElementById("scoreConfirmBtn");
  const scoreNoScoreBtn = document.getElementById("scoreNoScoreBtn");
  const scoreAEl = document.getElementById("scoreA");
  const scoreBEl = document.getElementById("scoreB");
  const finishStatusEl = document.getElementById("finishStatus");
  const scoreMatchInfo = document.getElementById("scoreMatchInfo");
  const scoreStatus = document.getElementById("scoreStatus");

  let venues = [];
  let currentVenueId = "";

  let cachedPlayers = [];
  let cachedMatches = [];       // tous les matchs du jour (lieu)
  let visibleMatches = [];      // après filtre

  // Pour "mes matchs"
  let myPlayerId = null;

  // Pour modal
  let activeMatch = null;

  function esc(s) {
    return String(s || "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function isoStartOfDayLocal(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.toISOString();
  }
  function isoStartOfTomorrowLocal(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() + 1);
    return x.toISOString();
  }

  function initCourtSelect(max = 12) {
    if (!courtEl) return;
    courtEl.innerHTML = "";
    for (let i = 1; i <= max; i++) {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `Terrain ${i}`;
      courtEl.appendChild(o);
    }
  }

  function fillPlayerSelect(sel) {
    if (!sel) return;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "(choisir)";
    sel.appendChild(o0);

    for (const p of cachedPlayers) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.name} (${p.id.slice(0, 8)})`;
      sel.appendChild(o);
    }
  }

  function applyModeUI() {
    const mode = Number(matchModeEl?.value || 4);
    const isSingles = (mode === 2);

    // Afficher/masquer A2/B2
    const a2RowLabel = document.querySelector('label[for="a2"]')?.closest(".col");
    const b2RowLabel = document.querySelector('label[for="b2"]')?.closest(".col");

    if (a2RowLabel) a2RowLabel.classList.toggle("hidden", isSingles);
    if (b2RowLabel) b2RowLabel.classList.toggle("hidden", isSingles);

    // Si simple, on vide a2/b2
    if (isSingles) {
      if (a2El) a2El.value = "";
      if (b2El) b2El.value = "";
    }
  }

  async function refreshVenues() {
    venues = await listVenues();
    const saved = getSelectedVenueId(me?.id);
    currentVenueId =
      saved && venues.some(v => v.id === saved) ? saved : (venues[0]?.id || "");
    setSelectedVenueId(me?.id, currentVenueId);
    fillVenueSelect(venueSelect, venues, currentVenueId);
  }

  async function ensureMyPlayerId() {
    // Sert au filtre "mes matchs". On se base sur profiles.full_name (si dispo)
    myPlayerId = null;
    try{
      const rows = await apiFetch(`/rest/v1/profiles?select=full_name&user_id=eq.${me.id}&limit=1`);
      const fullName = rows?.[0]?.full_name ? String(rows[0].full_name).trim() : "";
      if(!fullName) return;
      // On choisira l’ID après refreshPlayers(), car la liste est filtrée par lieu.
      // On garde le nom en closure.
      ensureMyPlayerId.fullName = fullName;
    }catch(_){
      // ignore
    }
  }

  async function refreshPlayers() {
    playersWrap && (playersWrap.innerHTML = "");

    if (!currentVenueId) {
      playersEmpty && (playersEmpty.textContent = "Choisis un lieu.");
      cachedPlayers = [];
      fillPlayerSelect(a1El); fillPlayerSelect(a2El); fillPlayerSelect(b1El); fillPlayerSelect(b2El);
      return;
    }

    cachedPlayers = await listPlayersForVenue(currentVenueId);
    const fn = ensureMyPlayerId.fullName;
    if(fn){
      const meP = cachedPlayers.find(p => String(p.name).trim() === fn);
      myPlayerId = meP?.id || null;
    }


    if (!cachedPlayers.length) {
      playersEmpty && (playersEmpty.textContent = "(aucun joueur dans ce lieu)");
    } else {
      playersEmpty && (playersEmpty.textContent = "");
      for (const p of cachedPlayers) {
        const row = document.createElement("div");
        row.className = "listItem";

        const left = document.createElement("div");
        left.innerHTML = `<div class="name">${esc(p.name)}</div>
                          <div class="muted" style="font-size:12px">ID: ${esc(p.id)}</div>`;

        const actions = document.createElement("div");

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
            await refreshMatches();
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

  function matchInvolvesPlayer(m, playerId) {
    if (!playerId) return false;
    return [m.a1, m.a2, m.b1, m.b2].filter(Boolean).includes(playerId);
  }

  function applyMatchFilter() {
    const f = matchFilterEl?.value || "today_all";
    const mineId = myPlayerId;

    if (f === "today_inprogress") {
      visibleMatches = cachedMatches.filter(m => (m.status || "") !== "done");
    } else if (f === "today_mine") {
      visibleMatches = cachedMatches.filter(m => matchInvolvesPlayer(m, mineId));
    } else {
      visibleMatches = [...cachedMatches];
    }
  }

  function buildPairSetFromMatches(matches) {
    // pairs = joueurs qui ont été ensemble (équipe)
    const set = new Set();
    for (const m of matches) {
      const a = [m.a1, m.a2].filter(Boolean);
      const b = [m.b1, m.b2].filter(Boolean);

      if (a.length === 2) {
        const k = [a[0], a[1]].sort().join("|");
        set.add(k);
      }
      if (b.length === 2) {
        const k = [b[0], b[1]].sort().join("|");
        set.add(k);
      }
    }
    return set;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function suggestTeams(mode) {
    if (!cachedPlayers.length) return null;

    const usedPairs = buildPairSetFromMatches(cachedMatches);

    if (mode === 2) {
      // simple: 2 joueurs distincts
      const pool = shuffle(cachedPlayers);
      if (pool.length < 2) return null;
      return { a1: pool[0].id, a2: null, b1: pool[1].id, b2: null };
    }

    // double: choisir 4 joueurs et former 2 équipes sans répéter une paire déjà jouée aujourd’hui, si possible
    if (cachedPlayers.length < 4) return null;

    const ids = cachedPlayers.map(p => p.id);

    // essais multiples
    for (let attempt = 0; attempt < 200; attempt++) {
      const pool = shuffle(ids).slice(0, 4);
      const [p1, p2, p3, p4] = pool;

      const pairA = [p1, p2].sort().join("|");
      const pairB = [p3, p4].sort().join("|");

      if (!usedPairs.has(pairA) && !usedPairs.has(pairB)) {
        return { a1: p1, a2: p2, b1: p3, b2: p4 };
      }

      // autre combinaison de pairing dans le 4 (3 possibilités)
      const combos = [
        [[p1, p3], [p2, p4]],
        [[p1, p4], [p2, p3]],
      ];
      for (const [A, B] of combos) {
        const kA = A.slice().sort().join("|");
        const kB = B.slice().sort().join("|");
        if (!usedPairs.has(kA) && !usedPairs.has(kB)) {
          return { a1: A[0], a2: A[1], b1: B[0], b2: B[1] };
        }
      }
    }

    // fallback: on ignore la contrainte si impossible
    const pool = shuffle(ids).slice(0, 4);
    return { a1: pool[0], a2: pool[1], b1: pool[2], b2: pool[3] };
  }

  function byIdName(id) {
    return cachedPlayers.find(p => p.id === id)?.name || "(?)";
  }

  function openScoreModal(match) {
    activeMatch = match;
    scoreStatus.textContent = "…";
    if (finishStatusEl) finishStatusEl.value = "done";
    scoreAEl.value = "";
    scoreBEl.value = "";

    const aTeam = [byIdName(match.a1), byIdName(match.a2)].filter(n => n && n !== "(?)").join(" + ");
    const bTeam = [byIdName(match.b1), byIdName(match.b2)].filter(n => n && n !== "(?)").join(" + ");

    scoreMatchInfo.textContent = `Terrain ${match.court} — A: ${aTeam} • B: ${bTeam}`;

    scoreOverlay.classList.remove("hidden");

    // focus scoreA (clavier num)
    setTimeout(() => scoreAEl?.focus(), 50);
  }

  function closeScoreModal() {
    activeMatch = null;
    scoreOverlay.classList.add("hidden");
  }

  async function refreshMatches() {
    matchesWrap && (matchesWrap.innerHTML = "");

    if (!currentVenueId) {
      matchesEmpty && (matchesEmpty.textContent = "Choisis un lieu.");
      cachedMatches = [];
      visibleMatches = [];
      return;
    }

    const fromIso = isoStartOfDayLocal();
    const toIso = isoStartOfTomorrowLocal();

    cachedMatches = await listMatchesForVenueToday(currentVenueId, fromIso, toIso);

    applyMatchFilter();

    if (!visibleMatches.length) {
      matchesEmpty && (matchesEmpty.textContent = "(aucun match)");
      return;
    }
    matchesEmpty && (matchesEmpty.textContent = "");

    for (const m of visibleMatches.slice(0, 50)) {
      const box = document.createElement("div");
      box.className = "listItem";
      box.style.flexDirection = "column";
      box.style.alignItems = "stretch";

      const aTeam = [byIdName(m.a1), byIdName(m.a2)].filter(Boolean).join(" + ");
      const bTeam = [byIdName(m.b1), byIdName(m.b2)].filter(Boolean).join(" + ");

      const canFinish = (m.status || "") !== "done";

      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <div class="name">Terrain ${esc(m.court)} — ${esc(m.status || "")}</div>
            <div class="muted" style="font-size:12px;margin-top:2px">
              A: ${esc(aTeam)} • B: ${esc(bTeam)}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
            <div class="muted" style="font-size:12px">${esc(new Date(m.created_at).toLocaleString())}</div>
            ${canFinish ? `<button class="miniBtn btnPrimary" data-finish="${esc(m.id)}" type="button">Terminer</button>` : ``}
          </div>
        </div>
      `;

      matchesWrap?.appendChild(box);
    }

    // Wire finish buttons
    matchesWrap?.querySelectorAll("button[data-finish]")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-finish");
        const match = cachedMatches.find(x => x.id === id);
        if (!match) return;
        openScoreModal(match);
      });
    });
  }

  // =======================
  // Events
  // =======================

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
      const player = await createPlayerGlobal(name);
      await addPlayerToVenue(currentVenueId, player.id);
      if (playerNameEl) playerNameEl.value = "";
      await refreshPlayers();
      await refreshMatches();
    } catch (e) {
      log?.("[ADD PLAYER ERROR]\n" + e.message);
      alert("Erreur ajout joueur (voir debug).");
    } finally {
      addPlayerBtn.disabled = false;
    }
  });

  matchModeEl?.addEventListener("change", () => {
    applyModeUI();
  });

  matchFilterEl?.addEventListener("change", async () => {
    applyMatchFilter();
    await refreshMatches();
  });

  suggestTeamsBtn?.addEventListener("click", async () => {
    const mode = Number(matchModeEl?.value || 4);
    const suggestion = suggestTeams(mode);
    if (!suggestion) return alert("Pas assez de joueurs dans ce lieu.");
    a1El.value = suggestion.a1 || "";
    b1El.value = suggestion.b1 || "";
    if (mode === 2) {
      a2El.value = "";
      b2El.value = "";
    } else {
      a2El.value = suggestion.a2 || "";
      b2El.value = suggestion.b2 || "";
    }
  });

  createMatchBtn?.addEventListener("click", async () => {
    if (!currentVenueId) return alert("Choisis un lieu d’abord.");

    const mode = Number(matchModeEl?.value || 4);

    createMatchBtn.disabled = true;
    try {
      const court = Number(courtEl?.value);
      const status = statusMatchEl?.value;

      const a1 = a1El?.value || null;
      const a2 = a2El?.value || null;
      const b1 = b1El?.value || null;
      const b2 = b2El?.value || null;

      if (!Number.isFinite(court) || court <= 0) return alert("Terrain invalide");

      if (mode === 2) {
        // Simple: A1 et B1 requis, et rien d’autre
        if (!a1 || !b1) return alert("A1 et B1 requis (simple).");
        if (a2 || b2) return alert("Simple: pas de A2/B2.");
        await createMatchForVenue(currentVenueId, { court, status: status || "open", a1, a2: null, b1, b2: null });
      } else {
        // Double: 4 joueurs requis
        if (!a1 || !a2 || !b1 || !b2) return alert("A1, A2, B1, B2 requis (double).");
        await createMatchForVenue(currentVenueId, { court, status: status || "open", a1, a2, b1, b2 });
      }

      await refreshMatches();
      alert("Match créé.");
    } catch (e) {
      log?.("[MATCH CREATE ERROR]\n" + e.message);
      alert("Erreur création match (voir debug).");
    } finally {
      createMatchBtn.disabled = false;
    }
  });

  finishAllTodayBtn?.addEventListener("click", async () => {
    if (!currentVenueId) return alert("Choisis un lieu d’abord.");
    if (!confirm("Terminer tous les matchs du jour pour ce lieu, sans scores ?")) return;

    finishAllTodayBtn.disabled = true;
    try {
      const fromIso = isoStartOfDayLocal();
      const toIso = isoStartOfTomorrowLocal();
      const count = await finishAllMatchesForVenueToday(currentVenueId, fromIso, toIso);
      await refreshMatches();
      alert(`OK. Matchs terminés: ${count}`);
    } catch (e) {
      log?.("[FINISH ALL ERROR]\n" + e.message);
      alert("Erreur (voir debug).");
    } finally {
      finishAllTodayBtn.disabled = false;
    }
  });

  // Score modal events
  scoreCloseBtn?.addEventListener("click", closeScoreModal);
  scoreOverlay?.addEventListener("click", (e) => {
    if (e.target === scoreOverlay) closeScoreModal();
  });

  function parseScoreValue(v) {
    const t = String(v ?? "").trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }

  async function confirmFinish(withScore) {
    if (!activeMatch) return;

    const sA = parseScoreValue(scoreAEl.value);
    const sB = parseScoreValue(scoreBEl.value);

    if (withScore) {
      // si un est rempli et pas l’autre => refuse
      const aFilled = (String(scoreAEl.value || "").trim() !== "");
      const bFilled = (String(scoreBEl.value || "").trim() !== "");
      if (aFilled !== bFilled) {
        scoreStatus.textContent = "Entre les 2 scores ou laisse vide pour 'sans score'.";
        return;
      }
      // si vides -> sans score
      if (!aFilled && !bFilled) {
        return await confirmFinish(false);
      }
    }

    scoreConfirmBtn.disabled = true;
    scoreNoScoreBtn.disabled = true;
    scoreStatus.textContent = "Enregistrement…";

    try {
      await finishMatchById(activeMatch.id, {
        status: (finishStatusEl?.value || "done"),
        score_a: withScore ? sA : null,
        score_b: withScore ? sB : null
      });
      scoreStatus.textContent = "OK.";
      closeScoreModal();
      await refreshMatches();
    } catch (e) {
      scoreStatus.textContent = "Erreur:\n" + e.message;
      log?.("[FINISH MATCH ERROR]\n" + e.message);
    } finally {
      scoreConfirmBtn.disabled = false;
      scoreNoScoreBtn.disabled = false;
    }
  }

  scoreConfirmBtn?.addEventListener("click", () => confirmFinish(true));
  scoreNoScoreBtn?.addEventListener("click", () => confirmFinish(false));

  // Enter = confirmer
  [scoreAEl, scoreBEl].forEach(inp => {
    inp?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmFinish(true);
      }
    });
  });

  // Init
  async function initVenuesFlow() {
    initCourtSelect(12);
    applyModeUI();
    await refreshVenues();
    await ensureMyPlayerId();
    await refreshPlayers();
    await refreshMatches();
  }

  return { initVenuesFlow };
}
