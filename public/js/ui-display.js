import { hasSession, loadUser } from "./auth.js";
import { listVenues, getSelectedVenueId } from "./venues.js";
import { listPlayersForVenue } from "./players.js";
import { listMatchesForVenue } from "./matches.js";

function esc(s){
  return String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function isToday(iso){
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate();
}

(async function init(){
  const backBtn = document.getElementById("backBtn");
  backBtn?.addEventListener("click", () => (window.location.href = "index.html"));

  if(!hasSession()){
    window.location.href = "index.html";
    return;
  }

  const me = await loadUser();
  const venues = await listVenues();
  const venueId = getSelectedVenueId(me.id);
  const venue = venues.find(v => v.id === venueId);

  document.getElementById("displayVenue").textContent = "Lieu: " + (venue?.name || "(non choisi)");

  const filterEl = document.getElementById("displayFilter");
  const statusEl = document.getElementById("displayStatus");
  const wrap = document.getElementById("displayWrap");

  let myPlayerId = null;

  async function resolveMyPlayerId(){
    // Option simple: match par nom complet si ton profil = nom joueur
    // (si tu veux du 100% fiable, on le lie dans profiles.player_id)
    const players = await listPlayersForVenue(venueId);
    // meilleur effort: si tu as l’email ou full_name ailleurs, on adaptera
    // ici: on prend celui qui matche l’email avant @ si aucun autre.
    const guess = (me.email || "").split("@")[0]?.toLowerCase();
    const found = players.find(p => p.name.toLowerCase().includes(guess));
    myPlayerId = found?.id || null;
  }

  async function refresh(){
    if(!venueId){
      statusEl.textContent = "Aucun lieu sélectionné.";
      wrap.innerHTML = "";
      return;
    }

    statusEl.textContent = "Chargement…";

    const [players, matches] = await Promise.all([
      listPlayersForVenue(venueId),
      listMatchesForVenue(venueId)
    ]);

    const byId = (id) => players.find(p => p.id === id)?.name || "(?)";

    const today = matches.filter(m => isToday(m.created_at));
    const mode = filterEl.value;

    let filtered = today;

    if(mode === "today_inprogress"){
      filtered = today.filter(m => (m.status === "open" || m.status === "locked"));
    }else if(mode === "today_mine"){
      if(myPlayerId === null) await resolveMyPlayerId();
      if(!myPlayerId){
        statusEl.textContent = "Impossible d’identifier “mes matchs” (pas lié à un joueur).";
        filtered = today;
      }else{
        filtered = today.filter(m =>
          [m.a1,m.a2,m.b1,m.b2].includes(myPlayerId)
        );
      }
    }

    wrap.innerHTML = "";
    if(!filtered.length){
      statusEl.textContent = "(aucun match)";
      return;
    }
    statusEl.textContent = `${filtered.length} match(s)`;

    for(const m of filtered){
      const box = document.createElement("div");
      box.className = "listItem";
      box.style.flexDirection = "column";
      box.style.alignItems = "stretch";

      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <div>
            <div class="name">Terrain ${esc(m.court)} — ${esc(m.status || "")}</div>
            <div class="muted" style="font-size:12px;margin-top:2px">
              A: ${esc(byId(m.a1))}${m.a2 ? " + " + esc(byId(m.a2)) : ""} •
              B: ${esc(byId(m.b1))}${m.b2 ? " + " + esc(byId(m.b2)) : ""}
            </div>
          </div>
          <div class="muted" style="font-size:12px">${esc(new Date(m.created_at).toLocaleTimeString())}</div>
        </div>
      `;
      wrap.appendChild(box);
    }
  }

  filterEl?.addEventListener("change", refresh);

  await refresh();
  setInterval(refresh, 8000);
})();
