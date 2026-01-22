import { apiFetch } from "./api.js";
import { refreshSessionIfNeeded, hasSession, loadUser, clearTokens } from "./auth.js";

const backBtn = document.getElementById("backBtn");
const logoutBtn = document.getElementById("logoutBtn");
const saveBtn = document.getElementById("saveBtn");

const cfgEmail = document.getElementById("cfgEmail");
const cfgFullName = document.getElementById("cfgFullName");
const cfgLevel = document.getElementById("cfgLevel");
const cfgWantsEmail = document.getElementById("cfgWantsEmail");

const statusEl = document.getElementById("status");

let me = null;
let myProfile = null;

backBtn.addEventListener("click", () => window.location.href = "index.html");

logoutBtn.addEventListener("click", () => {
  clearTokens();
  window.location.href = "index.html";
});

async function loadMyProfile(){
  const rows = await apiFetch(`/rest/v1/profiles?select=user_id,email,full_name,wants_email,level&user_id=eq.${me.id}`);
  myProfile = rows?.[0] || null;
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

saveBtn.addEventListener("click", async () => {
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

    if(!myProfile?.full_name){
      statusEl.textContent = "Première connexion: complète ton profil puis Enregistrer.";
    }else{
      statusEl.textContent = "Prêt.";
    }
  }catch(e){
    statusEl.textContent = "Erreur init:\n" + e.message;
  }
})();
