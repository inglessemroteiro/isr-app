// O repositório de programas da escola, e a escolha do programa na
// turma e na aluna particular.
//
// O que esta suíte guarda:
//   — o que a escola já tinha vira programa sozinho: cada par
//     nível+ciclo com sessões aparece no repositório com nome, e
//     nenhuma turma fica sem o syllabus que já seguia;
//   — criar, renomear, duplicar e arquivar um programa;
//   — duplicar não mexe no original: a turma do ciclo passado continua
//     com o roteiro que teve;
//   — a turma escolhe um programa e o plano dela passa a ser o dele;
//   — a particular escolhe por busca, não por uma parede de pílulas;
//   — a tela vazia diz o que fazer, não o que o sistema não achou.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1500 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  const ler = () => p.evaluate(() => (document.querySelector("main") || document.body)
    .innerText.replace(/\s+/g, " "));

  console.log("— o que a escola já tinha vira programa —");
  await p.goto(P.endereco("ISR - Programas v3.dc.html"));
  await p.waitForTimeout(3000);
  const inicio = await p.evaluate(() => {
    const C = window.ISRCRM;
    const lista = C.programasEstudoLista();
    // uma turma que JÁ tinha syllabus antes do repositório: é nela
    // que se vê se a migração não quebrou nada
    const t = C.turmasLista().filter(x => C.syllabusDoNivel(x.nivel, x.cycle).length)[0]
      || C.turmasLista()[0];
    return { n: lista.length,
      todosComNome: lista.every(x => !!x.nome),
      todosComSessoes: lista.every(x => x.sessoes > 0),
      turma: t ? (t.nivel + " · " + t.turma) : "",
      programaDaTurma: t ? ((C.programaDaTurma(t) || {}).nome || "") : "",
      sessoesDaTurma: t ? C.syllabusDaTurma(t).length : 0,
      planoDaTurma: t ? (C.planoSessoes(t.id) || []).length : 0 };
  });
  T("o repositório abre com os programas que já existiam", inicio.n >= 1, inicio);
  T("cada um com nome", inicio.todosComNome, inicio);
  T("e com as sessões dele", inicio.todosComSessoes, inicio);
  T("a turma continua achando o syllabus que já seguia",
    inicio.sessoesDaTurma > 0 && inicio.planoDaTurma > 0, inicio);

  let t = await ler();
  const temBusca = () => p.evaluate(() => [...document.querySelectorAll("main input")]
    .some(x => /Buscar por nome ou n/.test(x.getAttribute("placeholder") || "")));
  T("a tela diz o que é um programa", /roda em quantos ciclos/.test(t), t.slice(0, 200));
  T("e tem busca", await temBusca(), {});

  console.log("\n— criar, renomear e duplicar —");
  const criado = await p.evaluate(() => {
    const C = window.ISRCRM;
    const nivel = C.programasEstudoLista()[0].nivel;
    const r = C.salvarProgramaEstudo({ nome: "Teste · Food & Family", nivel: nivel });
    const semNome = C.salvarProgramaEstudo({ nome: "", nivel: nivel });
    const semNivel = C.salvarProgramaEstudo({ nome: "Teste sem nível", nivel: "" });
    C.salvarSessaoSyllabus({ programaId: r.programa.id, nivel: nivel, ciclo: "", n: 1,
      titulo: "Session one", objetivo: "She can introduce her family." });
    C.salvarSessaoSyllabus({ programaId: r.programa.id, nivel: nivel, ciclo: "", n: 2,
      titulo: "Session two" });
    return { id: r.programa.id, ok: r.ok, semNome: semNome.ok, semNivel: semNivel.ok,
      sessoes: C.syllabusDoPrograma(r.programa.id).length, nivel: nivel };
  });
  T("programa novo nasce com nome e nível", criado.ok === true, criado);
  T("sem nome não nasce", criado.semNome === false, criado);
  T("sem nível também não", criado.semNivel === false, criado);
  T("e as sessões entram nele", criado.sessoes === 2, criado);

  const dup = await p.evaluate((c) => {
    const C = window.ISRCRM;
    const r = C.duplicarProgramaEstudo(c.id, "Teste · Food & Family 2027");
    // mexer na cópia não pode mexer no original
    const copia = C.syllabusDoPrograma(r.programa.id);
    C.salvarSessaoSyllabus({ id: copia[0].id, programaId: r.programa.id, nivel: c.nivel,
      ciclo: "", n: 1, titulo: "Mudou só na cópia" });
    const orig = C.syllabusDoPrograma(c.id);
    return { ok: r.ok, nCopia: copia.length, tituloOriginal: orig[0].titulo,
      tituloCopia: C.syllabusDoPrograma(r.programa.id)[0].titulo, copiaId: r.programa.id };
  }, criado);
  T("duplicar leva as sessões junto", dup.ok === true && dup.nCopia === 2, dup);
  T("e mexer na cópia não mexe no original",
    dup.tituloOriginal === "Session one" && dup.tituloCopia === "Mudou só na cópia", dup);

  const arq = await p.evaluate((d) => {
    const C = window.ISRCRM;
    C.arquivarProgramaEstudo(d.copiaId, true);
    const naLista = C.programasEstudoLista().some(x => x.id === d.copiaId);
    const comArquivados = C.programasEstudoLista({ comArquivados: true })
      .filter(x => x.id === d.copiaId)[0];
    const sessoesVivas = C.syllabusDoPrograma(d.copiaId).length;
    C.arquivarProgramaEstudo(d.copiaId, false);
    return { naLista, arquivado: !!(comArquivados && comArquivados.arquivado), sessoesVivas };
  }, dup);
  T("arquivar tira da lista de escolha", arq.naLista === false, arq);
  T("mas não apaga as sessões", arq.sessoesVivas === 2, arq);

  console.log("\n— a turma escolhe o programa —");
  const naTurma = await p.evaluate((c) => {
    const C = window.ISRCRM;
    const t = C.turmasLista().filter(x => x.nivel === c.nivel)[0];
    const antes = C.syllabusDaTurma(t).length;
    C.definirProgramaDaTurma(t.id, c.id);
    const t2 = C.turmasLista().filter(x => x.id === t.id)[0];
    const depois = C.syllabusDaTurma(t2).length;
    const nome = (C.programaDaTurma(t2) || {}).nome;
    const plano = (C.planoSessoes(t.id) || []).length;
    return { antes, depois, nome, plano, turmaId: t.id };
  }, criado);
  T("escolher o programa troca as sessões da turma",
    naTurma.depois === 2 && naTurma.nome === "Teste · Food & Family", naTurma);
  T("e o plano da turma passa a ser o dele", naTurma.plano >= 2, naTurma);

  console.log("\n— a particular escolhe por busca —");
  const naAluna = await p.evaluate((c) => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => (x.formatos || []).indexOf("particular") >= 0)[0];
    const antes = C.programaDeEstudo(a.id);
    const r = C.salvarProgramaDeEstudo(a.id, c.id);
    const depois = C.programaDeEstudo(a.id);
    const seq = C.sequenciaDaAluna(a.id);
    return { id: a.id, nome: a.nome, antesEscolhido: antes.escolhido, ok: r.ok,
      depois: depois.nome, escolhido: depois.escolhido, sessoes: seq.sessoes.length,
      titulo: seq.programa };
  }, criado);
  T("a escolha fica guardada na ficha dela",
    naAluna.ok === true && naAluna.escolhido === true, naAluna);
  T("e a sequência dela passa a ser a do programa",
    naAluna.sessoes === 2 && naAluna.titulo === "Teste · Food & Family", naAluna);

  await p.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("main div, main button")]
      .filter(x => /^Particulares$/.test(x.textContent.trim()))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1500);
  const painel = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^(Trocar|Escolher o programa)$/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
    return !!bt;
  });
  await p.waitForTimeout(1200);
  t = await ler();
  T("o painel abre o seletor de programa", painel, { painel });
  T("com busca, não com uma parede de pílulas", await temBusca(), {});
  T("e não traz mais a frase do nível “—”",
    !/Não há syllabus para o nível/.test(t), t.slice(0, 500));
  const linhas = await p.evaluate(() => [...document.querySelectorAll("main button")]
    .filter(x => /sess(ão|ões)/.test(x.textContent)).length);
  T("os programas saem em linhas com nome e nível", linhas >= 1, { linhas });

  console.log("\n— trazer os programas de um texto —");
  await p.goto(P.endereco("ISR - Programas v3.dc.html"));
  await p.waitForTimeout(2800);
  // o arquivo dos programas reais da escola tem de ser entendido
  // inteiro: linha que o formato não conhece é programa que entra
  // torto no repositório
  const arquivo = await p.evaluate(async () => {
    const C = window.ISRCRM;
    const r = await fetch("/programas/26-2.txt");
    if (!r.ok) return { achou: false };
    const txt = await r.text();
    const conf = C.conferirImportacao(txt);
    return { achou: true, n: conf.programas.length, avisos: conf.avisos,
      pode: conf.podeImportar, semSessao: conf.programas.filter(x => !x.sessoes).length,
      nomes: conf.programas.map(x => x.nome + " · " + x.nivel) };
  });
  T("o arquivo dos programas reais está no repositório", arquivo.achou, arquivo);
  T("e é entendido inteiro, sem linha solta",
    arquivo.achou && arquivo.avisos.length === 0, arquivo.avisos);
  T("todos os programas dele têm sessões",
    arquivo.achou && arquivo.n > 0 && arquivo.semSessao === 0, arquivo);

  // a tela: colar, conferir, gravar
  const fluxo = await p.evaluate(async () => {
    const bt = [...document.querySelectorAll("main button, header button")]
      .filter(x => /Trazer de um texto/.test(x.textContent))[0];
    if (!bt) return { abriu: false };
    bt.click();
    await new Promise(r => setTimeout(r, 700));
    const ta = document.querySelector("main textarea");
    if (!ta) return { abriu: true, campo: false };
    ta.value = "Programa: Teste de importação\nNível: Basics (A1)\n\n"
      + "S1: Primeira sessão\nObjetivo: Students will be able to try the importer.\n"
      + "Warm-up: abrir a tela (10)\nlinha que ninguem entende\n";
    const conferir = [...document.querySelectorAll("main button")]
      .filter(x => /Conferir o texto/.test(x.textContent))[0];
    conferir.click();
    await new Promise(r => setTimeout(r, 700));
    const txt = document.querySelector("main").innerText;
    const gravar = [...document.querySelectorAll("main button")]
      .filter(x => /^Gravar/.test(x.textContent.trim()))[0];
    const previa = /programa novo/.test(txt);
    const aviso = /não foi entendida/.test(txt);
    if (gravar) gravar.click();
    await new Promise(r => setTimeout(r, 900));
    const C = window.ISRCRM;
    const criado = C.programasEstudoLista().filter(x => x.nome === "Teste de importação")[0];
    return { abriu: true, campo: true, previa, aviso, temGravar: !!gravar,
      criado: !!criado, sessoes: criado ? criado.sessoes : 0,
      feito: /no repositório/.test(document.querySelector("main").innerText) };
  });
  T("a tela abre o campo de colar", fluxo.abriu && fluxo.campo, fluxo);
  T("conferir mostra o que vai ser gravado antes de gravar", fluxo.previa, fluxo);
  T("e avisa a linha que não entendeu", fluxo.aviso, fluxo);
  T("gravar cria o programa com as sessões",
    fluxo.criado && fluxo.sessoes === 1, fluxo);
  T("e a tela diz o que gravou", fluxo.feito, fluxo);

  console.log("\n— quem não é da coordenação não escreve programa —");
  await p.evaluate(() => {
    try {
      localStorage.setItem("isr_gestao_user", JSON.stringify(
        { nome: "Gabriela Teste", perfil: "professora", papeis: ["professora"] }));
    } catch (e) {}
  });
  await p.goto(P.endereco("ISR - Programas v3.dc.html"));
  await p.waitForTimeout(2800);
  const parou = decodeURIComponent(p.url());
  t = await ler();
  T("a professora não entra no repositório",
    /Painel/.test(parou) || /escritos pela coordenação/.test(t), { parou, t: t.slice(0, 160) });
  T("e não vê o formulário de programa novo", !/\+ Novo programa/.test(t), t.slice(0, 200));

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
