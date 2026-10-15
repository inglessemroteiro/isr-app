// Versão publicada do sistema.
//
// Sem isto não há como saber, olhando a tela, se o que está rodando é a
// última versão ou uma cópia guardada pelo navegador. O número aparece no
// canto da barra de navegação e é o que se compara com o que foi publicado.
//
// Atualizar a cada publicação.
window.ISR_VERSAO = {
  numero: "2026.10.15-c",
  data: "15/10/2026",
  nota: "A base sai de trás do navegador: a sincronização passa a ir por uma função que confere o token da pessoa. Criar a ISR_BASE_URL no Netlify com o endereço do banco central e fazer Trigger deploy. Enquanto a função não responder, o caminho antigo continua valendo — nada para"
};
