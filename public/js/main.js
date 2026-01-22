import { parseHash, saveTokens, refreshSessionIfNeeded, loadUser } from "./auth.js";
import { bindMainUI } from "./ui-main.js";

// petit logger optionnel
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

(async function init(){
  // 1) handle magic link return
  const hp = parseHash();
  if(hp?.error){
    showLogin();
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
  await refreshSessionIfNeeded();

  // 3) if no session -> login
  const hasAccess = !!localStorage.getItem("pb_access_token");
  if(!hasAccess){
    showLogin();
    setAuthUI(false, "");
    return;
  }

  // 4) load user
  try{
    const me = await loadUser();
    showApp();
    setAuthUI(true, me.email);
    log("[AUTH OK] " + me.email);

    // 5) start UI (lieux + joueurs + matchs)
    const ui = bindMainUI({ me, log });
    await ui.initVenuesFlow();

  }catch(e){
    showLogin();
    setAuthUI(false, "");
    log("[INIT ERROR]\n" + (e?.message || e));
  }
})();
