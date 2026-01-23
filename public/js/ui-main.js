// public/js/ui-main.js
import { apiFetch } from "./api.js";
import {
  listVenues,
  createVenue,
  fillVenueSelect,
  getSelectedVenueId,
  setSelectedVenueId,
} from "./venues.js";
import {
  listPlayersForVenue,
  createPlayerGlobal,
  addPlayerToVenue,
  removePlayerFromVenue,
  // setPlayerPresentInVenue, // optionnel si tu l’ajoutes dans players.js
} from "./players.js";
import {
  listMatchesForVenueToday,
  createMatchForVenue,
  finishMatchById,
  finishAllMatchesForVenueToday,
} from "./matches.js";

/**
 * bindMainUI(ctx)
 * ctx attendu: { me, profile, log }
 */
export function bindMainUI(ctx) {
  const { me, profile, log } = ctx;

  // =========================
  // DOM - Lieux
  // =========================
  const venueSelect = document.getElementById("venueSelect");
  const venueBar = document.getElementById("venueBar");
  const venueBarValue = document.getElementById("venueBarValue");
  const addVenueBtn = document.getElementById("addVenueBtn"); // optionnel

  // =========================
  // DOM - Joueurs
  // =========================
  const playerNameEl = document.getElementById("playerName");
  const addPlayerBtn = document.getElementById("addPlayerBtn");
  const playersWrap = document.getElementById("playersWrap");
  const playersEmpty = document.getElementById("playersEmpty");
  const addVenueBtn2 = document.getElementById("addVenueBtn2"); // bouton "Ajouter lieu" dans section joueurs

  const HAS_PRESENCE_TOGGLE = true; // nécessite colonne location_players.present

  // =========================
  // DOM - Matchs
  // =========================
  const courtEl = document.getElementById("court");
  const matchModeEl = document.getElementById("matchMode"); // 2 ou 4
  const matchFilterEl = document.getElementById("matchFilter"); // today_all | today_inprogress | today_mine
  const suggestTeamsBtn = document.getElementById("suggestTeamsBtn");
  const finishAllTodayBtn = document.getElementById("finishAllTodayBtn");

  const a1El = document.getElementById("a1");
  const a2El = document.getElementById("a2");
  const b1El = document.getElementById("b1");
  const b2El = document.getElementById("b2");
  const createMatchBtn = document.getElementById("createMatchBtn");

  const matchesWrap = document.getElementById("matchesWrap");
  const matchesEmpty = document.getElementById("matchesEmpty");

  // =========================
  // DOM - Score Modal
  // =========================
  const scoreOverlay = document.getElementById("scoreOverlay");
  const scoreCloseBtn = document.getElementById("scoreCloseBtn");
  const scoreConfirmBtn = document.getElementById("scoreConfirmBtn");
  const scoreNoScoreBtn = document.getElementById("scoreNoScoreBtn");
  const scoreAEl = document.getElementById("scoreA");
  const scoreBEl = document.getElementById("scoreB");
  const finishStatusEl = document.getElementById("finishStatus");
  const scoreMatchInfo = document.getElementById("scoreMatchInfo");
  const scoreStatus = document.getElementById("scoreStatus");

  // =========================
  // STATE
  // =========================
  let venues = [];
  let currentVenueId = "";
  let currentVenueRole = "player"; // player | organiser | admin

  const isAdminFull = profile?.level === "admin_full";

  let cachedPlayers = []; // joueurs du lieu
  let cachedMatches = []; // matchs du jour (lieu)
  let visibleMatches = []; // matches après filtre

  let myPlayerId = null; // utilisé par filtre "mes matchs"
  let activeMatch = null; // modal

  // =========================
  // Utils
  // =========================
  function esc(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function getMyVenueRole(venueId) {
    if (!venueId) return "player";
    if (isAdminFull) return "admin";
    try {
      const rows = await apiFetch(
        `/rest/v1/location_members?select=role&location_id=eq.${venueId}&user_id=eq.${me.id}&limit=1`
      );
      return rows?.[0]?.role || "player";
    } catch {
      return "player";
    }
  }

  function setDebugVisibility() {
    const debugTabBtn = document.querySelector('.tab[data-tab="tabDebug"]');
    const debugTab = document.getElementById("tabDebug");
    const canDebug = isAdminFull || currentVenueRole === "admin";
    if (debugTabBtn) debugTabBtn.style.display = canDebug ? "" : "none";
    if (debugTab) debugTab.style.display = canDebug ? "" : "none";
  }

  function updateVenueBar() {
    if (!venueBar || !venueBarValue) return;
    const v = venues.find((x) => x.id === currentVenueId);
    if (!v) {
      venueBar.classList.add("hidden");
      venueBarValue.textContent = "—";
      return;
    }
    venueBar.classList.remove("hidden");
    venueBarValue.textContent = v.name || "—";
  }

  function activePlayerSet() {
    const s = new Set();
    for (const m of cachedMatches || []) {
      if (m.status && m.status !== "done") {
        [m.a1, m.a2, m.b1, m.b2].filter(Boolean).forEach((id) => s.add(id));
      }
    }
    return s;
  }

  function isCourtBusy(court) {
    return (cachedMatches || []).some(
      (m) =>
        (m.status && m.status !== "done") &&
        String(m.court) === String(court)
    );
  }

  function buildOpponentSetFromMatches(matches) {
    const opp = new Set();
    for (const m of matches || []) {
      const A = [m.a1, m.a2].filter(Boolean);
      const B = [m.b1, m.b2].filter(Boolean);
      for (const a of A) {
        for (const b of B) {
          opp.add([a, b].sort().join("|"));
        }
      }
    }
    return opp;
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

  function formatDuration(startIso, endIso) {
    if (!startIso || !endIso) return "";
    const a = new Date(startIso).getTime();
    const b = new Date(endIso).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "";
    const sec = Math.round((b - a) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h > 0) return `${h}h ${String(mm).padStart(2, "0")}m`;
    return `${mm}m ${String(s).padStart(2, "0")}s`;
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

    const busy = activePlayerSet();
    const pool = cachedPlayers.filter((p) => p.present && !busy.has(p.id));

    for (const p of pool) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.name} (${String(p.id).slice(0, 8)})`;
      sel.appendChild(o);
    }
  }

  function applyModeUI() {
    const mode = Number(matchModeEl?.value || 4);
    const isSingles = mode === 2;

    const a2Col = document.querySelector('label[for="a2"]')?.closest(".col");
    const b2Col = document.querySelector('label[for="b2"]')?.closest(".col");
    if (a2Col) a2Col.classList.toggle("hidden", isSingles);
    if (b2Col) b2Col.classList.toggle("hidden", isSingles);

    if (isSingles) {
      if (a2El) a2El.value = "";
      if (b2El) b2El.value = "";
    }
  }

  function byIdName(id) {
    return cachedPlayers.find((p) => p.id === id)?.name || "(?)";
  }

  // =========================
  // Venues
  // =========================
  async function refreshVenues() {
    venues = await listVenues();
    const saved = getSelectedVenueId(me?.id);

    currentVenueId =
      saved && venues.some((v) => v.id === saved) ? saved : venues[0]?.id || "";

    setSelectedVenueId(me?.id, currentVenueId);
    fillVenueSelect(venueSelect, venues, currentVenueId);
  }

  async function createVenueFlow() {
    const name = prompt("Nom du lieu (ex: Ste-Élie Débutant-2026) :");
    if (!name) return;

    try {
      const created = await createVenue({ name: name.trim(), created_by: me.id });
      if (!created?.id) return alert("Création échouée.");

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
  }

  // =========================
  // My player id (pour "mes matchs")
  // =========================
  async function ensureMyPlayerId() {
    myPlayerId = null;
    try {
      const rows = await apiFetch(
        `/rest/v1/profiles?select=full_name&user_id=eq.${me.id}&limit=1`
      );
      const fullName = rows?.[0]?.full_name ? String(rows[0].full_name).trim() : "";
      if (!fullName) return;
      ensureMyPlayerId.fullName = fullName;
    } catch {
      // ignore
    }
  }

  // =========================
  // Players
  // =========================
  async function refreshPlayers() {
    if (playersWrap) playersWrap.innerHTML = "";

    if (!currentVenueId) {
      if (playersEmpty) playersEmpty.textContent = "Choisis un lieu.";
      cachedPlayers = [];
      fillPlayerSelect(a1El);
      fillPlayerSelect(a2El);
      fillPlayerSelect(b1El);
      fillPlayerSelect(b2El);
      return;
    }

    cachedPlayers = await listPlayersForVenue(currentVenueId);

    const fn = ensureMyPlayerId.fullName;
    if (fn) {
      const meP = cachedPlayers.find((p) => String(p.name).trim() === fn);
      myPlayerId = meP?.id || null;
    }

    if (!cachedPlayers.length) {
      if (playersEmpty) playersEmpty.textContent = "(aucun joueur dans ce lieu)";
    } else {
      if (playersEmpty) playersEmpty.textContent = "";

      for (const p of cachedPlayers) {
        const row = document.createElement("div");
        row.className = "listItem";

        const left = document.createElement("div");
        left.innerHTML = `
          <div class="name">${esc(p.name)}</div>
          <div class="small">ID: ${esc(p.id)}</div>
        `;

        const actions = document.createElement("div");
        actions.className = "inline";

        if (HAS_PRESENCE_TOGGLE) {
          const wrap = document.createElement("label");
          wrap.className = "switch";
          wrap.title = "Présent aujourd’hui";

          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = !!p.present;

          input.addEventListener("change", async () => {
            try {
              await apiFetch(
                `/rest/v1/location_players?location_id=eq.${currentVenueId}&player_id=eq.${p.id}`,
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Prefer: "return=minimal",
                  },
                  body: JSON.stringify({ present: !!input.checked }),
                }
              );
            } catch (e) {
              input.checked = !input.checked;
              log?.("[PRESENT TOGGLE ERROR]\n" + e.message);
              alert("Erreur présence (RLS/colonne manquante).");
            }
          });

          const slider = document.createElement("span");
          slider.className = "slider";

          wrap.appendChild(input);
          wrap.appendChild(slider);
          actions.appendChild(wrap);
        }

        const del = document.createElement("button");
        del.className = "miniBtn btnDanger iconOnly";
        del.innerHTML = "🗑️";
        del.title = "Retirer du lieu";
        del.onclick = async () => {
          if (!confirm(`Retirer "${p.name}" de ce lieu ?`)) return;
          try {
            await removePlayerFromVenue(currentVenueId, p.id);
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

    fillPlayerSelect(a1El);
    fillPlayerSelect(a2El);
    fillPlayerSelect(b1El);
    fillPlayerSelect(b2El);
  }

  // =========================
  // Match filter
  // =========================
  function matchInvolvesPlayer(m, playerId) {
    if (!playerId) return false;
    return [m.a1, m.a2, m.b1, m.b2].filter(Boolean).includes(playerId);
  }

  function applyMatchFilter() {
    const f = matchFilterEl?.value || "today_all";
    if (f === "today_inprogress") {
      visibleMatches = cachedMatches.filter((m) => (m.status || "") !== "done");
    } else if (f === "today_mine") {
      visibleMatches = cachedMatches.filter((m) => matchInvolvesPlayer(m, myPlayerId));
    } else {
      visibleMatches = [...cachedMatches];
    }
  }

  // =========================
  // Suggest teams without repetition (same day)
  // =========================
  function buildPairSetFromMatches(matches) {
    const set = new Set();
    for (const m of matches) {
      const a = [m.a1, m.a2].filter(Boolean);
      const b = [m.b1, m.b2].filter(Boolean);
      if (a.length === 2) set.add(a.slice().sort().join("|"));
      if (b.length === 2) set.add(b.slice().sort().join("|"));
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

    const busy = activePlayerSet();
    const poolPlayers = cachedPlayers.filter((p) => p.present && !busy.has(p.id));

    if (mode === 2) {
      const pool = shuffle(poolPlayers.map((p) => p.id));
      if (pool.length < 2) return null;
      return { a1: pool[0], a2: null, b1: pool[1], b2: null };
    }

    if (poolPlayers.length < 4) return null;

    const ids = poolPlayers.map((p) => p.id);
    const usedPairs = buildPairSetFromMatches(cachedMatches);
    const usedOpp = buildOpponentSetFromMatches(cachedMatches);

    let best = null;
    let bestCost = Infinity;

    for (let attempt = 0; attempt < 400; attempt++) {
      const pick = shuffle(ids).slice(0, 4);
      const [p1, p2, p3, p4] = pick;

      const candidates = [
        { a: [p1, p2], b: [p3, p4] },
        { a: [p1, p3], b: [p2, p4] },
        { a: [p1, p4], b: [p2, p3] },
      ];

      for (const c of candidates) {
        const a = c.a;
        const b = c.b;
        const pairA = a.slice().sort().join("|");
        const pairB = b.slice().sort().join("|");

        let cost = 0;
        if (usedPairs.has(pairA)) cost += 10;
        if (usedPairs.has(pairB)) cost += 10;

        for (const x of a) {
          for (const y of b) {
            const k = [x, y].sort().join("|");
            if (usedOpp.has(k)) cost += 3;
          }
        }

        if (cost === 0) return { a1: a[0], a2: a[1], b1: b[0], b2: b[1] };

        if (cost < bestCost) {
          bestCost = cost;
          best = { a1: a[0], a2: a[1], b1: b[0], b2: b[1] };
        }
      }
    }

    return best;
  }

  // =========================
  // Score modal
  // =========================
  function openScoreModal(match) {
    activeMatch = match;

    if (scoreStatus) scoreStatus.textContent = "…";
    if (finishStatusEl) finishStatusEl.value = "done";
    if (scoreAEl) scoreAEl.value = "";
    if (scoreBEl) scoreBEl.value = "";

    const aTeam = [byIdName(match.a1), byIdName(match.a2)]
      .filter((n) => n && n !== "(?)")
      .join(" + ");
    const bTeam = [byIdName(match.b1), byIdName(match.b2)]
      .filter((n) => n && n !== "(?)")
      .join(" + ");

    if (scoreMatchInfo) {
      scoreMatchInfo.textContent = `Terrain ${match.court} — A: ${aTeam} • B: ${bTeam}`;
    }

    scoreOverlay?.classList.remove("hidden");
    setTimeout(() => scoreAEl?.focus(), 50);
  }

  function closeScoreModal() {
    activeMatch = null;
    scoreOverlay?.classList.add("hidden");
  }

  function parseScoreValue(v) {
    const t = String(v ?? "").trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }

  async function confirmFinish(withScore) {
    if (!activeMatch) return;

    const aRaw = String(scoreAEl?.value ?? "").trim();
    const bRaw = String(scoreBEl?.value ?? "").trim();

    if (withScore) {
      const aFilled = aRaw !== "";
      const bFilled = bRaw !== "";
      if (aFilled !== bFilled) {
        if (scoreStatus) scoreStatus.textContent = "Entre les 2 scores ou laisse vide pour 'sans score'.";
        return;
      }
      if (!aFilled && !bFilled) return confirmFinish(false);
    }

    const sA = parseScoreValue(aRaw);
    const sB = parseScoreValue(bRaw);

    if (scoreConfirmBtn) scoreConfirmBtn.disabled = true;
    if (scoreNoScoreBtn) scoreNoScoreBtn.disabled = true;
    if (scoreStatus) scoreStatus.textContent = "Enregistrement…";

    try {
      await finishMatchById(activeMatch.id, {
        status: "done",
        ended_by_user_id: me.id,
        score_a: withScore ? sA : null,
        score_b: withScore ? sB : null,
      });

      closeScoreModal();
      await refreshMatches();
    } catch (e) {
      if (scoreStatus) scoreStatus.textContent = "Erreur:\n" + e.message;
      log?.("[FINISH MATCH ERROR]\n" + e.message);
    } finally {
      if (scoreConfirmBtn) scoreConfirmBtn.disabled = false;
      if (scoreNoScoreBtn) scoreNoScoreBtn.disabled = false;
    }
  }

  // =========================
  // Matches
  // =========================
  async function refreshMatches() {
    if (matchesWrap) matchesWrap.innerHTML = "";

    if (!currentVenueId) {
      if (matchesEmpty) matchesEmpty.textContent = "Choisis un lieu.";
      cachedMatches = [];
      visibleMatches = [];
      return;
    }

    const fromIso = isoStartOfDayLocal();
    const toIso = isoStartOfTomorrowLocal();

    cachedMatches = await listMatchesForVenueToday(currentVenueId, fromIso, toIso);

    applyMatchFilter();

    if (!visibleMatches.length) {
      if (matchesEmpty) matchesEmpty.textContent = "(aucun match)";
      return;
    }
    if (matchesEmpty) matchesEmpty.textContent = "";

    for (const m of visibleMatches.slice(0, 60)) {
      const aTeam = [byIdName(m.a1), byIdName(m.a2)].filter(Boolean).join(" + ");
      const bTeam = [byIdName(m.b1), byIdName(m.b2)].filter(Boolean).join(" + ");

      const canFinish = (m.status || "") !== "done";
      const venueName = venues.find((v) => v.id === currentVenueId)?.name || "";
      const dur = (m.status === "done" && m.ended_at) ? formatDuration(m.created_at, m.ended_at) : "";
      const score = (m.score_a !== null && m.score_a !== undefined && m.score_b !== null && m.score_b !== undefined)
        ? `${m.score_a}-${m.score_b}`
        : "";

      const box = document.createElement("div");
      box.className = "listItem matchCard";

      box.innerHTML = `
        <div class="matchTop">
          <div>
            <div class="name">Lieu ${esc(venueName)} • Terrain ${esc(m.court)} — ${esc(m.status || "")}</div>
            <div class="muted" style="font-size:12px;margin-top:2px">
              A: ${esc(aTeam)} • B: ${esc(bTeam)}
              ${score ? ` • Score: ${esc(score)}` : ``}
              ${dur ? ` • Durée: ${esc(dur)}` : ``}
            </div>
          </div>
          <div class="inline" style="justify-content:flex-end;">
            <div class="muted" style="font-size:12px">${esc(new Date(m.created_at).toLocaleString())}</div>
            ${canFinish ? `<button class="miniBtn btnPrimary" data-finish="${esc(m.id)}" type="button">Terminer</button>` : ``}
          </div>
        </div>
      `;

      matchesWrap?.appendChild(box);
    }

    matchesWrap?.querySelectorAll("button[data-finish]")?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-finish");
        const match = cachedMatches.find((x) => x.id === id);
        if (!match) return;
        openScoreModal(match);
      });
    });
  }

  // =========================
  // Events wiring
  // =========================
  venueSelect?.addEventListener("change", async () => {
    currentVenueId = venueSelect.value || "";
    setSelectedVenueId(me?.id, currentVenueId);
    currentVenueRole = await getMyVenueRole(currentVenueId);
    updateVenueBar();
    setDebugVisibility();
    await refreshPlayers();
    await refreshMatches();
  });

  addVenueBtn?.addEventListener("click", createVenueFlow);
  addVenueBtn2?.addEventListener("click", createVenueFlow);

  addPlayerBtn?.addEventListener("click", async () => {
    if (!currentVenueId) return alert("Choisis un lieu d’abord.");

    const name = (playerNameEl?.value || "").trim();
    if (!name) return alert("Nom requis");

    addPlayerBtn.disabled = true;
    try {
      const player = await createPlayerGlobal(name);
      if (!player?.id) throw new Error("createPlayerGlobal() n’a rien retourné.");
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

  matchModeEl?.addEventListener("change", applyModeUI);

  matchFilterEl?.addEventListener("change", async () => {
    applyMatchFilter();
    await refreshMatches();
  });

  suggestTeamsBtn?.addEventListener("click", () => {
    const mode = Number(matchModeEl?.value || 4);
    const suggestion = suggestTeams(mode);
    if (!suggestion) return alert("Pas assez de joueurs dans ce lieu.");

    if (a1El) a1El.value = suggestion.a1 || "";
    if (b1El) b1El.value = suggestion.b1 || "";

    if (mode === 2) {
      if (a2El) a2El.value = "";
      if (b2El) b2El.value = "";
    } else {
      if (a2El) a2El.value = suggestion.a2 || "";
      if (b2El) b2El.value = suggestion.b2 || "";
    }
  });

  createMatchBtn?.addEventListener("click", async () => {
    if (!currentVenueId) return alert("Choisis un lieu d’abord.");

    const mode = Number(matchModeEl?.value || 4);
    createMatchBtn.disabled = true;

    try {
      const court = Number(courtEl?.value);

      const a1 = a1El?.value || null;
      const a2 = a2El?.value || null;
      const b1 = b1El?.value || null;
      const b2 = b2El?.value || null;

      if (!Number.isFinite(court) || court <= 0) return alert("Terrain invalide");
      if (isCourtBusy(court)) return alert("Ce terrain a déjà un match en cours.");

      const busy = activePlayerSet();
      const present = new Set(cachedPlayers.filter((p) => p.present).map((p) => p.id));

      function assertPlayerOk(pid) {
        if (!pid) return true;
        if (!present.has(pid)) throw new Error("Un joueur absent ne peut pas être sélectionné.");
        if (busy.has(pid)) throw new Error("Un joueur est déjà dans un match en cours.");
        return true;
      }

      if (mode === 2) {
        if (!a1 || !b1) return alert("A1 et B1 requis (simple).");
        if (a2 || b2) return alert("Simple: pas de A2/B2.");
        if (a1 === b1) return alert("Un joueur ne peut pas jouer contre lui-même.");

        assertPlayerOk(a1);
        assertPlayerOk(b1);

        await createMatchForVenue(currentVenueId, {
          court,
          status: "in_progress",
          a1,
          a2: null,
          b1,
          b2: null,
        });
      } else {
        if (!a1 || !a2 || !b1 || !b2) return alert("A1, A2, B1, B2 requis (double).");

        const ids = [a1, a2, b1, b2];
        const uniq = new Set(ids);
        if (uniq.size !== ids.length) return alert("Un joueur ne peut pas être ajouté deux fois.");

        ids.forEach(assertPlayerOk);

        await createMatchForVenue(currentVenueId, {
          court,
          status: "in_progress",
          a1,
          a2,
          b1,
          b2,
        });
      }

      await refreshMatches();
      alert("Match créé.");
    } catch (e) {
      alert(e?.message || "Erreur création match.");
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

  // Modal events
  scoreCloseBtn?.addEventListener("click", closeScoreModal);
  scoreOverlay?.addEventListener("click", (e) => {
    if (e.target === scoreOverlay) closeScoreModal();
  });
  scoreConfirmBtn?.addEventListener("click", () => confirmFinish(true));
  scoreNoScoreBtn?.addEventListener("click", () => confirmFinish(false));

  [scoreAEl, scoreBEl].forEach((inp) => {
    inp?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmFinish(true);
      }
    });
  });

  // =========================
  // Init
  // =========================
  async function initVenuesFlow() {
    initCourtSelect(12);
    applyModeUI();

    await refreshVenues();
    currentVenueRole = await getMyVenueRole(currentVenueId);
    updateVenueBar();
    setDebugVisibility();
    await ensureMyPlayerId();
    await refreshPlayers();
    await refreshMatches();
  }

  return { initVenuesFlow };
}
