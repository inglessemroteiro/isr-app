// Trava de acesso das páginas do desafio (e de qualquer página que a
// inclua). Basta uma linha no <head>, antes do conteúdo:
//
//   <script src="isr-trava.js"></script>
//
// Quem já entrou neste aparelho (aluna ou equipe) passa direto. Quem não
// entrou vai para o login e, depois de entrar, volta para esta página.
(function () {
  // Dentro do app da aluna a página abre num iframe, e quem abriu já
  // passou pelo login. Redirecionar aqui jogaria a tela de entrada
  // dentro do quadro, em cima de uma sessão que já existe.
  try { if (window.self !== window.top) return; } catch (e) { return; }
  try {
    if (localStorage.getItem("isr_aluna_id") || localStorage.getItem("isr_gestao_user")) return;
  } catch (e) {
    // navegador sem armazenamento (modo privado restrito): o login também
    // não conseguiria guardar a sessão e a pessoa ficaria num vai-e-volta
    // sem fim — melhor deixar a página abrir
    return;
  }
  var volta = window.location.pathname + window.location.search;
  window.location.replace("aluna.html?voltar=" + encodeURIComponent(volta));
})();
