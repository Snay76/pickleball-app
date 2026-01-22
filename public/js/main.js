import { APP_VERSION } from "./config.js";
import { parseHash, saveTokens, refreshSessionIfNeeded, loadUser, sendMagicLink } from "./auth.js";
import { bindMainUI } from "./ui-main.js";

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
  if (v) v.textContent = "Version: " + APP_VERSION;

  // Brancher le bouton login même si pas de session
  wireLogin();

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
  const hasAccess = !!localStorage.getItem("pb_access_token");
  if(!hasAccess){
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

    const ui = bindMainUI({ me, log });
    await ui.initVenuesFlow();

  }catch(e){
    showLogin();
    setAuthUI(false, "");
    log("[INIT ERROR]\n" + (e?.message || e));
  }
})();
