// Cola das páginas do desafio com o sistema. A página fica atrás do
// login (isr-trava.js), então a identidade da aluna já está no aparelho:
//
//   <script src="isr-trava.js"></script>
//   <script src="./crm-data.js"></script>
//   <script src="./isr-desafio.js"></script>
//
// O que faz:
//   1. Preenche sozinho os campos de nome e e-mail (data-f="nome"/"email").
//   2. ISRDesafio.registrar(texto) — chamado no enviar() da página —
//      registra a resposta da semana no sistema: é o que atualiza a
//      sequência (streak), o ranking e as miles da aluna.
window.ISRDesafio = (function () {
  function aluna() {
    try {
      var C = window.ISRCRM;
      var id = localStorage.getItem("isr_aluna_id");
      if (!C || !id) return null;
      var p = C.getPessoa(id);
      return p ? { id: p.id, nome: p.nome, email: p.email || "" } : null;
    } catch (e) { return null; }
  }
  function preencher() {
    var a = aluna();
    if (!a) return false;
    var setV = function (el, v) {
      if (!el || el.value || !v) return;
      el.value = v;
      try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    };
    setV(document.querySelector('[data-f="nome"]'), a.nome);
    setV(document.querySelector('[data-f="email"]'), a.email);
    return true;
  }
  // A primeira tela tem a linha de identidade (id "ident-linha") e os
  // campos de reserva (id "ident-campos"). Três estados:
  //   aluna logada  → "Você está fazendo o desafio como Renata"
  //   equipe logada → aviso de visualização (a gestão confere a página
  //                   sem parecer que a aluna vai digitar nome e e-mail)
  //   sem sessão    → os campos aparecem como reserva
  function pintarIdentidade() {
    var linha = document.getElementById("ident-linha");
    var campos = document.getElementById("ident-campos");
    if (!linha || !campos) return;
    var a = aluna();
    var eq = null;
    try { eq = JSON.parse(localStorage.getItem("isr_gestao_user")) || null; } catch (e) {}
    if (a) {
      linha.hidden = false; campos.hidden = true;
      linha.innerHTML = 'Você está fazendo o desafio como <b></b> · <a href="aluna.html?trocar">trocar de conta</a>';
      linha.querySelector("b").textContent = String(a.nome || "").split(" ")[0];
    } else if (eq) {
      linha.hidden = false; campos.hidden = true;
      linha.innerHTML = 'Visualização da equipe (<b></b>). A aluna logada vê o nome dela aqui e não digita nada.';
      linha.querySelector("b").textContent = eq.nome || "equipe";
    } else {
      linha.hidden = true; campos.hidden = false;
    }
  }
  function registrar(texto) {
    var a = aluna();
    var C = window.ISRCRM;
    if (!a || !C || !C.programaDaAluna) return false;
    var pg = C.programaDaAluna(a.id);
    if (!pg) return false;
    if (pg.respondeu) return true; // a semana já está registrada — não duplica
    C.responderMissao(pg.id, a.id, pg.semana,
      String(texto || "Concluído pela página do desafio").slice(0, 500));
    return true;
  }
  function iniciar() { preencher(); pintarIdentidade(); }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", iniciar);
  else setTimeout(iniciar, 0);
  return { aluna: aluna, preencher: preencher, registrar: registrar, pintarIdentidade: pintarIdentidade };
})();
