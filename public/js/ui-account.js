// public/js/ui-account.js
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

// Lieux (join/leave/select)
const joinCode = document.getElementById("joinCode");
const joinByCodeBtn = document.getElementById("joinByCodeBtn");
const acctVenueSelect = document.getElementById("acctVenueSelect");
const leaveVenueBtn = document.getElementById("leaveVenueBtn");

// Partage
const shareBox = document.getElementById("shareBox");
const shareVenueSelect = document.getElementById("shareVenueSelect"); // <-- NEW
const shareCodeValue = document.getElementById("shareCodeValue");
const copyShareCodeBtn = document.getElementById("copyShareCodeBtn");

// Créer un lieu (doit exister dans account.html)
const newVenueName = document.getElementById("newVenueName");
const createVenueBtn = document.getElementById("createVenueBtn");

backBtn?.addEventListener("click", () => (window.location.href = "index.html"));

logoutBtn?.addEventListener("click", () => {
  clearTokens();
  window.location.href = "index.html";
});

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

// ---------- Profile ----------
async function loadMyProfile() {
  const rows = await apiFetch(
    `/rest/v1/profiles?select=user_id,email,full_name,wants_email,level,skill_level&user_id=eq.${me.id}&limit=1`
  );
  myProfile = rows?.[0] || null;
  return myProfile;
}

async function upsertProfile({ full_name, wants_email, skill_level }) {
  // IMPORTANT: on ne met JAMAIS à jour level/global_role depuis le client.
  const payload = {
    user_id: me.id,
    email: me.email,
    full_name,
    wants_email,
  };

  // Nouveau schema
  try {
    payload.skill_level = skill_level;

    const inserted = await apiFetch(
      `/rest/v1/profiles?select=user_id,email,full_name,wants_email,level,skill_level`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(payload),
      }
    );

    myProfile = inserted?.[0] || myProfile;
    return;
  } catch (_) {
    // Legacy fallback: level = skill
    const legacy = {
      user_id: me.id,
      email: me.email,
      full_name,
      wants_email,
      level: skill_level || "",
    };

    const inserted = await apiFetch(
      `/rest/v1/profiles?select=user_id,email,full_name,wants_email,level`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(legacy),
      }
    );

    myProfile = inserted?.[0] || myProfile;
  }
}

// ---------- Venues ----------
async function listMyVenues() {
  // Nouveau schema: location_members -> locations
  try {
    const rows = await apiFetch(
      `/rest/v1/location_members?select=location_id,role,locations(id,name,share_code,created_by)&user_id=eq.${me.id}&order=joined_at.desc`
    );

    const venues = (rows || [])
      .map((r) => ({
        id: r.locations?.id || r.location_id,
        name: r.locations?.name || "(?)",
        share_code: r.locations?.share_code || null,
        created_by: r.locations?.created_by || null,
        my_role: r.role || "player",
      }))
      .filter((v) => v.id);

    return { venues, mode: "members" };
  } catch (_) {
    // Legacy fallback
    const venues =
      (await apiFetch(
        `/rest/v1/locations?select=id,name,share_code,created_by&order=created_at.desc`
      )) || [];
    // my_role absent en legacy
    return { venues: venues.map(v => ({...v, my_role:"player"})), mode: "legacy" };
  }
}

function fillVenueSelect(sel, venues) {
  if (!sel) return;
  sel.innerHTML = "";
  for (const v of venues) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

function pickValidVenueId(sel, venues) {
  const current = sel?.value;
  if (current && venues.some((v) => v.id === current)) return current;
  return venues?.[0]?.id || "";
}

async function getVenueByShareCode(code) {
  const c = (code || "").trim();
  if (!c) return null;

  const rows = await apiFetch(
    `/rest/v1/locations?select=id,name,share_code,created_by&share_code=eq.${encodeURIComponent(c)}&limit=1`
  );
  return rows?.[0] || null;
}

async function loadVenueRoleForMe(venueId) {
  try {
    const rows = await apiFetch(
      `/rest/v1/location_members?select=role&location_id=eq.${venueId}&user_id=eq.${me.id}&limit=1`
    );
    return rows?.[0]?.role || "player";
  } catch (_) {
    return "player";
  }
}

function canSeeShareCode(myRole) {
  if (myProfile?.level === "admin_full") return true;
  return myRole === "admin";
}

async function renderShareCode(selectedVenue, myRole) {
  if (!shareBox || !shareCodeValue) return;

  const visible = canSeeShareCode(myRole);
  shareBox.style.display = visible ? "block" : "none";

  if (!visible) {
    shareCodeValue.textContent = "—";
    return;
  }

  async function updateShareCodeFromShareSelect() {
  const venueId = (shareVenueSelect?.value || "").trim();

  if (!venueId) {
    if (shareBox) shareBox.style.display = "none";
    if (shareCodeValue) shareCodeValue.textContent = "—";
    return;
  }

  const selVenue = venuesState.venues.find(v => v.id === venueId) || { id: venueId };

  const myRole =
    myProfile?.level === "admin_full" ? "admin" : await loadVenueRoleForMe(venueId);

  await renderShareCode(selVenue, myRole);
}
  
  // 1) déjà dispo via join
  const already = (selectedVenue?.share_code || "").trim();
  if (already) {
    shareCodeValue.textContent = already;
    return;
  }

  // 2) fallback DB
  try {
    const rows = await apiFetch(
      `/rest/v1/locations?select=share_code&id=eq.${selectedVenue.id}&limit=1`
    );
    shareCodeValue.textContent = rows?.[0]?.share_code || "—";
  } catch (_) {
    shareCodeValue.textContent = "—";
  }
}

// ---------- Player identity (for location_players) ----------
async function ensurePlayerForMe() {
  const fullName = (cfgFullName?.value || me.email || "").trim();
  const email = me.email;

  try {
    const found = await apiFetch(
      `/rest/v1/players?select=id,name,user_id,email&user_id=eq.${me.id}&limit=1`
    );
    if (found?.[0]) return found[0];

    const inserted = await apiFetch(`/rest/v1/players?select=id,name,user_id,email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        name: fullName,
        user_id: me.id,
        email,
        created_by_user_id: me.id,
      }),
    });

    return inserted?.[0] || null;
  } catch (_) {
    const existing = await apiFetch(
      `/rest/v1/players?select=id,name&name=eq.${encodeURIComponent(fullName)}&limit=1`
    );
    if (existing?.[0]) return existing[0];

    const inserted = await apiFetch(`/rest/v1/players?select=id,name`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ name: fullName }),
    });

    return inserted?.[0] || null;
  }
}

async function addPlayerToVenue(playerId, venueId) {
  await apiFetch(`/rest/v1/location_players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location_id: venueId, player_id: playerId, present: true }),
  });
}

// ---------- Join / Leave ----------
async function joinVenueByCode() {
  const code = joinCode?.value || "";
  const v = await getVenueByShareCode(code);
  if (!v) throw new Error("Code invalide (lieu introuvable).");

  try {
    await apiFetch(`/rest/v1/location_members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: v.id, user_id: me.id, role: "player" }),
    });
  } catch (_) {}

  const p = await ensurePlayerForMe();
  if (p?.id) {
    try {
      await addPlayerToVenue(p.id, v.id);
    } catch (_) {}
  }
}

async function leaveSelectedVenue() {
  const venueId = acctVenueSelect?.value;
  if (!venueId) return;

  try {
    await apiFetch(`/rest/v1/location_members?location_id=eq.${venueId}&user_id=eq.${me.id}`, {
      method: "DELETE",
    });
  } catch (_) {}

  try {
    const p = await ensurePlayerForMe();
    if (p?.id) {
      await apiFetch(`/rest/v1/location_players?location_id=eq.${venueId}&player_id=eq.${p.id}`, {
        method: "DELETE",
      });
    }
  } catch (_) {}
}

// ---------- Create venue ----------
async function createVenueFlow() {
  const name = (newVenueName?.value || "").trim();
  if (!name) throw new Error("Nom du lieu requis.");

  const inserted = await apiFetch(`/rest/v1/locations?select=id,name,share_code,created_by`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ name, created_by: me.id }),
  });

  const v = inserted?.[0];
  if (!v?.id) throw new Error("Création échouée (pas de retour).");

  // admin du lieu
  try {
    await apiFetch(`/rest/v1/location_members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: v.id, user_id: me.id, role: "admin" }),
    });
  } catch (_) {}

  // associer player au lieu
  try {
    const p = await ensurePlayerForMe();
    if (p?.id) {
      try {
        await addPlayerToVenue(p.id, v.id);
      } catch (_) {}
    }
  } catch (_) {}

  if (newVenueName) newVenueName.value = "";
  await refreshVenuesUI();

  // sélectionner dans "Mes lieux" ET "Partage"
  if (acctVenueSelect) acctVenueSelect.value = v.id;
  if (shareVenueSelect) shareVenueSelect.value = v.id;
  await refreshVenuesUI();
}

// ---------- UI refresh ----------
let venuesState = { venues: [], mode: "members" };

async function refreshVenuesUI({ keepSelection = true } = {}) {
  venuesState = await listMyVenues();

  // Sauvegarde des choix AVANT de refill
  const prevAcct = keepSelection ? (acctVenueSelect?.value || "") : "";
  const prevShare = keepSelection ? (shareVenueSelect?.value || "") : "";

  // Refill
  fillVenueSelect(acctVenueSelect, venuesState.venues);
  fillVenueSelect(shareVenueSelect, venuesState.venues);

  // Restore si possible
  const acctId =
    (prevAcct && venuesState.venues.some(v => v.id === prevAcct)) ? prevAcct :
    (venuesState.venues[0]?.id || "");

  const shareId =
    (prevShare && venuesState.venues.some(v => v.id === prevShare)) ? prevShare :
    (venuesState.venues[0]?.id || "");

  if (acctVenueSelect) acctVenueSelect.value = acctId;
  if (shareVenueSelect) shareVenueSelect.value = shareId;

  // Afficher code selon le menu Partage
  await updateShareCodeFromShareSelect();
}

  const selVenue = venuesState.venues.find((v) => v.id === venueId) || { id: venueId };

  // rôle pour VISIBILITÉ (admin_full => ok)
  const myRole =
    myProfile?.level === "admin_full" ? "admin" : await loadVenueRoleForMe(venueId);

  await renderShareCode(selVenue, myRole);
}

// ---------- Events ----------
acctVenueSelect?.addEventListener("change", async () => {
  // Ne change pas le partage automatiquement (tu veux deux menus séparés).
  await refreshVenuesUI();
});

shareVenueSelect?.addEventListener("change", async () => {
  // Met à jour immédiatement le code affiché
  await refreshVenuesUI();
});

joinByCodeBtn?.addEventListener("click", async () => {
  try {
    setStatus("Inscription…");
    await joinVenueByCode();
    if (joinCode) joinCode.value = "";
    await refreshVenuesUI();
    setStatus("Inscrit au lieu.");
  } catch (e) {
    setStatus(e?.message || "Erreur inscription.");
  }
});

leaveVenueBtn?.addEventListener("click", async () => {
  try {
    setStatus("Retrait…");
    await leaveSelectedVenue();
    await refreshVenuesUI();
    setStatus("Retiré du lieu.");
  } catch (_) {
    setStatus("Erreur retrait.");
  }
});

copyShareCodeBtn?.addEventListener("click", async () => {
  const txt = (shareCodeValue?.textContent || "").trim();
  if (!txt || txt === "—") return;
  try {
    await navigator.clipboard.writeText(txt);
    setStatus("Code copié.");
  } catch (_) {
    setStatus("Impossible de copier.");
  }
});

createVenueBtn?.addEventListener("click", async () => {
  try {
    setStatus("Création du lieu…");
    await createVenueFlow();
    setStatus("Lieu créé.");
  } catch (e) {
    setStatus(e?.message || "Erreur création lieu.");
  }
});

newVenueName?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    createVenueBtn?.click();
  }
});

saveBtn?.addEventListener("click", async () => {
  try {
    setStatus("Enregistrement…");
    await upsertProfile({
      full_name: cfgFullName?.value || "",
      wants_email: cfgWantsEmail?.value === "true",
      skill_level: cfgSkill?.value || "",
    });

    // affichage seulement
    if (cfgAccess) cfgAccess.value = myProfile?.level === "admin_full" ? "admin_full" : "user";

    await refreshVenuesUI();
    setStatus("OK.");
  } catch (_) {
    setStatus("Erreur enregistrement.");
  }
});

// ---------- Init ----------
async function init() {
  setStatus("Chargement…");
  await refreshSessionIfNeeded();

  if (!hasSession()) {
    window.location.href = "index.html";
    return;
  }

  me = await loadUser();
  if (cfgEmail) cfgEmail.value = me.email || "";

  await loadMyProfile();

  if (cfgFullName) cfgFullName.value = myProfile?.full_name || "";
  if (cfgWantsEmail) cfgWantsEmail.value = String(myProfile?.wants_email ?? true);

  const legacySkill =
    myProfile?.level && myProfile.level !== "admin_full" && myProfile.level !== "user"
      ? myProfile.level
      : "";

  if (cfgSkill) cfgSkill.value = myProfile?.skill_level || legacySkill || "";

  // affichage seulement
  if (cfgAccess) cfgAccess.value = myProfile?.level === "admin_full" ? "admin_full" : "user";

  await refreshVenuesUI();
  setStatus("Prêt.");
}

init();
