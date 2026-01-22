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
      if(loginStatus) loginStatus.textContent = "Erreur: " + msg;
      alert("Erreur envoi lien.\n\n" + msg);
    }finally{
      loginBtn.disabled = false;
    }
  });
}
