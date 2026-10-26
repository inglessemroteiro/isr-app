// A pilha de chamadas de quem acabou de chegar na turma.
//
// A aula é atribuída a quem está na turma HOJE. Quem assume a turma
// hoje herdava a pilha inteira dela: a professora que começou numa
// turma no dia 26/10 abriu o painel com 8 aulas sem chamada, de aulas
// que ela não deu.
//
// A data de entrada na EQUIPE não resolvia: quem está na escola desde
// janeiro e pegou a turma em outubro continuava devendo agosto e
// setembro. O que corta é desde quando a professora é DAQUELA TURMA.
//
// O que esta suíte guarda:
//   — trocar a professora da turma carimba a data sozinho;
//   — aula anterior a essa data não entra na pilha dela;
//   — a data é corrigível na tela de Turmas, para quando a troca foi
//     antes ou depois de hoje;
//   — e o herói do painel volta a ser a próxima aula, como no V5: a
//     pilha não toma a primeira coisa que a professora lê.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1200 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Turmas v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— trocar a professora carimba desde quando —");
  const trocou = await p.evaluate(() => {
    const C = window.ISRCRM;
    const u = C.turmasLista().filter(x => x.teacher)[0];
    const antes = u.teacher;
    const outra = C.equipeLista()
      .filter(m => (m.papeis || []).indexOf("professora") >= 0 && m.nome !== antes)[0];
    if (!outra) return { pulou: true };
    C.updateTurma(u.id, { teacher: outra.nome });
    const depois = C.turmasLista().filter(x => x.id === u.id)[0];
    const hoje = new Date().toISOString().slice(0, 10);
    return { id: u.id, antes, agora: outra.nome,
      desde: depois.teacherDesde, hoje, label: depois.nivel + " · " + depois.turma };
  });
  T("a troca grava a data de hoje", !trocou.pulou && trocou.desde === trocou.hoje, trocou);

  console.log("\n— aula anterior não é dela —");
  const pilha = await p.evaluate((t) => {
    const C = window.ISRCRM;
    // a professora assumiu há três dias
    const d = new Date(); d.setDate(d.getDate() - 3);
    const tresDias = d.toISOString().slice(0, 10);
    C.updateTurma(t.id, { teacherDesde: tresDias });
    const comCorte = (C.chamadasPendentes("", 120) || [])
      .filter(x => x.label === t.label);
    // e agora como se ela estivesse na turma desde sempre
    C.updateTurma(t.id, { teacherDesde: "" });
    const semCorte = (C.chamadasPendentes("", 120) || [])
      .filter(x => x.label === t.label);
    return { tresDias,
      comCorte: comCorte.length, semCorte: semCorte.length,
      anteriores: comCorte.filter(x => x.data < tresDias).length };
  }, trocou);
  T("sem a data, a pilha inteira da turma é dela", pilha.semCorte > 0, pilha);
  T("com a data, as aulas anteriores saem", pilha.comCorte < pilha.semCorte, pilha);
  T("e nenhuma aula anterior à data sobra", pilha.anteriores === 0, pilha);

  console.log("\n— a data é corrigível na tela —");
  await p.reload();
  await p.waitForTimeout(3000);
  await p.evaluate((t) => {
    window.ISRCRM.updateTurma(t.id, { teacherDesde: "2026-09-15" });
  }, trocou);
  await p.reload();
  await p.waitForTimeout(3000);
  await p.evaluate((t) => {
    // abrir a turma, e o editor dentro dela
    const titulo = [...document.querySelectorAll("main span, main a")]
      .filter(x => x.textContent.trim() === t.label)[0];
    if (titulo) titulo.click();
  }, trocou);
  await p.waitForTimeout(1000);
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button, main span")]
      .filter(x => /^Editar$|^editar$/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  const valor = await p.evaluate(() => {
    const d = [...document.querySelectorAll("main input[type=date]")]
      .filter(i => /desta turma desde quando/.test(i.title || ""))[0];
    return d ? { achou: true, valor: d.value, title: d.title } : { achou: false };
  });
  T("o campo de data está no editor da turma", valor.achou, valor);
  T("com a data que está gravada", valor.achou && valor.valor === "2026-09-15", valor);
  T("e dizendo o que ela faz",
    valor.achou && /não entram na pilha de chamadas dela/.test(valor.title), valor);

  console.log("\n— o herói do painel é a próxima aula —");
  const p2 = await ctx.newPage();
  p2.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p2.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p2.waitForTimeout(3200);
  const heroi = await p2.evaluate(() => {
    const t = (document.querySelector("main") || document.body).innerText;
    return t.replace(/\s+/g, " ").slice(0, 400);
  });
  T("o herói não abre com a cobrança da pilha",
    !/aulas? sem chamada[\s\S]{0,40}(Faça a chamada de|Fazer chamada)/i.test(heroi),
    heroi.slice(0, 220));
  T("ele fala de aula: a próxima, ou a falta dela",
    /próxima aula|sem aula marcada|Nenhuma aula/i.test(heroi), heroi.slice(0, 220));

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
