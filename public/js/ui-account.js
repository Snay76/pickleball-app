// public/js/ui-account.js
import { apiFetch } from "./api.js";
import { refreshSessionIfNeeded, hasSession, loadUser, clearTokens } from "./auth.js";

let me = null;
let myProfile = null;

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

// Lieux
const joinCode = document.getElementById("joinCode");
const joinByCodeBtn = document.getElementById("joinByCodeBtn");
const acctVenueSelect = document.getElementById("acctVenueSelect");
const leaveVenueBtn = document.getElementById("leaveVenueBtn");

// Partage
const shareBox = document.getElementById("shareBox");
const shareVenueSelect = document.getElementById("shareVenueSelect"); // doit exister dans account.html
const shareCodeValue = document.getElementById("shareCodeValue");
const copyShareCodeBtn = document.getElementById("copyShareCodeBtn");

// Créer un lieu
const newVenueName = document.getElementById("newVenueName"); // doit exister dans account.html
const createVenueBtn = document.getElementById("createVenueBtn"); // doit exister dans account.html

// ---------- State ----------
let venuesState = { venues: [], mode: "members" };

// ---------- Helpers ----------
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function fillSelect(sel, venues) {
  if (!sel) return;
  sel.innerHTML = "";
  for (const v of venues) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name || "(?)";
    sel.appendChild(o);
  }
}

function pickId(prev, venues) {
  if (prev && venues.some((v) => v.id === prev)) return prev;
  return venues?.[0]?.id || "";
}

// ---------- Nav / auth buttons ----------
backBtn?.addEventListener("click", () => (window.location.href = "index.html"));

logoutBtn?.addEventListener("click", () => {
  clearTokens();
  window.location.href = "index.html";
});

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

  // Nouveau schema (skill_level)
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
    // Legacy: level = skill
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
    return { venues: venues.map((v) => ({ ...v, my_role: "player" })), mode: "legacy" };
  }
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

async function renderShareFromVenueId(venueId) {
  if (!shareBox || !shareCodeValue) return;

  if (!venueId) {
    shareBox.style.display = "none";
    shareCodeValue.textContent = "—";
    return;
  }

  const selVenue = venuesState.venues.find((v) => v.id === venueId) || { id: venueId };
  const myRole = myProfile?.level === "admin_full" ? "admin" : await loadVenueRoleForMe(venueId);

  const visible = canSeeShareCode(myRole);
  shareBox.style.display = visible ? "block" : "none";

  if (!visible) {
    shareCodeValue.textContent = "—";
    return;
  }

  // 1) si déjà présent dans la liste
  const already = String(selVenue.share_code || "").trim();
  if (already) {
    shareCodeValue.textContent = already;
    return;
  }

  // 2) fallback DB
  try {
    const rows = await apiFetch(`/rest/v1/locations?select=share_code&id=eq.${venueId}&limit=1`);
    shareCodeValue.textContent = rows?.[0]?.share_code || "—";
  } catch (_) {
    shareCodeValue.textContent = "—";
  }
}

// IMPORTANT: cette fonction ne doit PAS “revenir à Canada” quand tu changes de lieu
async function refreshVenuesUI({ keepSelection = true } = {}) {
  venuesState = await listMyVenues();

  const prevAcct = keepSelection ? String(acctVenueSelect?.value || "") : "";
  const prevShare = keepSelection ? String(shareVenueSelect?.value || "") : "";

  fillSelect(acctVenueSelect, venuesState.venues);
  fillSelect(shareVenueSelect, venuesState.venues);

  const acctId = pickId(prevAcct, venuesState.venues);
  const shareId = pickId(prevShare, venuesState.venues);

  if (acctVenueSelect) acctVenueSelect.value = acctId;
  if (shareVenueSelect) shareVenueSelect.value = shareId;

  await renderShareFromVenueId(shareId);
}

async function getVenueByShareCode(code) {
  const c = (code || "").trim();
  if (!c) return null;

  const rows = await apiFetch(
    `/rest/v1/locations?select=id,name,share_code,created_by&share_code=eq.${encodeURIComponent(
      c
    )}&limit=1`
  );
  return rows?.[0] || null;
}

// ---------- Player identity (for location_players) ----------
async function ensurePlayerForMe() {
  const fullName = (cfgFullName?.value || me.email || "").trim();
  const email = me.email;

  // Nouveau schema
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

// ---------- Join / Leave ----------
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

  // location_players
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

  // reload sans conserver les anciennes sélections, puis forcer sur le nouveau
  await refreshVenuesUI({ keepSelection: false });
  if (acctVenueSelect) acctVenueSelect.value = v.id;
  if (shareVenueSelect) shareVenueSelect.value = v.id;
  await renderShareFromVenueId(v.id);
}

// ---------- Events (IMPORTANT: pas de refreshVenuesUI() sur change, sinon ça reset ton choix) ----------
acctVenueSelect?.addEventListener("change", async () => {
  // ne rien faire: ce menu sert juste au "Me retirer du lieu"
});

shareVenueSelect?.addEventListener("change", async () => {
  await renderShareFromVenueId(String(shareVenueSelect?.value || ""));
});

joinByCodeBtn?.addEventListener("click", async () => {
  try {
    setStatus("Inscription…");
    await joinVenueByCode();
    if (joinCode) joinCode.value = "";
    await refreshVenuesUI({ keepSelection: true });
    setStatus("Inscrit au lieu.");
  } catch (e) {
    setStatus(e?.message || "Erreur inscription.");
  }
});

leaveVenueBtn?.addEventListener("click", async () => {
  try {
    setStatus("Retrait…");
    await leaveSelectedVenue();
    await refreshVenuesUI({ keepSelection: false });
    setStatus("Retiré du lieu.");
  } catch (_) {
    setStatus("Erreur retrait.");
  }
});

copyShareCodeBtn?.addEventListener("click", async () => {
  const txt = String(shareCodeValue?.textContent || "").trim();
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

    await refreshVenuesUI({ keepSelection: true });
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

  await refreshVenuesUI({ keepSelection: false });
  setStatus("Prêt.");
}

init();
