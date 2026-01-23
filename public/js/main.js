import { APP_VERSION } from "./config.js";

const vEl = document.getElementById("appVersion");
if (vEl) vEl.textContent = `v${APP_VERSION}`;
import { parseHash, saveTokens, refreshSessionIfNeeded, loadUser, sendMagicLink, hasSession, clearTokens } from "./auth.js";
import { bindMainUI } from "./ui-main.js";
import { apiFetch } from "./api.js";

// Logger simple (debug panneau + console)
function log(msg){
  const el = document.getElementById("debug");
  if (el) el.textContent = (el.textContent ? el.textContent + "\n" : "") + msg;
  console.log(msg);
}

function showLogin(){
  document.getElementById("loginCard")?.classList.remove("hidden");
  document.getElementById("appCard")?.classList.add("hidden");
}

function showApp(){
  document.getElementById("loginCard")?.classList.add("hidden");
  document.getElementById("appCard")?.classList.remove("hidden");
}

function setAuthUI(isAuthed, email){
  const dot = document.getElementById("authDot");
  const em = document.getElementById("authEmail");
  if (dot) dot.className = "dot" + (isAuthed ? " ok" : "");
  if (em) em.textContent = isAuthed ? (email || "(connecté)") : "(non connecté)";
}

function wireTabs(){
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const tabPlayers = document.getElementById("tabPlayers");
  const tabMatches = document.getElementById("tabMatches");
  const tabDebug = document.getElementById("tabDebug");

  function setTab(id){
    tabPlayers?.classList.toggle("hidden", id !== "tabPlayers");
    tabMatches?.classList.toggle("hidden", id !== "tabMatches");
    tabDebug?.classList.toggle("hidden", id !== "tabDebug");
    tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  }

  tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  setTab("tabPlayers");
}

function wireAuthBadge(){
  const badge = document.getElementById("authBadge");
  if(!badge) return;
  badge.addEventListener("click", () => {
    // Si pas de session, ne navigue pas.
    if(!hasSession()) return;
    window.location.href = "account.html";
  });
}

function wireLogin(){
  const emailEl = document.getElementById("email");
  const loginBtn = document.getElementById("loginBtn");
  const loginStatus = document.getElementById("loginStatus");

  if(!loginBtn){
    console.error("[wireLogin] loginBtn introuvable (id=loginBtn)");
    return;
  }

  loginBtn.addEventListener("click", async () => {
    const email = (emailEl?.value || "").trim();
    if(!email) return alert("Courriel requis");

    loginBtn.disabled = true;
    if(loginStatus) loginStatus.textContent = "Envoi du lien…";

    try{
      await sendMagicLink(email);
      if(loginStatus) loginStatus.textContent = "Lien envoyé. Vérifie ton courriel.";
    }catch(e){
      const msg = e?.message || String(e);
      console.error("[OTP ERROR]", msg);
      log("[OTP ERROR]\n" + msg);
      if(loginStatus) loginStatus.textContent = "Erreur: " + msg;
      alert("Erreur envoi lien.\n\n" + msg);
    }finally{
      loginBtn.disabled = false;
    }
  });
}

(async function init(){
  // Version depuis config.js
  const v = document.getElementById("versionText");
  if (v) v.textContent = "Version: " + (APP_VERSION || "(APP_VERSION manquant)");

  // Toujours brancher la UI de base
  wireLogin();
  wireTabs();
  wireAuthBadge();

  // 1) handle magic link return
  const hp = parseHash();
  if(hp?.error){
    showLogin();
    setAuthUI(false, "");
    log(`Erreur auth: ${hp.error}\n${hp.error_description || ""}`);
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

  // 2) refresh if needed
  try{
    await refreshSessionIfNeeded();
  }catch(e){
    log("[REFRESH ERROR]\n" + (e?.message || e));
  }

  // 3) if no session -> login
  if(!hasSession()){
    showLogin();
    setAuthUI(false, "");
    return;
  }

  // 4) load user + start UI
  try{
    
    const me = await loadUser();
    showApp();
    setAuthUI(true, me.email);
    log("[AUTH OK] " + me.email);

    // Load profile (global_role via profiles.level when migrated)
    let profile = null;
    try{
      const rows = await apiFetch(`/rest/v1/profiles?select=user_id,level,full_name,skill_level&user_id=eq.${me.id}&limit=1`);
      profile = rows?.[0] || null;
    }catch(e){}

    const ui = bindMainUI({ me, profile, log });
    await ui.initVenuesFlow();

  }catch(e){
    // session invalide
    clearTokens?.();
    showLogin();
    setAuthUI(false, "");
    log("[INIT ERROR]\n" + (e?.message || e));
  }
})();
