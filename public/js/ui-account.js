
import { apiFetch } from "./api.js";
import { refreshSessionIfNeeded, hasSession, loadUser, clearTokens } from "./auth.js";

let me = null;
let myProfile = null;

const backBtn = document.getElementById("backBtn");
const logoutBtn = document.getElementById("logoutBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

const cfgEmail = document.getElementById("cfgEmail");
const cfgFullName = document.getElementById("cfgFullName");
const cfgWantsEmail = document.getElementById("cfgWantsEmail");
const cfgSkill = document.getElementById("cfgSkill");
const cfgAccess = document.getElementById("cfgAccess");

// Lieux
const joinCode = document.getElementById("joinCode");
const joinByCodeBtn = document.getElementById("joinByCodeBtn");
const acctVenueSelect = document.getElementById("acctVenueSelect");
const leaveVenueBtn = document.getElementById("leaveVenueBtn");

const shareBox = document.getElementById("shareBox");
const shareCodeValue = document.getElementById("shareCodeValue");
const copyShareCodeBtn = document.getElementById("copyShareCodeBtn");

const membersWrap = document.getElementById("membersWrap");
const membersEmpty = document.getElementById("membersEmpty");

backBtn?.addEventListener("click", () => (window.location.href = "index.html"));
logoutBtn?.addEventListener("click", () => {
  clearTokens();
  window.location.href = "index.html";
});

function setStatus(msg){
  if(statusEl) statusEl.textContent = msg;
}

function esc(s){
  return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

async function loadMyProfile(){
  // Support: nouveau schema (skill_level + level=global_role) OU ancien schema (level=skill)
  const rows = await apiFetch(`/rest/v1/profiles?select=user_id,email,full_name,wants_email,level,skill_level&user_id=eq.${me.id}`);
  myProfile = rows?.[0] || null;
  return myProfile;
}

async function upsertProfile({ full_name, wants_email, level, skill_level }){
  const payload = {
    user_id: me.id,
    email: me.email,
    full_name,
    wants_email
  };

  // On tente nouveau schema
  payload.level = level;          // global_role (user/admin_full)
  payload.skill_level = skill_level;

  try{
    const inserted = await apiFetch(`/rest/v1/profiles?select=user_id,email,full_name,wants_email,level,skill_level`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(payload)
    });
    myProfile = inserted?.[0] || myProfile;
    return;
  }catch(e){
    // Fallback ancien schema : level = skill (et pas de global_role)
    const legacy = {
      user_id: me.id,
      email: me.email,
      full_name,
      wants_email,
      level: skill_level || ""
    };
    const inserted = await apiFetch(`/rest/v1/profiles?select=user_id,email,full_name,wants_email,level`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(legacy)
    });
    myProfile = inserted?.[0] || myProfile;
  }
}

async function listMyVenues(){
  // Nouveau schema: location_members -> locations
  try{
    const rows = await apiFetch(`/rest/v1/location_members?select=location_id,role,locations(id,name,share_code,created_by)&user_id=eq.${me.id}&order=joined_at.desc`);
    const venues = (rows||[]).map(r => ({
      id: r.locations?.id || r.location_id,
      name: r.locations?.name || "(?)",
      share_code: r.locations?.share_code || null,
      created_by: r.locations?.created_by || null,
      my_role: r.role || "player"
    })).filter(v => v.id);
    return { venues, mode:"members" };
  }catch(e){
    // Legacy fallback: tout le monde voit tous les lieux
    const venues = await apiFetch(`/rest/v1/locations?select=id,name,created_by&order=created_at.desc`) || [];
    return { venues, mode:"legacy" };
  }
}

function fillVenueSelect(sel, venues){
  if(!sel) return;
  sel.innerHTML = "";
  for(const v of venues){
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

async function getVenueByShareCode(code){
  const c = (code||"").trim();
  if(!c) return null;
  const rows = await apiFetch(`/rest/v1/locations?select=id,name,share_code,created_by&share_code=eq.${encodeURIComponent(c)}&limit=1`);
  return rows?.[0] || null;
}

async function ensurePlayerForMe(){
  const fullName = (cfgFullName?.value || me.email || "").trim();
  const email = me.email;

  // Nouveau schema (players.user_id/email)
  try{
    const found = await apiFetch(`/rest/v1/players?select=id,name,user_id,email&user_id=eq.${me.id}&limit=1`);
    if(found?.[0]) return found[0];

    const inserted = await apiFetch(`/rest/v1/players?select=id,name,user_id,email`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Prefer":"return=representation" },
      body: JSON.stringify({ name: fullName, user_id: me.id, email, created_by_user_id: me.id })
    });
    return inserted?.[0] || null;
  }catch(e){
    // Legacy: match par nom
    const existing = await apiFetch(`/rest/v1/players?select=id,name&name=eq.${encodeURIComponent(fullName)}&limit=1`);
    if(existing?.[0]) return existing[0];
    const inserted = await apiFetch("/rest/v1/players?select=id,name", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Prefer":"return=representation" },
      body: JSON.stringify({ name: fullName })
    });
    return inserted?.[0] || null;
  }
}

async function addPlayerToVenue(playerId, venueId){
  // location_players (already in your schema)
  await apiFetch(`/rest/v1/location_players`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ location_id: venueId, player_id: playerId, present: true })
  });
}

async function joinVenueByCode(){
  const code = joinCode?.value || "";
  const v = await getVenueByShareCode(code);
  if(!v) throw new Error("Code invalide (lieu introuvable).");

  // Insert membership (if exists)
  try{
    await apiFetch(`/rest/v1/location_members`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ location_id: v.id, user_id: me.id, role: "player" })
    });
  }catch(e){
    // legacy: ignore
  }

  // Ensure player identity and attach to venue
  const p = await ensurePlayerForMe();
  if(p?.id){
    try{ await addPlayerToVenue(p.id, v.id); }catch(e){}
  }
}

async function leaveSelectedVenue(){
  const venueId = acctVenueSelect?.value;
  if(!venueId) return;

  // remove membership
  try{
    await apiFetch(`/rest/v1/location_members?location_id=eq.${venueId}&user_id=eq.${me.id}`, { method:"DELETE" });
  }catch(e){
    // legacy: ignore
  }

  // Also remove from location_players if possible
  try{
    const p = await ensurePlayerForMe();
    if(p?.id){
      await apiFetch(`/rest/v1/location_players?location_id=eq.${venueId}&player_id=eq.${p.id}`, { method:"DELETE" });
    }
  }catch(e){}
}

function canSeeShareCode(selectedVenue, myRole){
  if(myProfile?.level === "admin_full") return true;
  return myRole === "admin";
}

async function loadVenueRoleForMe(venueId){
  try{
    const rows = await apiFetch(`/rest/v1/location_members?select=role&location_id=eq.${venueId}&user_id=eq.${me.id}&limit=1`);
    return rows?.[0]?.role || "player";
  }catch(e){
    return "player";
  }
}

async function renderShareCode(selectedVenue, myRole){
  if(!shareBox || !shareCodeValue) return;
  const visible = canSeeShareCode(selectedVenue, myRole);
  shareBox.style.display = visible ? "block" : "none";
  if(!visible){
    shareCodeValue.textContent = "—";
    return;
  }
  // fetch venue share_code
  try{
    const rows = await apiFetch(`/rest/v1/locations?select=share_code& id=eq.${selectedVenue.id}&limit=1`);
    shareCodeValue.textContent = rows?.[0]?.share_code || selectedVenue.share_code || "—";
  }catch(e){
    shareCodeValue.textContent = selectedVenue.share_code || "—";
  }
}

async function loadMembersStats(venueId){
  // Preferred: view venue_member_stats
  try{
    const rows = await apiFetch(`/rest/v1/venue_member_stats?select=*&location_id=eq.${venueId}&order=role_sort.asc,full_name.asc`);
    return rows || [];
  }catch(e){
    // fallback: show players only
    const rows = await apiFetch(`/rest/v1/location_players?select=player_id,players(id,name)&location_id=eq.${venueId}`);
    return (rows||[]).map(r => ({
      full_name: r.players?.name || "(?)",
      email: null,
      source: "manuel",
      role: "player",
      matches_played: null
    }));
  }
}

function roleLabel(r){
  if(r==="admin") return "Admin lieu";
  if(r==="organiser") return "Organisateur";
  return "Joueur";
}

function canManageRoles(myRole){
  if(myProfile?.level === "admin_full") return true;
  return myRole === "admin" || myRole === "organiser";
}

async function setMemberRole(venueId, userId, role){
  await apiFetch(`/rest/v1/location_members?location_id=eq.${venueId}&user_id=eq.${userId}`, {
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ role })
  });
}

async function removeMember(venueId, userId){
  await apiFetch(`/rest/v1/location_members?location_id=eq.${venueId}&user_id=eq.${userId}`, { method:"DELETE" });
}

async function renderMembers(venueId, myRole){
  if(!membersWrap || !membersEmpty) return;
  const rows = await loadMembersStats(venueId);

  if(!rows.length){
    membersWrap.innerHTML = "";
    membersEmpty.classList.remove("hidden");
    return;
  }
  membersEmpty.classList.add("hidden");

  const manage = canManageRoles(myRole);

  membersWrap.innerHTML = rows.map(r => {
    const badge = r.global_role === "admin_full" ? `<span class="badge ok">admin_full</span>` : "";
    const email = r.email ? `<div class="muted">${esc(r.email)}</div>` : `<div class="muted">—</div>`;
    const src = r.source === "account" ? "Compte" : "Ajout manuel";
    const mp = (r.matches_played ?? "—");

    const roleSel = manage && r.user_id ? `
      <select data-role="${esc(r.user_id)}" class="miniSel">
        <option value="player"${r.role==="player"?" selected":""}>Joueur</option>
        <option value="organiser"${r.role==="organiser"?" selected":""}>Organisateur</option>
        <option value="admin"${r.role==="admin"?" selected":""}>Admin lieu</option>
      </select>
    ` : `<div>${roleLabel(r.role)}</div>`;

    const rmBtn = manage && r.user_id ? `<button class="miniBtn btnDanger" data-remove="${esc(r.user_id)}" type="button">Retirer</button>` : "";

    return `
      <div class="card" style="padding:12px;margin:10px 0;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.full_name || "(?)")} ${badge}</div>
            ${email}
            <div class="muted">${esc(src)} • Matchs: <b>${esc(mp)}</b></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
            ${roleSel}
            ${rmBtn}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // bind actions
  if(manage){
    membersWrap.querySelectorAll("select[data-role]").forEach(sel => {
      sel.addEventListener("change", async () => {
        const uid = sel.getAttribute("data-role");
        const role = sel.value;
        try{
          await setMemberRole(venueId, uid, role);
          setStatus("Rôle mis à jour.");
        }catch(e){
          setStatus("Erreur mise à jour rôle.");
        }
      });
    });

    membersWrap.querySelectorAll("button[data-remove]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.getAttribute("data-remove");
        try{
          await removeMember(venueId, uid);
          await refreshVenuesAndMembers();
          setStatus("Membre retiré.");
        }catch(e){
          setStatus("Erreur retrait membre.");
        }
      });
    });
  }
}

let venuesState = { venues:[], mode:"members" };

async function refreshVenuesAndMembers(){
  venuesState = await listMyVenues();
  fillVenueSelect(acctVenueSelect, venuesState.venues);

  const venueId = acctVenueSelect?.value || venuesState.venues?.[0]?.id;
  if(venueId && acctVenueSelect) acctVenueSelect.value = venueId;

  const selVenue = venuesState.venues.find(v => v.id === venueId) || { id: venueId };
  const myRole = (myProfile?.level === "admin_full") ? "admin" : (await loadVenueRoleForMe(venueId));

  await renderShareCode(selVenue, myRole);
  await renderMembers(venueId, myRole);
}

acctVenueSelect?.addEventListener("change", async () => {
  await refreshVenuesAndMembers();
});

joinByCodeBtn?.addEventListener("click", async () => {
  try{
    setStatus("Inscription…");
    await joinVenueByCode();
    joinCode.value = "";
    await refreshVenuesAndMembers();
    setStatus("Inscrit au lieu.");
  }catch(e){
    setStatus(e?.message || "Erreur inscription.");
  }
});

leaveVenueBtn?.addEventListener("click", async () => {
  try{
    setStatus("Retrait…");
    await leaveSelectedVenue();
    await refreshVenuesAndMembers();
    setStatus("Retiré du lieu.");
  }catch(e){
    setStatus("Erreur retrait.");
  }
});

copyShareCodeBtn?.addEventListener("click", async () => {
  const txt = shareCodeValue?.textContent || "";
  if(!txt || txt === "—") return;
  try{
    await navigator.clipboard.writeText(txt);
    setStatus("Code copié.");
  }catch(e){
    setStatus("Impossible de copier.");
  }
});

saveBtn?.addEventListener("click", async () => {
  try{
    setStatus("Enregistrement…");
    await upsertProfile({
      full_name: cfgFullName?.value || "",
      wants_email: (cfgWantsEmail?.value === "true"),
      level: cfgAccess?.value || "user",
      skill_level: cfgSkill?.value || ""
    });
    await refreshVenuesAndMembers();
    setStatus("OK.");
  }catch(e){
    setStatus("Erreur enregistrement.");
  }
});

async function init(){
  setStatus("Chargement…");
  await refreshSessionIfNeeded();
  if(!hasSession()){
    window.location.href = "index.html";
    return;
  }
  me = await loadUser();
  if(cfgEmail) cfgEmail.value = me.email || "";

  await loadMyProfile();
  if(cfgFullName) cfgFullName.value = myProfile?.full_name || "";
  if(cfgWantsEmail) cfgWantsEmail.value = String(myProfile?.wants_email ?? true);
  if(cfgSkill) cfgSkill.value = myProfile?.skill_level || (myProfile?.level && myProfile.level !== "admin_full" && myProfile.level !== "user" ? myProfile.level : "");
  if(cfgAccess) cfgAccess.value = (myProfile?.level === "admin_full") ? "admin_full" : "user";

  await refreshVenuesAndMembers();
  setStatus("Prêt.");
}

init();
