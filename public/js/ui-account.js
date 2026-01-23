// public/js/ui-account.js
import { apiFetch } from "./api.js";
import { refreshSessionIfNeeded, hasSession, loadUser, clearTokens } from "./auth.js";

let me = null;
let myProfile = null;
let venuesState = { venues: [], mode: "members" };

// ---------- DOM ----------
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
const shareVenueSelect = document.getElementById("shareVenueSelect");
const shareCodeValue = document.getElementById("shareCodeValue");
const copyShareCodeBtn = document.getElementById("copyShareCodeBtn");

// Créer un lieu
const newVenueName = document.getElementById("newVenueName");
const createVenueBtn = document.getElementById("createVenueBtn");

// ---------- Utils ----------
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function fillSelect(sel, venues) {
  if (!sel) return;
  const current = sel.value || "";
  sel.innerHTML = "";

  for (const v of venues) {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.name || "(?)";
    sel.appendChild(opt);
  }

  // Tente de restaurer le choix précédent si encore valide
  if (current && venues.some(v => v.id === current)) {
    sel.value = current;
  }
}

function firstVenueId() {
  return venuesState.venues?.[0]?.id || "";
}

function getVenueById(id) {
  return venuesState.venues.find(v => v.id === id) || null;
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
  // IMPORTANT: ne jamais écrire "level" depuis le client.
  const payload = {
    user_id: me.id,
    email: me.email,
    full_name,
    wants_email,
    skill_level,
  };

  // Nouveau schema
  try {
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
    // Legacy schema: level = skill
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

// ---------- Venues list ----------
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
        share_code: r.locations?.share_code ?? null,
        created_by: r.locations?.created_by ?? null,
        my_role: r.role || "player",
      }))
      .filter((v) => v.id);

    return { venues, mode: "members" };
  } catch (_) {
    // Legacy fallback
    const venues =
      (await apiFetch(`/rest/v1/locations?select=id,name,share_code,created_by&order=created_at.desc`)) || [];
    return {
      venues: venues.map(v => ({
        id: v.id,
        name: v.name,
        share_code: v.share_code ?? null,
        created_by: v.created_by ?? null,
        my_role: "player",
      })),
      mode: "legacy",
    };
  }
}

// ---------- Roles / Share visibility ----------
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

async function fetchShareCodeFromDB(venueId) {
  const rows = await apiFetch(
    `/rest/v1/locations?select=share_code&id=eq.${venueId}&limit=1`
  );
  return rows?.[0]?.share_code ?? null;
}

async function updateShareUI() {
  if (!shareBox || !shareVenueSelect || !shareCodeValue) return;

  const venueId = shareVenueSelect.value || "";
  if (!venueId) {
    shareBox.style.display = "none";
    shareCodeValue.textContent = "—";
    if (copyShareCodeBtn) copyShareCodeBtn.disabled = true;
    return;
  }

  const myRole = (myProfile?.level === "admin_full") ? "admin" : await loadVenueRoleForMe(venueId);
  const visible = canSeeShareCode(myRole);

  shareBox.style.display = visible ? "block" : "none";
  if (!visible) {
    shareCodeValue.textContent = "—";
    if (copyShareCodeBtn) copyShareCodeBtn.disabled = true;
    return;
  }

  // 1) tente cache venuesState
  let code = getVenueById(venueId)?.share_code ?? null;

  // 2) fallback DB
  if (!code) {
    try {
      code = await fetchShareCodeFromDB(venueId);
    } catch (_) {
      code = null;
    }
  }

  shareCodeValue.textContent = code ? String(code) : "—";
  if (copyShareCodeBtn) copyShareCodeBtn.disabled = !code;
}

// ---------- Player identity / join / leave ----------
async function getVenueByShareCode(code) {
  const c = (code || "").trim();
  if (!c) return null;

  const rows = await apiFetch(
    `/rest/v1/locations?select=id,name,share_code,created_by&share_code=eq.${encodeURIComponent(c)}&limit=1`
  );
  return rows?.[0] || null;
}

async function ensurePlayerForMe() {
  const fullName = (cfgFullName?.value || me.email || "").trim();
  const email = me.email;

  // Nouveau schema (players.user_id/email)
  try {
    const found = await apiFetch(
      `/rest/v1/players?select=id,name,user_id,email&user_id=eq.${me.id}&limit=1`
    );
    if (found?.[0]) return found[0];

    const inserted = await apiFetch(`/rest/v1/players?select=id,name,user_id,email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ name: fullName, user_id: me.id, email, created_by_user_id: me.id }),
    });
    return inserted?.[0] || null;
  } catch (_) {
    // Legacy: match par nom
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

async function joinVenueByCode() {
  const code = joinCode?.value || "";
  const v = await getVenueByShareCode(code);
  if (!v) throw new Error("Code invalide (lieu introuvable).");

  // membership
  try {
    await apiFetch(`/rest/v1/location_members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: v.id, user_id: me.id, role: "player" }),
    });
  } catch (_) {}

  // player attach
  const p = await ensurePlayerForMe();
  if (p?.id) {
    try { await addPlayerToVenue(p.id, v.id); } catch (_) {}
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
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
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
      try { await addPlayerToVenue(p.id, v.id); } catch (_) {}
    }
  } catch (_) {}

  if (newVenueName) newVenueName.value = "";

  await refreshVenuesUI();

  // sélectionne le nouveau lieu dans les 2 menus
  if (acctVenueSelect) acctVenueSelect.value = v.id;
  if (shareVenueSelect) shareVenueSelect.value = v.id;

  await updateShareUI();
}

// ---------- UI refresh (NE PAS l'appeler sur chaque change) ----------
async function refreshVenuesUI() {
  venuesState = await listMyVenues();

  // Remplir les deux selects sans casser la sélection courante
  fillSelect(acctVenueSelect, venuesState.venues);
  fillSelect(shareVenueSelect, venuesState.venues);

  // Si vide, force un default
  if (acctVenueSelect && !acctVenueSelect.value) acctVenueSelect.value = firstVenueId();
  if (shareVenueSelect && !shareVenueSelect.value) shareVenueSelect.value = firstVenueId();

  await updateShareUI();
}

// ---------- Events ----------
backBtn?.addEventListener("click", () => (window.location.href = "index.html"));

logoutBtn?.addEventListener("click", () => {
  clearTokens();
  window.location.href = "index.html";
});

acctVenueSelect?.addEventListener("change", async () => {
  // IMPORTANT: ne pas refresh ici, sinon tu écrases la sélection de l’autre menu.
  // Ici, tu n’as rien à faire (sauf si tu veux afficher autre chose).
});

shareVenueSelect?.addEventListener("change", async () => {
  await updateShareUI();
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
