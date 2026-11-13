// O catálogo dos clubes numa página aberta, sem login.
//
// A escola quer mostrar os clubes no site dela, com a lotação de
// agora, e um botão por clube que abre o WhatsApp de quem atende com
// a mensagem já escrita.
//
// Quem abre essa página não é aluna: não tem conta, não tem token, e
// não pode ter. Então ela passa por uma porta só — a função
// clubes-publicos —, e essa porta é de leitura, com um recorte
// escolhido à mão.
//
// O QUE ESTA SUÍTE GUARDA, e é a parte que não pode falhar:
//   — clube em rascunho não vaza para a página;
//   — nome de inscrita, link da sala e endereço do local NUNCA saem,
//     porque o link é entrada aberta na aula e o endereço é a casa
//     de alguém;
//   — o nome de quem conduz sai só o primeiro;
//   — a contagem de vagas é a de agora, e vem da mesma base que o app
//     da aluna lê;
//   — sem WhatsApp configurado não há botão, em vez de um botão que
//     abre conversa com ninguém;
//   — e {clube} vira o nome do clube que a pessoa clicou.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const P = require("./preparar.js");

// A função lê ISR_BASE_URL uma vez, ao ser carregada — como toda
// função do Netlify. Por isso o endereço é posto ANTES do require, e
// o caso "sem base" recarrega o módulo com a variável vazia.
const CAMINHO = path.join(__dirname, "..", "netlify", "functions", "clubes-publicos.js");
process.env.ISR_BASE_URL = "https://script.teste.local/exec";
delete process.env.ISR_BASE_CHAVE;
const fn = require(CAMINHO);
function carregarCom(url) {
  delete require.cache[require.resolve(CAMINHO)];
  const antes = process.env.ISR_BASE_URL;
  if (url === "") delete process.env.ISR_BASE_URL;
  else process.env.ISR_BASE_URL = url;
  const mod = require(CAMINHO);
  process.env.ISR_BASE_URL = antes;
  delete require.cache[require.resolve(CAMINHO)];
  return mod;
}

(async () => {
  const { T, fim } = P.placar();
  const erros = [];

  // ── a função, com a base de mentira ────────────────────────────
  console.log("— a porta pública devolve um recorte, não o clube cru —");
  const BASE = {
    atualizadoEm: "2026-11-13T10:00:00.000Z",
    contatoPublico: { nome: "Carla Teste", whatsapp: "+55 11 90000-0000",
      mensagem: "Oi! Estou interessado no clube {clube}, podemos fazer meu nivelamento?" },
    clubes: [
      { id: "cl1", nome: "Movie Lovers", status: "publicado", emoji: "🎬",
        nivel: "A partir do A2", descricao: "Um filme por encontro.",
        professora: "Bárbara Teste Silva", formato: "online",
        dia: "quinta", hora: "20:00", fuso: "America/Sao_Paulo", duracao: "60 min",
        vagas: 8, membros: ["p1", "p2", "p3"], espera: ["p9"],
        link: "https://meet.example.com/sala-secreta",
        local: "Rua de Casa, 100 — apto 42",
        pagos: { p1: "2026-10-01" },
        encontros: [{ data: "2026-11-20", tema: "Cinema Paradiso" },
          { data: "2026-11-27", tema: "Central do Brasil" }] },
      { id: "cl2", nome: "Chef Traditions", status: "rascunho",
        descricao: "Ainda não foi publicado.", vagas: 6, membros: [] },
      { id: "cl3", nome: "Book Club", status: "publicado",
        nivel: "A partir do B1",
        descricao: "Um livro por ciclo.", professora: "Gabi",
        formato: "presencial", dia: "sábado", hora: "10:00",
        vagas: 4, membros: ["p4", "p5", "p6", "p7"],
        local: "Casa da professora", encontros: [] },
      { id: "cl4", nome: "Apagado Teste", status: "publicado", apagado: "2026-10-01",
        vagas: 5, membros: [] }
    ]
  };

  const comBase = async (dados, env) => {
    const antes = global.fetch;
    const mod = (env && env.url !== undefined) ? carregarCom(env.url) : fn;
    global.fetch = async () => ({
      ok: !(env && env.recusa), status: (env && env.recusa) ? 500 : 200,
      json: async () => ({ data: dados }), text: async () => JSON.stringify({ data: dados })
    });
    try {
      const r = await mod.handler({ httpMethod: "GET" });
      return { status: r.statusCode, d: JSON.parse(r.body), headers: r.headers };
    } finally {
      global.fetch = antes;
    }
  };

  const r = await comBase(BASE);
  T("responde 200", r.status === 200 && r.d.ok === true, r.status);
  T("só os clubes publicados saem",
    r.d.clubes.length === 2
    && r.d.clubes.every(c => !/Chef Traditions|Apagado/.test(c.nome)),
    r.d.clubes.map(c => c.nome));
  const cru = JSON.stringify(r.d);
  T("nenhum id de inscrita sai", !/"p1"|"p2"|"p9"/.test(cru), cru.slice(0, 300));
  T("o link da sala não sai", !/meet\.example\.com/.test(cru), cru.slice(0, 300));
  T("o endereço do local não sai",
    !/Rua de Casa|Casa da professora/.test(cru), cru.slice(0, 300));
  T("quem pagou não sai", !/pagos/.test(cru), cru.slice(0, 300));
  T("a lista de espera não sai", !/espera/.test(cru), cru.slice(0, 300));
  const movie = r.d.clubes.filter(c => c.nome === "Movie Lovers")[0];
  T("de quem conduz sai só o primeiro nome",
    movie.professora === "Bárbara" , movie.professora);
  T("a lotação é a de agora",
    movie.vagas === 8 && movie.inscritas === 3 && movie.livres === 5
    && movie.lotado === false, movie);
  const book = r.d.clubes.filter(c => c.nome === "Book Club")[0];
  T("clube cheio é marcado como cheio",
    book.lotado === true && book.livres === 0, book);
  T("os temas dos encontros saem", movie.encontros.length === 2
    && /Cinema Paradiso/.test(movie.encontros[0].tema), movie.encontros);
  T("a ordem é por nome", r.d.clubes[0].nome === "Book Club", r.d.clubes.map(c => c.nome));
  T("o contato vem junto, com só o primeiro nome",
    r.d.contato.whatsapp === "+55 11 90000-0000" && r.d.contato.nome === "Carla",
    r.d.contato);
  T("a resposta pode ser lida de outro domínio",
    r.headers["Access-Control-Allow-Origin"] === "*", r.headers);

  console.log("\n— quando a base não está configurada ou não responde —");
  const semBase = await comBase(BASE, { url: "" });
  T("sem ISR_BASE_URL responde 500 e diz o motivo",
    semBase.status === 500 && semBase.d.motivo === "sem_base", semBase.d);
  const recusou = await comBase(BASE, { recusa: true });
  T("base que recusa vira 502, não página quebrada",
    recusou.status === 502 && recusou.d.motivo === "base_recusou", recusou.d);
  T("e nenhuma dessas respostas traz clube nenhum",
    !semBase.d.clubes && !recusou.d.clubes, { semBase: semBase.d, recusou: recusou.d });

  console.log("\n— os motivos que a função emite estão todos previstos —");
  const fonte = fs.readFileSync(path.join(__dirname, "..", "netlify",
    "functions", "clubes-publicos.js"), "utf8");
  const emitidos = [...fonte.matchAll(/motivo:\s*"([a-z_]+)"/g)].map(m => m[1]);
  const previstos = ["metodo", "sem_base", "base_recusou", "base_fora", "base_demorou"];
  T("nenhum motivo solto",
    emitidos.every(m => previstos.indexOf(m) >= 0), emitidos);

  console.log("\n— o número padrão é um celular brasileiro inteiro —");
  // Número com um dígito a menos abre uma conversa com ninguém, e
  // ninguém descobre até alguém reclamar. Celular do Brasil tem 13
  // dígitos com o país: 55 + DDD de 2 + 9 dígitos.
  const semContato = JSON.parse(JSON.stringify(BASE));
  delete semContato.contatoPublico;
  const padrao = await comBase(semContato);
  const digitos = String(padrao.d.contato.whatsapp).replace(/\D/g, "");
  T("base sem o contato salvo ainda devolve um número",
    !!digitos, padrao.d.contato);
  T("com 13 dígitos", digitos.length === 13, digitos);
  T("começando em 55", digitos.slice(0, 2) === "55", digitos);
  T("e o nono dígito do celular no lugar",
    digitos[4] === "9", digitos);

  console.log("\n— e só GET —");
  const post = await fn.handler({ httpMethod: "POST" });
  T("POST é recusado", post.statusCode === 405, post.statusCode);

  // ── a página, no navegador ─────────────────────────────────────
  console.log("\n— a página desenha os cartões e o botão —");
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1100, height: 1400 } }
  });
  const pg = await ctx.newPage();
  pg.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  // a página chama a função; aqui a resposta é servida pelo teste
  const servir = (corpo, status) => pg.route("**/clubes-publicos*", (rota) =>
    rota.fulfill({ status: status || 200, contentType: "application/json",
      body: JSON.stringify(corpo) }));
  await servir(r.d);
  await pg.goto(P.endereco("catalogo.html"));
  await pg.waitForTimeout(1500);

  const tela = await pg.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    const botoes = [...document.querySelectorAll("a.botao")].map(a => ({
      texto: a.textContent.trim(), href: a.getAttribute("href")
    }));
    return { texto: t, botoes: botoes, cartoes: document.querySelectorAll("article.cartao").length };
  });
  T("os dois clubes publicados viram cartão", tela.cartoes === 2, tela.cartoes);
  T("o nome e a lotação aparecem",
    /Movie Lovers/.test(tela.texto) && /5 vagas/.test(tela.texto), tela.texto.slice(0, 400));
  T("o clube cheio diz que está sem vaga",
    /sem vaga agora/.test(tela.texto), tela.texto.slice(0, 500));
  T("cada cartão tem o botão de conversa", tela.botoes.length === 2, tela.botoes);
  const bMovie = tela.botoes.filter(x => /nivelamento/i.test(decodeURIComponent(x.href || "")))[0];
  T("o botão abre o WhatsApp no número configurado",
    !!bMovie && /^https:\/\/wa\.me\/5511900000000\?/.test(bMovie.href), tela.botoes);
  T("com o nome do clube dentro da mensagem",
    !!bMovie && /Movie Lovers|Book Club/.test(decodeURIComponent(bMovie.href)),
    bMovie && decodeURIComponent(bMovie.href));
  T("e o clube cheio convida para a lista de espera",
    tela.botoes.some(x => /lista de espera/i.test(x.texto)), tela.botoes);

  console.log("\n— os filtros só aparecem quando filtram algo —");
  // Com os dois clubes de níveis diferentes e formatos diferentes, os
  // dois filtros valem. O filtro de uma opção só não filtra nada.
  const comFiltros = await pg.evaluate(() => {
    const grupos = [...document.querySelectorAll(".filtro")].map(f => ({
      rotulo: f.querySelector("span").textContent.trim(),
      opcoes: [...f.querySelectorAll("button")].map(b => b.textContent.trim())
    }));
    return { escondido: document.getElementById("filtros").hidden, grupos: grupos };
  });
  T("os dois filtros aparecem", comFiltros.escondido === false
    && comFiltros.grupos.length === 2, comFiltros);
  T("nível traz as opções que existem, mais \"todos\"",
    (comFiltros.grupos.filter(g => g.rotulo === "nível")[0] || {}).opcoes
      .indexOf("todos") === 0, comFiltros.grupos);
  T("e onde separa online de presencial",
    (comFiltros.grupos.filter(g => g.rotulo === "onde")[0] || {}).opcoes
      .join(",") === "todos,online,presencial", comFiltros.grupos);

  const filtrou = await pg.evaluate(() => {
    const onde = [...document.querySelectorAll(".filtro")]
      .filter(f => f.querySelector("span").textContent.trim() === "onde")[0];
    const bt = [...onde.querySelectorAll("button")]
      .filter(b => b.textContent.trim() === "presencial")[0];
    bt.click();
    // a barra é redesenhada no clique, então a pílula é procurada de
    // novo: o nó de antes já saiu da tela
    const agora = [...document.querySelectorAll(".filtro button")]
      .filter(b => b.textContent.trim() === "presencial")[0];
    return {
      cartoes: document.querySelectorAll("article.cartao").length,
      texto: document.body.innerText.replace(/\s+/g, " "),
      marcado: agora && agora.getAttribute("aria-pressed")
    };
  });
  T("filtrar por presencial deixa só o presencial",
    filtrou.cartoes === 1 && /Book Club/.test(filtrou.texto)
    && !/Movie Lovers/.test(filtrou.texto), filtrou);
  T("e a pílula escolhida fica marcada", filtrou.marcado === "true", filtrou);

  const semResultado = await pg.evaluate(() => {
    // presencial continua marcado; somar um nível que só o online tem
    const nivel = [...document.querySelectorAll(".filtro")]
      .filter(f => f.querySelector("span").textContent.trim() === "nível")[0];
    const bt = [...nivel.querySelectorAll("button")]
      .filter(b => /A2/.test(b.textContent))[0];
    if (bt) bt.click();
    return { cartoes: document.querySelectorAll("article.cartao").length,
      texto: document.body.innerText.replace(/\s+/g, " ") };
  });
  T("cruzamento sem resultado diz isso, em vez de ficar vazio",
    semResultado.cartoes === 0 && /Nenhum clube com esses filtros/.test(semResultado.texto),
    semResultado.texto.slice(0, 300));

  console.log("\n— o cartão diz quando o clube começa —");
  await pg.reload();
  await pg.waitForTimeout(1500);
  const comecaEm = await pg.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    return { texto: t, temContagem: /2 clubes abertos\. Vagas de agora\./.test(t) };
  });
  T("o topo diz quantos clubes há e que a vaga é de agora",
    comecaEm.temContagem, comecaEm.texto.slice(0, 200));
  T("e o cartão com encontro futuro diz quando começa",
    /começa \d+ \w{3}/.test(comecaEm.texto), comecaEm.texto.slice(0, 600));

  console.log("\n— e a data de CADA encontro, para a pessoa se organizar —");
  const agenda = await pg.evaluate(() => {
    const li = [...document.querySelectorAll(".temas li")].map(x => ({
      texto: x.textContent.trim(), passou: x.className === "passou",
      temData: !!x.querySelector("b")
    }));
    return li;
  });
  T("cada encontro vira uma linha com data e tema",
    agenda.length >= 2 && agenda.every(x => x.temData), agenda);
  T("as duas datas do clube aparecem",
    agenda.some(x => /Cinema Paradiso/.test(x.texto))
    && agenda.some(x => /Central do Brasil/.test(x.texto)), agenda);
  T("escritas por extenso, não em formato de banco",
    agenda.every(x => !/\d{4}-\d{2}-\d{2}/.test(x.texto)), agenda);

  console.log("\n— encontro que já passou fica, apagado —");
  const comPassado = JSON.parse(JSON.stringify(r.d));
  comPassado.clubes.filter(c => c.nome === "Movie Lovers")[0].encontros = [
    { n: 1, tema: "Já aconteceu", quando: "2020-03-10" },
    { n: 2, tema: "Ainda vem", quando: "2099-03-10" }
  ];
  await servir(comPassado);
  await pg.reload();
  await pg.waitForTimeout(1500);
  const passados = await pg.evaluate(() =>
    [...document.querySelectorAll(".temas li")].map(x => ({
      texto: x.textContent.trim(), passou: x.className === "passou" })));
  T("o encontro antigo continua na lista",
    passados.some(x => /Já aconteceu/.test(x.texto)), passados);
  T("marcado como passado",
    passados.filter(x => /Já aconteceu/.test(x.texto))[0].passou === true, passados);
  T("e o que ainda vem não é marcado",
    passados.filter(x => /Ainda vem/.test(x.texto))[0].passou === false, passados);
  await servir(r.d);
  await pg.reload();
  await pg.waitForTimeout(1200);

  console.log("\n— só um nível e um formato: nenhum filtro —");
  const umSo = JSON.parse(JSON.stringify(r.d));
  umSo.clubes = umSo.clubes.slice(0, 1);
  await servir(umSo);
  await pg.reload();
  await pg.waitForTimeout(1500);
  const semFiltro = await pg.evaluate(() => ({
    escondido: document.getElementById("filtros").hidden,
    texto: document.body.innerText.replace(/\s+/g, " ")
  }));
  T("com um clube só, a barra de filtros não aparece",
    semFiltro.escondido === true, semFiltro);
  T("e o topo fala no singular",
    /1 clube aberto\./.test(semFiltro.texto), semFiltro.texto.slice(0, 200));

  console.log("\n— sem número configurado, não há botão —");
  await servir(r.d);
  await pg.reload();
  await pg.waitForTimeout(1200);
  const semTel = JSON.parse(JSON.stringify(r.d));
  semTel.contato.whatsapp = "";
  await servir(semTel);
  await pg.reload();
  await pg.waitForTimeout(1500);
  const semBotao = await pg.evaluate(() => ({
    botoes: document.querySelectorAll("a.botao").length,
    cartoes: document.querySelectorAll("article.cartao").length,
    texto: document.body.innerText.replace(/\s+/g, " ")
  }));
  T("os clubes continuam aparecendo", semBotao.cartoes === 2, semBotao);
  T("mas sem botão nenhum", semBotao.botoes === 0, semBotao);
  T("e a página diz que falta configurar o contato",
    /não foi configurado/.test(semBotao.texto), semBotao.texto.slice(-200));

  console.log("\n— quando a função falha, a página explica —");
  await servir({ ok: false, motivo: "base_fora" }, 502);
  await pg.reload();
  await pg.waitForTimeout(1500);
  const falhou = await pg.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " "));
  T("a página não fica girando",
    /Tente de novo em alguns instantes/.test(falhou), falhou.slice(0, 300));
  T("e não mostra cartão nenhum",
    (await pg.evaluate(() => document.querySelectorAll("article.cartao").length)) === 0, falhou);

  console.log("\n— e sem clube publicado a página diz isso —");
  await servir({ ok: true, contato: r.d.contato, clubes: [] });
  await pg.reload();
  await pg.waitForTimeout(1500);
  const vazia = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  T("a página aberta sem clube não fica em branco",
    /Nenhum clube aberto agora/.test(vazia), vazia.slice(0, 300));

  T("nenhum erro de página", erros.length === 0, erros);
  await ctx.close();
  await b.close();
  fim();
})();
