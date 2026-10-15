// ════════════════════════════════════════════════════════════════
// A PORTA DA BASE
//
// Até aqui o navegador falava com o Apps Script direto. O endereço do
// Web App estava escrito em texto puro no crm-data.js, que é um
// arquivo público: quem abrisse o JavaScript do site lia e escrevia a
// escola inteira — nomes, telefones, contratos, pagamentos. O portão
// da gestão não protegia nada disso, porque os dados não passavam
// pelo portão.
//
// Agora passam por aqui. Esta função:
//
//   1. confere quem está pedindo — o Netlify Identity preenche o
//      context.clientContext.user quando a chamada traz o token da
//      pessoa, e não há como forjar isso do lado do navegador;
//   2. aceita só as ações do sistema, uma lista fechada;
//   3. fala com o Apps Script usando um endereço e uma chave que
//      ficam no servidor e que o navegador nunca vê.
//
// Variáveis no Netlify (Site configuration → Environment variables):
//   ISR_BASE_URL     o Web App do banco central (termina em /exec).
//                    É o mesmo endereço que hoje está no crm-data.js;
//                    quando o Apps Script for republicado com endereço
//                    novo, é só trocar aqui.
//   ISR_BASE_CHAVE   (opcional por enquanto) vai junto no pedido ao
//                    Apps Script. Quando o Apps Script passar a
//                    exigi-la, o navegador já não terá como chamar
//                    direto — que é o objetivo.
//
// Endereço:  POST /.netlify/functions/base
// Corpo:     { "action": "sistemaLoad" }  ou
//            { "action": "sistemaSave", "data": { … } }
// Cabeçalho: Authorization: Bearer <token do Identity>
// ════════════════════════════════════════════════════════════════

const URL_BASE = process.env.ISR_BASE_URL;
const CHAVE = process.env.ISR_BASE_CHAVE || "";

// Lista fechada, e de propósito: a função não é um túnel para o Apps
// Script inteiro. As ações que o Zapier usa (novoCadastro,
// assinaturaEvento) não entram aqui — quem chama aquelas é máquina, e
// elas têm o caminho delas.
const LEITURAS = ["sistemaLoad", "cadastrosPendentes", "atividadesPendentes",
                  "assinaturasPendentes"];
const ESCRITAS = ["sistemaSave", "cadastroProcessado", "atividadeProcessada",
                  "assinaturaProcessada"];

const cabecalhos = { "Content-Type": "application/json" };
const resposta = (statusCode, corpo) =>
  ({ statusCode, headers: cabecalhos, body: JSON.stringify(corpo) });

exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cabecalhos, body: "" };
  if (event.httpMethod !== "POST") return resposta(405, { ok: false, erro: "use POST" });

  // ── quem está pedindo ──
  // Sem Identity configurado no site, clientContext vem vazio. Recusar
  // é o certo: melhor a sincronização falhar e aparecer o erro na tela
  // do que a base ficar aberta sem ninguém perceber.
  const usuario = context && context.clientContext && context.clientContext.user;
  if (!usuario || !usuario.email)
    return resposta(401, { ok: false, erro: "entre na gestão para falar com a base" });

  if (!URL_BASE)
    return resposta(500, { ok: false, erro: "falta configurar ISR_BASE_URL no Netlify" });

  let corpo = {};
  try { corpo = JSON.parse(event.body || "{}"); } catch (e) {}
  const action = String(corpo.action || "");
  const eLeitura = LEITURAS.indexOf(action) >= 0;
  const eEscrita = ESCRITAS.indexOf(action) >= 0;
  if (!eLeitura && !eEscrita)
    return resposta(400, { ok: false, erro: "ação não permitida por aqui: " + action });

  const sep = URL_BASE.indexOf("?") >= 0 ? "&" : "?";
  const comChave = CHAVE ? "&chave=" + encodeURIComponent(CHAVE) : "";

  try {
    let r;
    if (eLeitura) {
      r = await fetch(URL_BASE + sep + "action=" + encodeURIComponent(action) + comChave,
        { redirect: "follow" });
    } else {
      r = await fetch(URL_BASE + (CHAVE ? sep + "chave=" + encodeURIComponent(CHAVE) : ""), {
        method: "POST",
        // o Apps Script lê e.postData.contents; text/plain evita o
        // preflight e é o que o sistema sempre mandou
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        // o Apps Script lê body.data numa ação e body.id noutra: o que
        // vier do navegador é repassado como está, sem reempacotar
        body: JSON.stringify(Object.assign({}, corpo, { chave: CHAVE || undefined })),
        redirect: "follow"
      });
    }
    const texto = await r.text();
    // devolvemos o que o Apps Script devolveu, sem reinterpretar: quem
    // sabe ler isso é o crm-data, e traduzir no meio só criaria um
    // segundo lugar para o formato mudar
    return { statusCode: r.ok ? 200 : 502, headers: cabecalhos, body: texto };
  } catch (err) {
    console.error("base:", err);
    return resposta(502, { ok: false, erro: "a base não respondeu" });
  }
};
