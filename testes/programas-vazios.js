// Os programas sem sessões saem da frente de uma vez, e voltam.
//
// Programa sem sessão nenhuma não serve para turma nenhuma: o plano
// das aulas é feito das sessões dele, então escolhê-lo abre o plano
// vazio. Depois da importação de um guia que não pegou, sobram
// dezenas deles na lista — e arquivar um a um, dezenas de vezes, é
// trabalho que o sistema faz.
//
// O que esta suíte guarda:
//   — o filtro "Sem sessões" só aparece quando há algum, e conta certo;
//   — o lote arquiva todos os vazios de uma vez, e NENHUM dos que têm
//     sessão: é o erro que custaria caro, porque arquivar um programa
//     em uso tira ele da escolha das turmas;
//   — o Desfazer devolve exatamente os que o lote pegou, e não "os
//     arquivados", que inclui o que foi arquivado em outro dia;
//   — e o aviso diz, antes do clique, quantos já estão apontados por
//     alguma turma.
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

  // o cenário: três vazios e um com sessão, todos do mesmo nível
  console.log("— o filtro conta os vazios, e só eles —");
  const montou = await p.evaluate(() => {
    const C = window.ISRCRM;
    const nivel = (C.programasEstudoLista({ comArquivados: true })[0] || {}).nivel || "Basics (A1)";
    const ids = [];
    ["Vazio um Teste", "Vazio dois Teste", "Vazio três Teste"].forEach(n => {
      const r = C.salvarProgramaEstudo({ nome: n, nivel: nivel, descricao: "" });
      if (r.ok) ids.push(r.programa.id);
    });
    const cheio = C.salvarProgramaEstudo({ nome: "Com sessão Teste", nivel: nivel, descricao: "" });
    C.salvarSessaoSyllabus({ programaId: cheio.programa.id, nivel: nivel, n: 1,
      titulo: "A primeira sessão", objetivo: "para o programa não ficar vazio" });
    const quantos = C.programasEstudoLista({ comArquivados: true })
      .filter(x => !x.arquivado && !x.sessoes).length;
    return { vaziosIds: ids, cheioId: cheio.programa.id, nivel: nivel, quantos: quantos };
  });
  T("o programa com sessão ficou mesmo com sessão",
    montou.quantos === 3, montou);
  await p.reload();
  await p.waitForTimeout(2800);

  const chips = async () => p.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .map(x => x.textContent.trim())
      .filter(t => /·\s*\d+$/.test(t)));
  const osChips = await chips();
  const chipVazios = osChips.filter(t => /^Sem sessões/.test(t))[0] || "";
  T("o filtro Sem sessões aparece", !!chipVazios, osChips);
  T("e conta os três que eu criei sem sessão",
    /·\s*3$/.test(chipVazios), chipVazios);

  console.log("\n— o lote pega os vazios e deixa o que tem sessão —");
  const clicouFiltro = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Sem sessões/.test(x.textContent.trim()))[0];
    if (!bt) return false;
    bt.click();
    return true;
  });
  T("dá para entrar no filtro", clicouFiltro === true, clicouFiltro);
  await p.waitForTimeout(900);

  const antesDoLote = await p.evaluate(() => {
    const m = document.querySelector("main").innerText.replace(/\s+/g, " ");
    const bt = [...document.querySelectorAll("main button")]
      .map(x => x.textContent.trim());
    return { texto: m, temBotao: bt.some(t => /^Arquivar os 3$/.test(t)) };
  });
  T("o aviso diz quantos são e que turma nenhuma consegue usá-los",
    /3 programas sem sessões/.test(antesDoLote.texto)
    && /Nenhuma turma consegue/.test(antesDoLote.texto), antesDoLote.texto);
  T("e o botão oferece arquivar os três", antesDoLote.temBotao, antesDoLote);

  const arquivou = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Arquivar os 3$/.test(x.textContent.trim()))[0];
    if (!bt) return false;
    bt.click();
    return true;
  });
  T("o lote roda", arquivou === true, arquivou);
  await p.waitForTimeout(1200);

  const depois = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const todos = C.programasEstudoLista({ comArquivados: true });
    const acha = (id) => todos.filter(x => x.id === id)[0] || {};
    return {
      vaziosArquivados: d.vaziosIds.map(id => !!acha(id).arquivado),
      cheioArquivado: !!acha(d.cheioId).arquivado,
      texto: document.querySelector("main").innerText.replace(/\s+/g, " ")
    };
  }, montou);
  T("os três vazios foram arquivados",
    depois.vaziosArquivados.every(x => x === true), depois.vaziosArquivados);
  T("e o que tem sessão continua em pé",
    depois.cheioArquivado === false, depois);
  T("a tela diz o que acabou de acontecer",
    /3 programas arquivados/.test(depois.texto), depois.texto);

  console.log("\n— o desfazer devolve exatamente os que o lote pegou —");
  // um programa arquivado ANTES, à mão, não pode voltar junto: o
  // desfazer é do lote, não de "tudo o que está arquivado"
  const comVelho = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const r = C.salvarProgramaEstudo({ nome: "Arquivado antes Teste", nivel: d.nivel, descricao: "" });
    C.arquivarProgramaEstudo(r.programa.id, true);
    return r.programa.id;
  }, montou);
  const desfez = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => x.textContent.trim() === "Desfazer")[0];
    if (!bt) return false;
    bt.click();
    return true;
  });
  T("o desfazer está lá", desfez === true, desfez);
  await p.waitForTimeout(1200);
  const voltou = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const todos = C.programasEstudoLista({ comArquivados: true });
    const acha = (id) => todos.filter(x => x.id === id)[0] || {};
    return {
      vazios: d.ids.map(id => !!acha(id).arquivado),
      velho: !!acha(d.velho).arquivado
    };
  }, { ids: montou.vaziosIds, velho: comVelho });
  T("os três voltaram", voltou.vazios.every(x => x === false), voltou);
  T("e o que estava arquivado antes continua arquivado",
    voltou.velho === true, voltou);

  console.log("\n— o aviso conta quantos já estão apontados por turma —");
  const emUso = await p.evaluate(() => {
    const C = window.ISRCRM;
    const vazios = C.programasEstudoLista({ comArquivados: true })
      .filter(x => !x.arquivado && !x.sessoes);
    const comTurma = vazios.filter(x => x.turmas.length).length;
    const m = document.querySelector("main").innerText.replace(/\s+/g, " ");
    return { comTurma: comTurma, texto: m };
  });
  if (emUso.comTurma) {
    T("o aviso avisa, antes do clique, que há programa em uso",
      /apontad/.test(emUso.texto) && /troca é feita na tela/.test(emUso.texto),
      emUso.texto);
  } else {
    T("sem programa vazio em uso, o aviso não inventa um",
      !/apontad/.test(emUso.texto), emUso.texto);
  }

  console.log("\n— sem vazio nenhum, o filtro some —");
  const semVazios = await p.evaluate(() => {
    const C = window.ISRCRM;
    C.programasEstudoLista({ comArquivados: true })
      .filter(x => !x.arquivado && !x.sessoes)
      .forEach(x => C.arquivarProgramaEstudo(x.id, true));
    return true;
  });
  await p.reload();
  await p.waitForTimeout(2800);
  const semChip = await chips();
  T("o filtro Sem sessões não aparece quando não há nenhum",
    !semChip.some(t => /^Sem sessões/.test(t)), semChip);

  console.log("\n— dois registros no mesmo milissegundo são dois registros —");
  // ESTE FOI O ACHADO: esta suíte criava quatro programas de uma vez e
  // os quatro saíam com o MESMO id, porque o id era prefixo +
  // Date.now(). Cada um escrevia por cima do anterior, sem erro nenhum
  // na tela — e era isso que a importação de um guia fazia num laço.
  const ids = await p.evaluate(() => {
    const C = window.ISRCRM;
    const feitos = [];
    for (let i = 0; i < 8; i++) {
      const r = C.salvarProgramaEstudo({ nome: "Rajada " + i + " Teste",
        nivel: "Basics (A1)", descricao: "" });
      if (r.ok) feitos.push(r.programa.id);
    }
    const todos = C.programasEstudoLista({ comArquivados: true });
    return { feitos: feitos,
      unicos: [...new Set(feitos)].length,
      naLista: feitos.filter(id => todos.some(x => x.id === id)).length };
  });
  T("oito programas criados em rajada têm oito ids diferentes",
    ids.unicos === 8, ids);
  T("e os oito estão na lista, nenhum escrito por cima",
    ids.naLista === 8, ids);

  T("nenhum erro de página", erros.length === 0, erros);
  await ctx.close();
  await b.close();
  fim();
})();
