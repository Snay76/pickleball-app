// 1) Mets tes valeurs ici
const SUPABASE_URL = "https://cehqaxtcfmgjajmmcccz.supabase.co";
const SUPABASE_ANON_KEY = "re_AD2aSkEc_HakFbmU8gFQQ8WBPh9MqtFH6";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
