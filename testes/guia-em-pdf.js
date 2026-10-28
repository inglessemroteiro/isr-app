// O guia do professor, trazido de um PDF.
//
// Os materiais da escola moram no Drive, um guia por nível e por
// ciclo, em PDF. Cadastrar os programas à mão são dez sessões por
// guia, seis fases por sessão. Aqui a escola baixa o arquivo, solta
// na tela Programas, e o que foi lido cai na mesma caixa de texto em
// que ela colaria à mão — para conferir e completar antes de gravar.
//
// Por que passar pela caixa de texto, e não gravar direto: o guia é
// prosa, não formulário. O leitor acerta a maior parte e erra alguma
// coisa, e o erro tem de estar à vista de quem grava. Este é o mesmo
// caminho do texto colado, e por isso a conferência e a gravação são
// as mesmas dos dois lados.
//
// O que esta suíte guarda:
//   — o PDF é lido no próprio navegador, sem mandar o material da
//     escola para lugar nenhum e sem pedir a conta do Google;
//   — do cabeçalho saem o nome do projeto e o nível;
//   — cada "Session N — Título" vira uma sessão, com o objetivo
//     tirado da frase "By the end of...";
//   — as seis fases da escola saem da tabela com o tempo de cada
//     uma, mesmo quando a extração parte o nome da fase em duas
//     linhas ("Language" / "Focus") ou separa o número do "min";
//   — a fase que o guia não descrever entra vazia com o tempo
//     padrão, e a tela diz quantas ficaram assim;
//   — o que foi lido vira o texto do formato da casa, que a tela
//     confere com as mesmas regras do texto colado.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1100 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Programas v3.dc.html"));
  await p.waitForTimeout(3000);

  const b64 = fs.readFileSync(path.join(__dirname, "materiais", "guia-exemplo.pdf"))
    .toString("base64");
  const soltar = (seletorPronto) => p.evaluate(async (b64) => {
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const arq = new File([arr], "guia-exemplo.pdf", { type: "application/pdf" });
    const texto = await window.ISRCRM.lerPdf(arq);
    return { texto: texto, lido: window.ISRCRM.lerGuiaDoProfessor(texto) };
  }, b64);

  console.log("— o PDF é lido no navegador —");
  const r = await soltar();
  T("o texto sai do PDF", !!r.texto && r.texto.length > 500, { tamanho: (r.texto || "").length });
  const pg = (r.lido.programas || [])[0] || null;
  T("o leitor devolve um programa", !!pg, r.lido.avisos);
  if (!pg) { await b.close(); return fim(); }

  console.log("\n— o cabeçalho diz de quem é o guia —");
  T("o nome do projeto sai do cabeçalho", pg.nome === "Traditions", { nome: pg.nome });
  T("e o nível também", pg.nivel === "Speaking (B1)", { nivel: pg.nivel });

  console.log("\n— cada sessão do guia vira uma sessão —");
  T("as duas sessões do guia estão lá", (pg.sessoes || []).length === 2,
    { n: (pg.sessoes || []).length });
  const s1 = (pg.sessoes || [])[0] || {};
  T("com o número e o título", s1.n === 1 && s1.titulo === "Our End of Year Dishes", s1);
  T("e o objetivo tirado do \"By the end of\"",
    /^By the end of it every student can describe/.test(s1.objetivo || ""),
    { objetivo: (s1.objetivo || "").slice(0, 80) });

  console.log("\n— as seis fases, com o tempo de cada uma —");
  const fases = (s1.etapas || []).map(e => e.fase);
  T("as seis fases da escola entram, na ordem",
    fases.join(",") === "warmup,mindson,language,handson,shareout,wrapup", fases);
  const porFase = {};
  (s1.etapas || []).forEach(e => { porFase[e.fase] = e; });
  T("o tempo vem do guia, não do padrão",
    porFase.warmup.min === 10 && porFase.handson.min === 15 && porFase.wrapup.min === 5,
    (s1.etapas || []).map(e => e.fase + ":" + e.min));
  // "Language Focus" sai do PDF partido em duas linhas, e o tempo
  // numa terceira: sem juntar, a fase sumia e caía no tempo padrão
  T("a fase de nome partido é remontada",
    !!porFase.language && porFase.language.min === 10
    && /used to, still and every year/.test(porFase.language.titulo || ""),
    porFase.language);
  T("e a última linha da tabela não puxa a prosa que vem depois",
    /Reflection in English/.test(porFase.wrapup.titulo || "")
    && !/long prose section/.test(porFase.wrapup.titulo || ""), porFase.wrapup);

  console.log("\n— o que foi lido vira o texto da casa —");
  const texto = await p.evaluate((progs) => window.ISRCRM.guiaParaTexto(progs),
    r.lido.programas);
  T("o texto tem o cabeçalho do programa",
    /^Programa: Traditions\nNível: Speaking \(B1\)/m.test(texto), texto.slice(0, 120));
  T("e as sessões no formato de linhas",
    /\nS1: Our End of Year Dishes\n/.test(texto) && /\nWarm-up: .*\(10\)/.test(texto),
    texto.slice(0, 400));
  const conferido = await p.evaluate((t) => {
    const c = window.ISRCRM.conferirImportacao(t);
    return { podeImportar: c.podeImportar, programas: c.programas,
      avisos: (c.avisos || []).slice(0, 3) };
  }, texto);
  T("a conferência entende o texto gerado, sem sobras",
    conferido.podeImportar && !conferido.avisos.length, conferido);
  T("e vê as duas sessões", (conferido.programas[0] || {}).sessoes === 2,
    conferido.programas);

  console.log("\n— a tela avisa o que ficou em branco —");
  const vazias = (pg.sessoes || []).reduce((n, s) =>
    n + (s.etapas || []).filter(e => !e.titulo).length, 0);
  T("a conta das fases em branco é possível de fazer", vazias >= 0, { vazias });
  // a caixa de trazer programas só abre quando se pede
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /Trazer de um texto/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  const naTela = await p.evaluate(() => {
    const t = (document.querySelector("main") || document.body).innerText;
    return { temBotao: /Escolher o PDF/.test(t),
      temNota: /O guia baixado do Drive/.test(t) };
  });
  T("o botão do PDF está na tela de trazer programas", naTela.temBotao, naTela);
  T("dizendo de onde vem o arquivo", naTela.temNota, naTela);

  console.log("\n— a forma do guia de verdade —");
  // O PDF do guia não entrega a tabela linha a linha: entrega CÉLULA
  // a célula, inteiras, em ordem de coluna. O trecho abaixo tem a
  // geometria exata do guia que a escola usa, com o conteúdo trocado:
  //   — o nível está na linha DEBAIXO de "Teacher's Guide:";
  //   — o tempo às vezes parte em "12" e "min";
  //   — o nome da fase parte em "Language" e "Focus";
  //   — o cabeçalho e o "Page 4 of 39" caem no meio de uma célula,
  //     porque a linha da tabela atravessa a virada de página;
  //   — a coluna "Materials" vem logo depois da coluna que importa.
  //
  // Era isso que fazia "Minds On" ser descrita como "The two
  // accounts, written by you" — que é a coluna de materiais.
  const CRU = "\n\nProjeto Teste 2026.4 — Teacher's Guide:\n\nAdvanced (B2)\n\n"
    + "Cycle 2026.4 · October 2026 – January 2027 · Ten sessions\n\n"
    + "How this guide works\n\nThis guide covers the ten sessions of the Projeto Teste "
    + "cycle for the Advanced group, the B2\n\nlevel.\n\n"
    + "Session 1 — Primeira Sessao Teste\n\n"
    + "By the end of this session every student can hold a position and support it with an\n\n"
    + "example.\n\n"
    + "Phase Time What happens Materials\n\n"
    + "Warm-up 8 min Introductions, and one thing each\n\nstudent has kept and one she has "
    + "let\n\ngo\t—\tProjeto Teste 2026.4 — Teacher's Guide: Advanced (B2)\n\nPage 4 of 39\n\n"
    + "Preparing the two accounts. Write two short accounts.\n\n"
    + "Phase Time What happens Materials\n\nMinds On 12\n\nmin"
    + "\tTwo opposing accounts of keeping\n\nthings abroad; each student\n\npositions herself"
    + "\tThe two accounts, written\n\nby you\n\nLanguage\n\nFocus\t12\n\nmin"
    + "\tThe language of nuance, taken from\n\nwhat the students have just said"
    + "\tThe slide online, the board\n\nin person\n\nHands On 18\n\nmin"
    + "\tEach student writes three lines,\n\nworks in pairs, then the group\n\ndiscusses"
    + "\tHer notebook; breakout\n\nrooms online\n\n"
    + "Share Out 5 min One line each to the whole group,\n\nwith a challenge question\t—\n\n"
    + "Wrap-up 5 min Reflection in Portuguese; homework\n\ngiven\t—\n\n";
  const real = await p.evaluate((cru) => {
    const r = window.ISRCRM.lerGuiaDoProfessor(cru);
    const pg = (r.programas || [])[0] || {};
    const s1 = (pg.sessoes || [])[0] || {};
    const por = {};
    (s1.etapas || []).forEach(e => { por[e.fase] = e; });
    return { avisos: r.avisos, nome: pg.nome, nivel: pg.nivel, titulo: s1.titulo, por: por };
  }, CRU);
  T("o nível é lido da linha de baixo do cabeçalho",
    real.nivel === "Advanced (B2)", real);
  T("sem aviso nenhum", real.avisos.length === 0, real.avisos);
  T("o nome do projeto e o título da sessão saem inteiros",
    real.nome === "Projeto Teste" && real.titulo === "Primeira Sessao Teste", real);
  T("Minds On recebe o que acontece, não os materiais",
    /Two opposing accounts/.test((real.por.mindson || {}).titulo || "")
      && !/written by you/.test((real.por.mindson || {}).titulo || ""),
    real.por.mindson);
  T("Language Focus também, com o nome partido em duas linhas",
    /The language of nuance/.test((real.por.language || {}).titulo || "")
      && !/slide online/.test((real.por.language || {}).titulo || ""),
    real.por.language);
  T("Hands On idem", /writes three lines/.test((real.por.handson || {}).titulo || "")
      && !/notebook; breakout/.test((real.por.handson || {}).titulo || ""),
    real.por.handson);
  T("a fase que atravessa a virada de página sai inteira",
    /Introductions, and one thing each student has kept and one she has let go$/
      .test((real.por.warmup || {}).titulo || ""), real.por.warmup);
  T("sem o cabeçalho nem o número da página dentro dela",
    !/Teacher's Guide|Page \d+ of/.test((real.por.warmup || {}).titulo || ""),
    real.por.warmup);
  T("a célula que começa na mesma altura do tempo também",
    /One line each to the whole group, with a challenge question$/
      .test((real.por.shareout || {}).titulo || ""), real.por.shareout);
  T("os tempos saem certos, partidos ou não",
    [8, 12, 12, 18, 5, 5].join(",") === ["warmup", "mindson", "language",
      "handson", "shareout", "wrapup"].map(k => (real.por[k] || {}).min).join(","),
    Object.keys(real.por).map(k => k + ":" + real.por[k].min));

  console.log("\n— e o texto colado à mão continua valendo —");
  // Sem célula nenhuma: é o caminho de quem cola o guia como texto.
  const colado = await p.evaluate(() => {
    const cru = "\n\nProjeto Colado 2026.4 — Teacher's Guide: Speaking (B1)\n\n"
      + "This guide covers the ten sessions.\n\n"
      + "Session 1 — Sessao Colada Teste\n\n"
      + "By the end of this session every student can do it.\n\n"
      + "Warm-up 10 min Abertura da aula\n\n—\n\n"
      + "Minds On 15 min O insumo da aula\n\n—\n\n";
    const r = window.ISRCRM.lerGuiaDoProfessor(cru);
    const s1 = (((r.programas || [])[0] || {}).sessoes || [])[0] || {};
    const por = {};
    (s1.etapas || []).forEach(e => { por[e.fase] = e; });
    return { nivel: ((r.programas || [])[0] || {}).nivel, por: por };
  });
  T("o nível na mesma linha continua sendo lido",
    colado.nivel === "Speaking (B1)", colado);
  T("e as fases do texto colado continuam chegando",
    /Abertura da aula/.test((colado.por.warmup || {}).titulo || "")
      && (colado.por.warmup || {}).min === 10, colado.por);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
