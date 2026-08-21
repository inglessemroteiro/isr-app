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
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", preencher);
  else setTimeout(preencher, 0);
  return { aluna: aluna, preencher: preencher, registrar: registrar };
})();
