// O caderno da aula não se apaga sozinho.
//
// O registro do caderno é uma chave só — pessoaId|turma|data — e três
// pessoas escrevem nela: a aluna grava as RESPOSTAS, a professora
// grava os COMENTÁRIOS, e a aluna ainda grava a ANOTAÇÃO dela sobre a
// aula.
//
// salvarNotaDaAula gravava { texto } por cima do registro inteiro.
// Resultado: a aluna escrever a anotação dela apagava as respostas da
// aula e as correções da professora. Com o texto vazio, apagava a
// chave toda.
//
// Esta suíte prende as três escritas na mesma chave e o caso do
// apagar: a anotação some, o trabalho da aula fica.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", (e) => erros.push(String(e).slice(0, 220)));

  await p.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p.waitForTimeout(2800);

  // ── o cenário: uma aula aberta, uma resposta, um comentário ──
  const cen = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter((x) => x.status === "aluna" && x.turma)[0];
    const data = "2031-03-05";           // data fora de qualquer calendário real
    C.iniciarAula(a.turma, data, "Gabi", 1);
    const r = C.salvarResposta(a.id, a.turma, data, 0, "First, you boil the milk.");
    const c = C.comentarResposta(a.id, a.turma, data, 0, "Boa. Falta o artigo.", "Gabi");
    const dep = C.respostasDaAluna(a.id, a.turma, data);
    return { id: a.id, turma: a.turma, data: data,
      gravouResposta: !!(r && r.ok), gravouComentario: !!(c && c.ok),
      resposta: (dep.respostas["0"] || {}).t || "",
      comentarios: (dep.comentarios["0"] || []).length };
  });
  T("a aula aberta aceita a resposta da aluna", cen.gravouResposta);
  T("a professora comenta a resposta", cen.gravouComentario);
  T("a resposta ficou gravada", cen.resposta === "First, you boil the milk.", cen.resposta);
  T("o comentário ficou gravado", cen.comentarios === 1, cen.comentarios);

  // ── a aluna escreve a anotação dela sobre a aula ──
  const depois = await p.evaluate((c) => {
    const C = window.ISRCRM;
    C.salvarNotaDaAula(c.id, c.turma, c.data, "Achei difícil falar em ordem.");
    const d = C.respostasDaAluna(c.id, c.turma, c.data);
    return { nota: C.notaDaAula(c.id, c.turma, c.data),
      resposta: (d.respostas["0"] || {}).t || "",
      comentarios: (d.comentarios["0"] || []).length };
  }, cen);
  T("a anotação da aluna fica gravada", depois.nota === "Achei difícil falar em ordem.", depois.nota);
  T("a anotação NÃO apaga a resposta dela",
    depois.resposta === "First, you boil the milk.", depois.resposta);
  T("a anotação NÃO apaga o comentário da professora",
    depois.comentarios === 1, depois.comentarios);

  // ── a aluna apaga a anotação ──
  const apagou = await p.evaluate((c) => {
    const C = window.ISRCRM;
    C.salvarNotaDaAula(c.id, c.turma, c.data, "   ");
    const d = C.respostasDaAluna(c.id, c.turma, c.data);
    return { nota: C.notaDaAula(c.id, c.turma, c.data),
      resposta: (d.respostas["0"] || {}).t || "",
      comentarios: (d.comentarios["0"] || []).length };
  }, cen);
  T("apagar a anotação apaga a anotação", apagou.nota === "", apagou.nota);
  T("apagar a anotação NÃO apaga a resposta",
    apagou.resposta === "First, you boil the milk.", apagou.resposta);
  T("apagar a anotação NÃO apaga o comentário", apagou.comentarios === 1, apagou.comentarios);

  // ── a ordem inversa: a anotação primeiro, a aula depois ──
  const inversa = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter((x) => x.status === "aluna" && x.turma)[0];
    const data = "2031-03-12";
    C.salvarNotaDaAula(a.id, a.turma, data, "Antes da aula.");
    C.iniciarAula(a.turma, data, "Gabi", 1);
    C.salvarResposta(a.id, a.turma, data, 0, "My answer.");
    const d = C.respostasDaAluna(a.id, a.turma, data);
    return { nota: C.notaDaAula(a.id, a.turma, data),
      resposta: (d.respostas["0"] || {}).t || "" };
  });
  T("a resposta não apaga a anotação", inversa.nota === "Antes da aula.", inversa.nota);
  T("a anotação anterior não impede a resposta", inversa.resposta === "My answer.", inversa.resposta);

  // ── uma aula sem nada dentro some mesmo ──
  // Registro vazio que fica no armazenamento vira lixo que sincroniza.
  const limpa = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter((x) => x.status === "aluna" && x.turma)[0];
    const data = "2031-03-19";
    C.salvarNotaDaAula(a.id, a.turma, data, "Só a anotação.");
    const antes = !!C.notaDaAula(a.id, a.turma, data);
    C.salvarNotaDaAula(a.id, a.turma, data, "");
    const mapa = JSON.parse(localStorage.getItem("isr_caderno_v1") || "{}");
    return { antes: antes, chave: a.id + "|" + a.turma + "|" + data,
      sobrou: Object.prototype.hasOwnProperty.call(mapa, a.id + "|" + a.turma + "|" + data) };
  });
  T("a anotação sozinha existe antes de ser apagada", limpa.antes);
  T("apagada, a chave sem nada dentro some", limpa.sobrou === false, limpa.chave);

  T("nenhum erro de JavaScript", erros.length === 0, erros.slice(0, 2));
  await b.close();
  fim();
})();
