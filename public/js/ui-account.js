import { apiFetch } from "./api.js";
import { refreshSessionIfNeeded, hasSession, loadUser, clearTokens } from "./auth.js";
import { listVenues, fillVenueSelect, getSelectedVenueId, setSelectedVenueId } from "./venues.js";
import { addPlayerToVenue, removePlayerFromVenue } from "./players.js";

let me = null;
let myProfile = null;

const backBtn = document.getElementById("backBtn");
const logoutBtn = document.getElementById("logoutBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

const cfgEmail = document.getElementById("cfgEmail");
const cfgFullName = document.getElementById("cfgFullName");
const cfgWantsEmail = document.getElementById("cfgWantsEmail");
const cfgLevel = document.getElementById("cfgLevel");

// Lieux
const acctVenueSelect = document.getElementById("acctVenueSelect");
const joinVenueBtn = document.getElementById("joinVenueBtn");
const leaveVenueBtn = document.getElementById("leaveVenueBtn");

backBtn?.addEventListener("click", () => (window.location.href = "index.html"));
logoutBtn?.addEventListener("click", () => {
  clearTokens();
  window.location.href = "index.html";
});

async function loadMyProfile(){
  const rows = await apiFetch(`/rest/v1/profiles?select=user_id,email,full_name,wants_email,level&user_id=eq.${me.id}`);
  myProfile = rows?.[0] || null;
  return myProfile;
}

async function upsertProfile({ full_name, wants_email, level }){
  const payload = {
    user_id: me.id,
    email: me.email,
    full_name,
    wants_email,
    level
  };

  const inserted = await apiFetch(`/rest/v1/profiles?select=user_id,email,full_name,wants_email,level`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });
  myProfile = inserted?.[0] || myProfile;
}

// Trouver ou créer un joueur global (players) par nom exact
async function getOrCreatePlayerByName(fullName){
  const name = (fullName || "").trim();
  if(!name) throw new Error("Nom complet requis (Profil).");

  const existing = await apiFetch(`/rest/v1/players?select=id,name&name=eq.${encodeURIComponent(name)}&limit=1`);
  if(existing?.[0]) return existing[0];

  const inserted = await apiFetch("/rest/v1/players?select=id,name", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify({ name })
  });
  return inserted?.[0] || null;
}

async function refreshVenueSelect(){
  const venues = await listVenues();
  const saved = getSelectedVenueId(me?.id);
  const selected = saved && venues.some(v => v.id === saved) ? saved : (venues[0]?.id || "");
  setSelectedVenueId(me?.id, selected);
  fillVenueSelect(acctVenueSelect, venues, selected);
}

saveBtn?.addEventListener("click", async () => {
  const fullName = (cfgFullName.value || "").trim();
  if(!fullName){
    statusEl.textContent = "Nom complet requis.";
    return;
  }
  const wantsEmail = cfgWantsEmail.value === "true";
  const level = cfgLevel.value || null;

  saveBtn.disabled = true;
  statusEl.textContent = "Enregistrement…";
  try{
    await upsertProfile({ full_name: fullName, wants_email: wantsEmail, level });
    statusEl.textContent = "OK.";
  }catch(e){
    statusEl.textContent = "Erreur:\n" + e.message + "\n\nSi ça dit 404 profiles: table absente. Si 401/403: RLS bloque.";
  }finally{
    saveBtn.disabled = false;
  }
});

joinVenueBtn?.addEventListener("click", async () => {
  const venueId = acctVenueSelect?.value || "";
  if(!venueId) return alert("Choisis un lieu.");
  const fullName = (cfgFullName.value || "").trim();
  if(!fullName) return alert("Complète ton nom complet dans Profil puis Enregistrer.");

  joinVenueBtn.disabled = true;
  try{
    const player = await getOrCreatePlayerByName(fullName);
    if(!player?.id) throw new Error("Impossible de créer/charger le joueur.");
    await addPlayerToVenue(venueId, player.id);
    statusEl.textContent = `Inscrit au lieu. (joueur: ${player.name})`;
    alert("OK. Tu es inscrit au lieu.");
  }catch(e){
    statusEl.textContent = "Erreur inscription lieu:\n" + e.message;
    alert("Erreur.\n\n" + e.message);
  }finally{
    joinVenueBtn.disabled = false;
  }
});

leaveVenueBtn?.addEventListener("click", async () => {
  const venueId = acctVenueSelect?.value || "";
  if(!venueId) return alert("Choisis un lieu.");
  const fullName = (cfgFullName.value || "").trim();
  if(!fullName) return alert("Complète ton nom complet.");

  if(!confirm("Te retirer de ce lieu ?")) return;

  leaveVenueBtn.disabled = true;
  try{
    const player = await getOrCreatePlayerByName(fullName);
    if(!player?.id) throw new Error("Joueur introuvable.");
    await removePlayerFromVenue(venueId, player.id);
    statusEl.textContent = `Retiré du lieu. (joueur: ${player.name})`;
    alert("OK. Retiré du lieu.");
  }catch(e){
    statusEl.textContent = "Erreur retrait lieu:\n" + e.message;
    alert("Erreur.\n\n" + e.message);
  }finally{
    leaveVenueBtn.disabled = false;
  }
});

(async function init(){
  statusEl.textContent = "";
  await refreshSessionIfNeeded().catch(()=>{});

  if(!hasSession()){
    window.location.href = "index.html";
    return;
  }

  try{
    me = await loadUser();
    cfgEmail.value = me.email;

    await loadMyProfile();
    cfgFullName.value = myProfile?.full_name || "";
    cfgWantsEmail.value = String(!!myProfile?.wants_email);
    cfgLevel.value = myProfile?.level || "";

    await refreshVenueSelect();

    if(!myProfile?.full_name){
      statusEl.textContent = "Première connexion: complète ton profil puis Enregistrer.";
    }else{
      statusEl.textContent = "Prêt.";
    }
  }catch(e){
    statusEl.textContent = "Erreur init:\n" + e.message;
  }
})();
