import { apiFetch } from "./api.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, LS_ACCESS, LS_REFRESH, LS_EXPIRES_AT } from "./config.js";

export function saveTokens({ access_token, refresh_token, expires_in }){
  if (access_token) localStorage.setItem(LS_ACCESS, access_token);
  if (refresh_token) localStorage.setItem(LS_REFRESH, refresh_token);
  if (typeof expires_in === "number"){
    const expiresAt = Date.now() + (expires_in * 1000);
    localStorage.setItem(LS_EXPIRES_AT, String(expiresAt));
  }
}
export function clearTokens(){
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_REFRESH);
  localStorage.removeItem(LS_EXPIRES_AT);
}
export function getRefreshToken(){ return localStorage.getItem(LS_REFRESH); }
export function getExpiresAt(){ return Number(localStorage.getItem(LS_EXPIRES_AT) || "0"); }
export function hasSession(){
  return !!localStorage.getItem(LS_ACCESS);
}

export function parseHash(){
  const hash = (window.location.hash || "").startsWith("#") ? window.location.hash.slice(1) : "";
  if(!hash) return null;
  const p = new URLSearchParams(hash);
  return {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    expires_in: p.get("expires_in") ? Number(p.get("expires_in")) : null,
    error: p.get("error"),
    error_description: p.get("error_description")
  };
}

export async function sendMagicLink(email){
  await apiFetch("/auth/v1/otp", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      email,
      create_user: true,
      redirect_to: window.location.origin + window.location.pathname
    })
  });
}

export async function refreshSessionIfNeeded(){
  const access = localStorage.getItem(LS_ACCESS);
  const refresh = getRefreshToken();
  const exp = getExpiresAt();
  if(!access || !refresh) return false;

  const msLeft = exp - Date.now();
  if(msLeft > 5 * 60 * 1000) return true;

  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
  const r = await fetch(url, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh })
  });
  const text = await r.text();
  if(!r.ok) throw new Error(`REFRESH -> ${r.status}\n${text}`);
  const data = JSON.parse(text);
  saveTokens(data);
  return true;
}

export async function loadUser(){
  return await apiFetch("/auth/v1/user");
}
