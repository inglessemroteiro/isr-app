// As sessões do guia importado voltam a aparecer.
//
// O SINTOMA: "importei o PDF e não consigo usar o material."
//
// Toda tela lê as sessões POR programa — syllabusDoPrograma filtra por
// programaId. Sessão cujo programaId não é de nenhum programa
// existente não aparece em lugar nenhum: está gravada, sincronizada e
// invisível, e nenhuma turma consegue usá-la.
//
// Como ela chegou nesse estado: o id de um programa novo era o
// prefixo mais o relógio em milissegundos. Uma importação que criava
// vários programas seguidos dava o MESMO id a todos; o último ficava
// com o id, os outros sumiam da lista, e as sessões deles continuaram
// apontando para um programa que não existe mais. É o "programas com
// zero sessões" com o conteúdo preso atrás.
//
// O gerador de id já foi consertado (testes/programas-vazios.js). Esta
// suíte é o resgate do que ficou para trás:
//   — as sessões órfãs são encontradas e agrupadas por origem;
//   — um clique cria o programa e põe as sessões dentro, com nível,
//     título, etapas e palavras intactos;
//   — a turma passa a conseguir escolher esse programa;
//   — e sessão com programa vivo nunca é confundida com órfã.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1400 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Programas v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— o estado em que o PDF ficou preso —");
  // reproduz o que a colisão de id deixou: sessões apontando para um
  // programa que não está mais na lista
  const montou = await p.evaluate(() => {
    const C = window.ISRCRM;
    const nivel = "Advanced (B2)";
    const fantasma = "pg-que-sumiu-teste";
    for (let n = 1; n <= 4; n++) {
      C.salvarSessaoSyllabus({ programaId: fantasma, nivel: nivel, n: n,
        projeto: "Traditions Teste",
        titulo: "Sessão " + n + " do guia",
        objetivo: "o que a aluna sai sabendo na sessão " + n,
        palavras: ["cutlery", "leftovers"] });
    }
    const soltas = C.sessoesSoltas();
    return {
      fantasma: fantasma, nivel: nivel,
      grupos: soltas.length,
      doGrupo: (soltas.filter(g => g.chave === fantasma)[0] || {}).quantas || 0,
      // o que a tela mostrava antes: nenhum programa com estas sessões
      viaNoPrograma: C.syllabusDoPrograma(fantasma).length,
      naLista: C.programasEstudoLista({ comArquivados: true })
        .some(x => x.id === fantasma)
    };
  });
  T("as quatro sessões foram gravadas", montou.doGrupo === 4, montou);
  T("e o programa delas não está na lista",
    montou.naLista === false, montou);
  T("elas aparecem como grupo solto", montou.grupos >= 1, montou);

  console.log("\n— a tela diz quantas são e oferece o resgate —");
  await p.reload();
  await p.waitForTimeout(2800);
  const naTela = await p.evaluate(() => {
    const m = document.querySelector("main").innerText.replace(/\s+/g, " ");
    const bts = [...document.querySelectorAll("main button")].map(x => x.textContent.trim());
    return { texto: m, botao: bts.filter(t => /^Criar programa com estas 4$/.test(t))[0] || "" };
  });
  T("o aviso conta as sessões sem programa",
    /4 sessões sem programa/.test(naTela.texto), naTela.texto.slice(0, 300));
  T("e explica por que nenhuma turma consegue usá-las",
    /nenhuma turma consegue usá-las/.test(naTela.texto), naTela.texto.slice(0, 600));
  T("mostra o nível e o projeto do grupo",
    /Advanced \(B2\)/.test(naTela.texto) && /Traditions Teste/.test(naTela.texto),
    naTela.texto.slice(0, 900));
  T("e os títulos das primeiras sessões",
    /Sessão 1 do guia/.test(naTela.texto), naTela.texto.slice(0, 900));
  T("o botão do resgate está lá", !!naTela.botao, naTela);

  console.log("\n— um clique devolve o conteúdo ao plano —");
  const clicou = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Criar programa com estas 4$/.test(x.textContent.trim()))[0];
    if (!bt) return false;
    bt.click();
    return true;
  });
  T("o resgate roda", clicou === true, clicou);
  await p.waitForTimeout(1400);

  const depois = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const pg = C.programasEstudoLista({ comArquivados: true })
      .filter(x => x.nome === "Traditions Teste")[0] || null;
    const ss = pg ? C.syllabusDoPrograma(pg.id) : [];
    return {
      criou: !!pg,
      nome: pg ? pg.nome : "", nivel: pg ? pg.nivel : "",
      quantas: ss.length,
      numeros: ss.map(s => s.n),
      titulo1: (ss[0] || {}).titulo || "",
      // o conteúdo tem de chegar inteiro, não só o número da sessão
      objetivo1: (ss[0] || {}).objetivo || "",
      palavras1: ((ss[0] || {}).palavras || []).length,
      etapas1: ((ss[0] || {}).etapas || []).length,
      aindaSoltas: C.sessoesSoltas().filter(g => g.chave === d.fantasma).length
    };
  }, montou);
  T("o programa foi criado com o nome do projeto",
    depois.criou && depois.nome === "Traditions Teste", depois);
  T("e com o nível das sessões", depois.nivel === "Advanced (B2)", depois);
  T("as quatro sessões estão dentro dele", depois.quantas === 4, depois);
  T("na ordem", depois.numeros.join(",") === "1,2,3,4", depois);
  T("com o título intacto", /Sessão 1 do guia/.test(depois.titulo1), depois);
  T("com o objetivo intacto", /sai sabendo/.test(depois.objetivo1), depois);
  T("com as palavras intactas", depois.palavras1 === 2, depois);
  T("e com as etapas da aula", depois.etapas1 > 0, depois);
  T("o grupo solto deixa de existir", depois.aindaSoltas === 0, depois);

  console.log("\n— e a turma passa a poder escolher esse programa —");
  const naTurma = await p.evaluate(() => {
    const C = window.ISRCRM;
    const pg = C.programasEstudoLista()
      .filter(x => x.nome === "Traditions Teste")[0];
    const u = C.turmasLista()[0];
    const r = C.definirProgramaDaTurma(u.id, pg.id);
    const depois = C.turmasLista().filter(x => x.id === u.id)[0];
    const prog = C.programaDaTurma(depois);
    return { ok: !!(r && r.ok !== false), aponta: depois.programaId === pg.id,
      sessoesNoPlano: prog ? C.syllabusDoPrograma(prog.id).length : 0 };
  });
  T("a turma aponta para o programa resgatado", naTurma.aponta, naTurma);
  T("e o plano das aulas tem as quatro sessões",
    naTurma.sessoesNoPlano === 4, naTurma);

  console.log("\n— sessão de programa vivo nunca é tratada como solta —");
  const vivas = await p.evaluate(() => {
    const C = window.ISRCRM;
    const soltas = C.sessoesSoltas();
    const vivos = {};
    C.programasEstudoLista({ comArquivados: true }).forEach(x => { vivos[x.id] = 1; });
    // nenhuma sessão de programa existente pode estar na lista de soltas
    const erradas = soltas.filter(g => vivos[g.chave]).length;
    // e as sessões dos programas de exemplo continuam todas no lugar
    const exemplo = C.programasEstudoLista()
      .filter(x => x.sessoes > 0).length;
    return { erradas: erradas, comSessoes: exemplo };
  });
  T("nenhum programa vivo aparece como grupo solto", vivas.erradas === 0, vivas);
  T("e os programas com sessões continuam com elas",
    vivas.comSessoes > 0, vivas);

  console.log("\n— sem sessão solta, o aviso some —");
  await p.reload();
  await p.waitForTimeout(2800);
  const semAviso = await p.evaluate(() => {
    const C = window.ISRCRM;
    return { soltas: C.sessoesSoltas().length,
      texto: document.querySelector("main").innerText.replace(/\s+/g, " ") };
  });
  T("não há mais sessão solta", semAviso.soltas === 0, semAviso.soltas);
  T("e o cartão não aparece",
    !/sessões sem programa/.test(semAviso.texto), semAviso.texto.slice(0, 300));

  T("nenhum erro de página", erros.length === 0, erros);
  await ctx.close();
  await b.close();
  fim();
})();
