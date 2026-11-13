// ════════════════════════════════════════════════════════════════
// ISR — O CATÁLOGO DOS CLUBES, PARA QUEM AINDA NÃO É ALUNA
//
// O site da escola quer mostrar os clubes abertos com a lotação de
// agora. Quem abre esse site não tem conta, não tem token e não pode
// ter: é uma página pública.
//
// Esta função é a única porta por onde o clube sai do sistema sem
// login. Por isso ela é de LEITURA SÓ, e devolve um recorte escolhido
// à mão — nunca o registro cru do clube.
//
// O QUE SAI:  nome, emoji, nível, descrição, quem conduz (primeiro
//             nome), dia, horário e fuso, formato, duração, quantas
//             vagas e quantas já foram tomadas, e os temas dos
//             encontros.
//
// O QUE NÃO SAI, nunca:  quem são as inscritas, o e-mail ou o
//             WhatsApp de ninguém, o link da sala, o endereço do
//             local, quem está na lista de espera, quem pagou. O
//             link da sala de fora é entrada aberta na aula; o
//             endereço do presencial é a casa de alguém.
//
// Clube em rascunho não aparece: publicar é o gesto que põe o clube
// no catálogo, e esta página respeita o mesmo gesto que o app da
// aluna respeita.
//
// Endereço:  GET /.netlify/functions/clubes-publicos
// ════════════════════════════════════════════════════════════════

const URL_BASE = process.env.ISR_BASE_URL;
const CHAVE = process.env.ISR_BASE_CHAVE || "";

// A página é servida de outro domínio (o site da escola), então o
// navegador exige CORS. É leitura pública: liberar a origem aqui não
// abre nada que a própria página não mostre.
const cabecalhos = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  // A lotação muda quando alguém entra num clube. Cinco minutos de
  // cache tira a Apps Script do caminho de cada visita sem deixar o
  // número velho a ponto de enganar.
  "Cache-Control": "public, max-age=300"
};
const resposta = (statusCode, corpo) =>
  ({ statusCode, headers: cabecalhos, body: JSON.stringify(corpo) });

const texto = (v, max) => String(v === undefined || v === null ? "" : v)
  .trim().slice(0, max || 400);
const primeiroNome = (nome) => texto(nome, 80).split(/\s+/)[0] || "";

function recorte(c) {
  const membros = Array.isArray(c.membros) ? c.membros.length : 0;
  const vagas = parseInt(c.vagas, 10) || 0;
  return {
    id: texto(c.id, 60),
    nome: texto(c.nome, 120),
    emoji: texto(c.emoji, 4),
    nivel: texto(c.nivel, 60),
    descricao: texto(c.descricao, 600),
    // primeiro nome: identifica quem conduz sem publicar o nome
    // completo de uma funcionária numa página aberta
    professora: primeiroNome(c.professora),
    bio: texto(c.bio, 400),
    formato: c.formato === "presencial" ? "presencial" : "online",
    dia: texto(c.dia, 20),
    hora: texto(c.hora, 10),
    fuso: texto(c.fuso, 60),
    duracao: texto(c.duracao, 20),
    vagas: vagas,
    inscritas: membros,
    livres: vagas ? Math.max(0, vagas - membros) : null,
    lotado: vagas ? membros >= vagas : false,
    // só o tema e quando: o encontro não carrega material nem link
    encontros: (Array.isArray(c.encontros) ? c.encontros : [])
      .slice(0, 12)
      .map((e, i) => ({ n: i + 1, tema: texto(e && e.tema, 160),
        quando: texto(e && (e.data || e.quando), 40) }))
      .filter(e => e.tema || e.quando)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200,
      headers: Object.assign({}, cabecalhos, {
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }), body: "" };
  }
  if (event.httpMethod !== "GET") {
    return resposta(405, { ok: false, motivo: "metodo", erro: "use GET" });
  }
  if (!URL_BASE) {
    return resposta(500, { ok: false, motivo: "sem_base",
      erro: "falta configurar ISR_BASE_URL no Netlify" });
  }

  const sep = URL_BASE.indexOf("?") >= 0 ? "&" : "?";
  const comChave = CHAVE ? "&chave=" + encodeURIComponent(CHAVE) : "";

  try {
    // 8 segundos: a lambda morre aos 10, e devolver "a base não
    // respondeu" é melhor do que a página ficar girando até o timeout
    const r = await fetch(URL_BASE + sep + "action=sistemaLoad" + comChave,
      { redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      return resposta(502, { ok: false, motivo: "base_recusou",
        erro: "a base respondeu " + r.status });
    }
    const d = await r.json().catch(() => null);
    const dados = (d && d.data) || d || {};
    const clubes = Array.isArray(dados.clubes) ? dados.clubes : [];
    const publicados = clubes
      .filter(c => c && !c.apagado && c.status === "publicado")
      .map(recorte)
      // o catálogo da escola ordena pelo que foi publicado por último;
      // aqui a ordem é por nome, que é o que faz sentido para quem
      // está vendo os clubes pela primeira vez
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    return resposta(200, {
      ok: true,
      atualizadoEm: texto(dados.atualizadoEm, 40),
      // o contato que a página usa no botão. Mora na base, e não no
      // código, para a escola trocar o número sem publicar o site de
      // novo. Vazio significa "não mostre o botão": melhor um cartão
      // sem botão do que um botão que abre uma conversa com ninguém.
      contato: (function () {
        const c = dados.contatoPublico || {};
        // A base pode não ter o contato ainda — ela só ganha o campo
        // quando alguém salva a configuração pela primeira vez. Até
        // lá vale o padrão, senão a página fica sem botão por uma
        // configuração que ninguém sabia que precisava abrir.
        return {
          nome: primeiroNome(c.nome || "Carla"),
          whatsapp: texto(c.whatsapp || "5511910142216", 30),
          mensagem: texto(c.mensagem || "Oi, Carla! Estou interessado no clube "
            + "{clube}, podemos fazer meu nivelamento?", 300)
        };
      })(),
      clubes: publicados
    });
  } catch (err) {
    const abortou = err && (err.name === "TimeoutError" || err.name === "AbortError");
    console.error("clubes-publicos:", err);
    return resposta(abortou ? 504 : 502, {
      ok: false, motivo: abortou ? "base_demorou" : "base_fora",
      erro: "não foi possível ler os clubes agora"
    });
  }
};
