import { SUPABASE_URL, SUPABASE_ANON_KEY, LS_ACCESS } from "./config.js";

export function getAccessToken(){ return localStorage.getItem(LS_ACCESS); }

export async function apiFetch(path, { method="GET", headers={}, body=null } = {}){
  const token = getAccessToken();
  const url = `${SUPABASE_URL}${path}`;

  const finalHeaders = {
    apikey: SUPABASE_ANON_KEY,
    // IMPORTANT: toujours un Authorization, sinon /auth/v1/user peut répondre 401
    Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
    ...headers
  };

  const opts = { method, headers: finalHeaders };
  if(body !== null) opts.body = body;

  let r, text;
  try{
    r = await fetch(url, opts);
    text = await r.text();
  }catch(e){
    throw new Error(`FETCH FAILED: ${e?.message || e}`);
  }

  if(!r.ok){
    throw new Error(`${method} ${path} -> ${r.status}\n${text}`);
  }

  const trimmed = (text || "").trim();
  if(!trimmed) return null;

  // Certaines réponses peuvent être non-JSON (rare mais possible)
  try{
    return JSON.parse(trimmed);
  }catch{
    return trimmed;
  }
}

export function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
