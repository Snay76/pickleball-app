import { APP_VERSION, LS_VENUE_ID } from "./config.js";
import { escapeHtml } from "./api.js";
import { parseHash, saveTokens, refreshSessionIfNeeded, hasSession, sendMagicLink, loadUser, clearTokens } from "./auth.js";
import { listVenues, ensureVenueByName, getSelectedVenueId, setSelectedVenueId } from "./venues.js";
import { loadPlayersByVenue, addPlayer, deletePlayer } from "./players.js";
import { loadMatchesForToday, createMatch, endMatch, abandonMatch, finishAllOpenMatches } from "./matches.js";

// DOM
const versionText = document.getElementById("versionText");
const authMini = document.getElementById("authMini");
const authDot = document.getElementById("authDot");
const authEmail = document.getElementById("authEmail");

const loginCard = document.getElementById("loginCard");
const appCard = document.getElementById("appCard");
const emailEl = document.getElementById("email");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const venueSelect = document.getElementById("venueSelect");
const reloadBtn = document.getElementById("reloadBtn");

const menuBtns = Array.from(document.querySelectorAll(".menuBtn"));
const viewAdd = document.getElementById("view_addPlayer");
const viewList = document.getElementById("view_listPlayers");
const viewMatches = document.getElementById("view_matches");

const playerNameEl = document.getElementById("playerName");
const addPlayerBtn = document.getElementById("addPlayerBtn");
const playersWrap = document.getElementById("playersWrap");
const playersEmpty = document.getElementById("playersEmpty");

const courtEl = document.getElementById("court");
const a1El = document.getElementById("a1");
const a2El = document.getElementById("a2");
const b1El = document.getElementById("b1");
const b2El = document.getElementById("b2");
const createMatchBtn = document.getElementById("createMatchBtn");
const finishAllBtn = document.getElementById("finishAllBtn");
const matchesWrap = document.getElementById("matchesWrap");
const matchesEmpty = document.getElementById("matchesEmpty");
const debugEl = document.getElementById("debug");

let me = null;
let cachedPlayers = [];
let cachedMatches = [];

function log(msg){
  debugEl.textContent = (debugEl.textContent ? debugEl.textContent + "\n" : "") + msg;
}

function setAuthUI(isAuthed, email){
  authDot.className = "dot" + (isAuthed ? " ok" : "");
  authEmail.textContent = isAuthed ? (email || "(connecté)") : "(non connecté)";
}

function showLogin(msg){
  loginCard.classList.remove("hidden");
  appCard.classList.add("hidden");
  loginStatus.textContent = msg || "Prêt.";
  setAuthUI(false, "");
}

function showApp(){
  loginCard.classList.add("hidden");
  appCard.classList.remove("hidden");
}

function switchView(view){
  const isAdd = view === "addPlayer";
  const isList = view === "listPlayers";
  const isMatches = view === "allMatches" || view === "myMatches";

  viewAdd.classList.toggle("hidden", !isAdd);
  viewList.classList.toggle("hidden", !isList);
  viewMatches.classList.toggle("hidden", !isMatches);

  menuBtns.forEach(b => b.classList.toggle("active", b.dataset.view === view));

  // On utilise la même vue matchs, mais on filtre ensuite
  viewMatches.dataset.mode = view; // "allMatches" | "myMatches"
  if(isMatches) renderMatches();
}

function initCourts(max=12){
  courtEl.innerHTML = "";
  for(let i=1;i<=max;i++){
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = `Terrain ${i}`;
    courtEl.appendChild(o);
  }
}

function fillPlayerSelect(sel){
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "(choisir)";
  sel.appendChild(opt0);

  for(const p of cachedPlayers){
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
}

async function refreshVenues(){
  // Si tu veux créer un lieu à la volée, tu peux le faire en DB.
  // Ici: on affiche tous les lieux existants, et si aucun => on en crée un exemple.
  let venues = [];
  try{
    venues = await listVenues();
  }catch(e){
    throw new Error("La table venues n'existe pas ou RLS bloque. Applique le SQL.");
  }

  if(!venues.length){
    const demo = await ensureVenueByName("Ste-Élie Débutant-2026");
    venues = demo ? [demo] : [];
  }

  venueSelect.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "(sélectionner un lieu)";
  venueSelect.appendChild(opt0);

  for(const v of venues){
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    venueSelect.appendChild(o);
  }

  const saved = getSelectedVenueId();
  if(saved && venues.some(v => v.id === saved)){
    venueSelect.value = saved;
  }
}

async function refreshPlayers(){
  const venueId = getSelectedVenueId();
  if(!venueId){
    cachedPlayers = [];
    playersWrap.innerHTML = "";
    playersEmpty.textContent = "(choisis un lieu)";
    fillPlayerSelect(a1El); fillPlayerSelect(a2El); fillPlayerSelect(b1El); fillPlayerSelect(b2El);
    return;
  }

  cachedPlayers = await loadPlayersByVenue(venueId);

  playersWrap.innerHTML = "";
  if(!cachedPlayers.length){
    playersEmpty.textContent = "(aucun joueur)";
  }else{
    playersEmpty.textContent = "";
    for(const p of cachedPlayers){
      const row = document.createElement("div");
      row.className = "listItem";

      const left = document.createElement("div");
      left.innerHTML = `
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="small">ID: ${escapeHtml(p.id)}</div>
      `;

      const actions = document.createElement("div");

      const del = document.createElement("button");
      del.className = "miniBtn btnDanger iconOnly";
      del.type = "button";
      del.title = "Supprimer";
      del.innerHTML = "🗑️";
      del.onclick = async () => {
        if(!confirm(`Supprimer "${p.name}" ?\nID: ${p.id}`)) return;
        try{
          await deletePlayer(p.id);
          log(`[PLAYER DELETE OK] ${p.name}`);
          await refreshAll();
        }catch(e){
          log("[PLAYER DELETE ERROR]\n" + e.message);
          alert("Suppression refusée. Probable: joueur utilisé ailleurs (clé étrangère).");
        }
      };

      actions.appendChild(del);
      row.appendChild(left);
      row.appendChild(actions);
      playersWrap.appendChild(row);
    }
  }

  fillPlayerSelect(a1El); fillPlayerSelect(a2El); fillPlayerSelect(b1El); fillPlayerSelect(b2El);
}

async function refreshMatches(){
  const venueId = getSelectedVenueId();
  if(!venueId){
    cachedMatches = [];
    matchesWrap.innerHTML = "";
    matchesEmpty.textContent = "(choisis un lieu)";
    return;
  }
  cachedMatches = await loadMatchesForToday({ venueId });
}

function playerNameById(id){
  if(!id) return "";
  return cachedPlayers.find(p => p.id === id)?.name || "(?)";
}

function matchBadge(m){
  const r = m.end_reason;
  if(m.status === "done" && r === "abandoned") return `<span class="badge abandoned">abandoned</span>`;
  if(m.status === "done") return `<span class="badge done">done</span>`;
  if(m.status === "locked") return `<span class="badge locked">locked</span>`;
  return `<span class="badge open">open</span>`;
}

function isInProgress(m){
  return m.status === "open" || m.status === "locked";
}

function renderMatches(){
  const mode = viewMatches.dataset.mode || "allMatches"; // allMatches | myMatches
  const myId = me?.id;

  let rows = cachedMatches.slice();
  if(mode === "myMatches" && myId){
    rows = rows.filter(m => m.created_by === myId);
  }

  matchesWrap.innerHTML = "";
  if(!rows.length){
    matchesEmpty.textContent = "(aucun match aujourd’hui)";
    return;
  }
  matchesEmpty.textContent = "";

  for(const m of rows){
    const box = document.createElement("div");
    box.className = "listItem matchCard";

    const top = document.createElement("div");
    top.className = "matchTop";

    const left = document.createElement("div");
    const teamA = `${escapeHtml(playerNameById(m.a1))}${m.a2 ? " + " + escapeHtml(playerNameById(m.a2)) : ""}`;
    const teamB = `${escapeHtml(playerNameById(m.b1))}${m.b2 ? " + " + escapeHtml(playerNameById(m.b2)) : ""}`;

    const scoreTxt = (m.score_a != null && m.score_b != null) ? `Score: ${m.score_a} - ${m.score_b}` : "";
    left.innerHTML = `
      <div class="inline">
        <div class="name">Terrain ${escapeHtml(m.court)}</div>
        ${matchBadge(m)}
      </div>
      <div class="muted" style="font-size:12px;margin-top:6px">
        A: ${teamA}<br/>
        B: ${teamB}
        ${scoreTxt ? `<div style="margin-top:6px">${escapeHtml(scoreTxt)}</div>` : ""}
      </div>
    `;

    const right = document.createElement("div");
    right.className = "inline";

    if(isInProgress(m)){
      const endBtn = document.createElement("button");
      endBtn.className = "miniBtn btnPrimary";
      endBtn.type = "button";
      endBtn.textContent = "Terminer";
      endBtn.onclick = async () => {
        const sa = prompt("Score équipe A (nombre). Laisse vide pour annuler.");
        if(sa === null) return;
        const sb = prompt("Score équipe B (nombre).");
        if(sb === null) return;

        const a = Number(sa);
        const b = Number(sb);
        if(!Number.isFinite(a) || !Number.isFinite(b)) return alert("Score invalide.");

        try{
          await endMatch({ id: m.id, end_reason:"done", score_a:a, score_b:b });
          await refreshAll();
        }catch(e){
          log("[END MATCH ERROR]\n" + e.message);
          alert("Erreur fin de match (voir debug).");
        }
      };

      const abandBtn = document.createElement("button");
      abandBtn.className = "miniBtn btnDanger";
      abandBtn.type = "button";
      abandBtn.textContent = "Abandon";
      abandBtn.onclick = async () => {
        if(!confirm("Marquer ce match comme abandonné ?")) return;
        try{
          await abandonMatch({ id: m.id });
          await refreshAll();
        }catch(e){
          log("[ABANDON MATCH ERROR]\n" + e.message);
          alert("Erreur abandon (voir debug).");
        }
      };

      right.appendChild(endBtn);
      right.appendChild(abandBtn);
    }else{
      const info = document.createElement("div");
      info.className = "badge";
      info.textContent = "Terminé";
      right.appendChild(info);
    }

    top.appendChild(left);
    top.appendChild(right);
    box.appendChild(top);
    matchesWrap.appendChild(box);
  }
}

async function refreshAll(){
  await refreshVenues();
  await refreshPlayers();
  await refreshMatches();
  renderMatches();
}

function requireVenueOrStop(){
  const venueId = getSelectedVenueId();
  if(!venueId){
    alert("Sélectionne un lieu.");
    return null;
  }
  return venueId;
}

// Events
authMini.addEventListener("click", () => {
  // page compte séparée
  window.location.href = "account.html";
});

loginBtn.addEventListener("click", async () => {
  const email = (emailEl.value || "").trim();
  if(!email) return alert("Courriel requis");
  loginBtn.disabled = true;
  loginStatus.textContent = "Envoi du lien…";
  try{
    await sendMagicLink(email);
    loginStatus.textContent = "Lien envoyé. Vérifie ton courriel.";
  }catch(e){
    loginStatus.textContent = "Erreur: " + e.message;
  }finally{
    loginBtn.disabled = false;
  }
});

venueSelect.addEventListener("change", async () => {
  setSelectedVenueId(venueSelect.value || "");
  await refreshAll();
});

reloadBtn.addEventListener("click", async () => {
  try{
    await refreshAll();
    alert("OK");
  }catch(e){
    log("[REFRESH ERROR]\n" + e.message);
    alert("Erreur refresh (voir debug).");
  }
});

menuBtns.forEach(b => b.addEventListener("click", async () => {
  switchView(b.dataset.view);
}));

addPlayerBtn.addEventListener("click", async () => {
  const venueId = requireVenueOrStop();
  if(!venueId) return;

  const name = (playerNameEl.value || "").trim();
  if(!name) return alert("Nom requis");

  addPlayerBtn.disabled = true;
  try{
    await addPlayer({ name, venue_id: venueId });
    playerNameEl.value = "";
    await refreshAll();
    switchView("listPlayers");
  }catch(e){
    log("[ADD PLAYER ERROR]\n" + e.message);
    alert("Erreur ajout joueur (voir debug).");
  }finally{
    addPlayerBtn.disabled = false;
  }
});

createMatchBtn.addEventListener("click", async () => {
  const venueId = requireVenueOrStop();
  if(!venueId) return;

  const court = Number(courtEl.value);
  if(!Number.isFinite(court) || court <= 0) return alert("Terrain invalide");

  const a1 = a1El.value || null;
  const b1 = b1El.value || null;
  const a2 = a2El.value || null;
  const b2 = b2El.value || null;

  if(!a1 || !b1) return alert("A1 et B1 sont requis.");
  // éviter doublons grossiers
  const ids = [a1,a2,b1,b2].filter(Boolean);
  const uniq = new Set(ids);
  if(uniq.size !== ids.length) return alert("Un joueur est sélectionné 2 fois.");

  createMatchBtn.disabled = true;
  try{
    await createMatch({ venue_id: venueId, created_by: me.id, court, a1, a2, b1, b2 });
    await refreshAll();
    switchView("allMatches");
  }catch(e){
    log("[CREATE MATCH ERROR]\n" + e.message);
    alert("Erreur création match (voir debug).");
  }finally{
    createMatchBtn.disabled = false;
  }
});

finishAllBtn.addEventListener("click", async () => {
  const venueId = requireVenueOrStop();
  if(!venueId) return;
  if(!confirm("Terminer tous les matchs en cours aujourd’hui, sans score ?")) return;

  finishAllBtn.disabled = true;
  try{
    await finishAllOpenMatches({ venueId });
    await refreshAll();
  }catch(e){
    log("[FINISH ALL ERROR]\n" + e.message);
    alert("Erreur (voir debug).");
  }finally{
    finishAllBtn.disabled = false;
  }
});

// Init
(async function init(){
  versionText.textContent = "Version: " + APP_VERSION;
  debugEl.textContent = "";
  initCourts(12);

  const hp = parseHash();
  if(hp?.error){
    showLogin(`Erreur auth: ${hp.error}\n${hp.error_description || ""}`);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return;
  }
  if(hp?.access_token){
    saveTokens({
      access_token: hp.access_token,
      refresh_token: hp.refresh_token,
      expires_in: hp.expires_in ?? 3600
    });
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  await refreshSessionIfNeeded().catch(()=>{});

  if(!hasSession()){
    showLogin();
    return;
  }

  showApp();

  try{
    me = await loadUser();
    setAuthUI(true, me.email);
    log("[AUTH OK] " + me.email);

    // Default view
    switchView("addPlayer");

    await refreshAll();

    setInterval(async () => {
      try{ await refreshSessionIfNeeded(); }catch(e){ /* ignore */ }
    }, 10 * 60 * 1000);

  }catch(e){
    log("[INIT ERROR]\n" + e.message);
    clearTokens();
    showLogin("Session invalide. Reconnecte-toi.");
  }
})();
