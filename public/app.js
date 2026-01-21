// 1) Mets tes valeurs ici
const SUPABASE_URL = "https://cehqaxctcfmgjajmmcccz.supabase.co";
const SUPABASE_ANON_KEY = "re_Rz5eYjuV_6tvkLzf2QJBApAL7bYq5N1ZK";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const fmtDate = new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" });
const fmtNum = new Intl.NumberFormat("fr-CA");

// 2) Test login magic link
async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://pickleball-app.pages.dev"
    }
  });

  if (error) {
    alert(error.message);
  } else {
    alert("Lien envoyé. Vérifie ton email.");
  }
}

window.sendMagicLink = sendMagicLink;
