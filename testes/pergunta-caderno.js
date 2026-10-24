// A pergunta que vira tarefa no caderno da aluna, na tela da turma.
//
// O que esta suíte guarda:
//   — a barra de espaço. O roteiro salvava a cada tecla, e salvarPlano
//     apara as pontas do texto como todo lugar onde o dado entra: a
//     tecla seguinte reescrevia o campo sem o espaço recém-digitado, e
//     "What did you learn today?" chegava ao caderno da aluna como
//     "Whatdidyoulearntoday?". Agora o texto em andamento fica no
//     rascunho da tela e só é gravado quando ela sai do campo;
//   — dá para ver quais etapas viram tarefa: a conta no alto do
//     roteiro e o rótulo em cima de cada campo;
//   — o que a professora escreve é o que a aluna lê.
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

  await p.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p.waitForTimeout(2800);
  const cen = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna" && x.turma)[0];
    const t = C.turmasLista().filter(u => (u.nivel + " · " + u.turma) === a.turma)[0];
    const ss = C.planoSessoes(t.id) || [];
    return { turmaId: t.id, sessao: (ss[0] || {}).n, alunaId: a.id, turma: a.turma };
  });

  await p.goto(P.endereco("ISR - Turma v3.dc.html") + "?id=" + cen.turmaId);
  await p.waitForTimeout(3000);
  // abrir o plano e entrar em ajuste
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("button")]
      .filter(x => /^(Plano das aulas|Lesson plans)$/.test(x.textContent.trim()))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1400);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("main button")]
      .filter(x => /^(Ajustar|Adjust)$/.test(x.textContent.trim()))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1400);

  console.log("— a barra de espaço —");
  const campo = await p.$$("input[placeholder*='caderno'], input[placeholder*='notebook']");
  T("o campo da pergunta está na tela", campo.length > 0, { n: campo.length });
  const FRASE = "What did you learn today?";
  if (campo.length) {
    await campo[0].click();
    await campo[0].fill("");
    await p.keyboard.type(FRASE, { delay: 12 });
    await p.waitForTimeout(400);
    const naTela = await campo[0].inputValue();
    T("o que ela digita é o que aparece no campo", naTela === FRASE, { naTela });
    // sair do campo grava
    await p.keyboard.press("Tab");
    await p.waitForTimeout(900);
    const guardado = await p.evaluate((c) => {
      const C = window.ISRCRM;
      const pl = C.planoDaTurma(c.turmaId, c.sessao);
      return (pl.etapas.filter(e => e.pergunta)[0] || {}).pergunta || "";
    }, cen);
    T("e é o que fica guardado quando ela sai do campo", guardado === FRASE, { guardado });
    T("com os espaços no lugar", guardado.indexOf(" ") > 0, { guardado });
  }

  console.log("\n— dá para ver o que vira tarefa —");
  const visao = await p.evaluate(() => {
    const txt = document.body.innerText;
    return {
      conta: /\d+ pergunta[s]? no caderno|no question in the notebook|\d+ question[s]? in the notebook|nenhuma pergunta no caderno/.test(txt),
      explica: /vira tarefa no caderno|becomes a task in the student/.test(txt),
      marcados: (txt.match(/✓ vira tarefa no caderno|✓ becomes a task/g) || []).length,
      semTarefa: (txt.match(/sem pergunta: esta etapa não vira tarefa|no question: this step becomes no task/g) || []).length
    };
  });
  T("o roteiro diz quantas perguntas vão para o caderno", visao.conta, visao);
  T("e explica o que o campo azul faz", visao.explica, visao);
  T("a etapa com pergunta fica marcada", visao.marcados >= 1, visao);
  T("e a etapa sem pergunta diz que não vira tarefa", visao.semTarefa >= 1, visao);

  console.log("\n— e a aluna lê a mesma frase —");
  // a professora publica o plano e abre a aula: é assim que a
  // tarefa chega ao caderno
  await p.evaluate((c) => {
    const C = window.ISRCRM;
    C.publicarPlano(c.turmaId, c.sessao);
    const d = new Date();
    const hoje = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
      + "-" + String(d.getDate()).padStart(2, "0");
    C.salvarChamada(c.turma, hoje, {}, "Gabi Teste", {}, { topico: "Teste", sessao: c.sessao });
    C.iniciarAula(c.turma, hoje, "Gabi Teste");
  }, cen);
  await p.goto(P.endereco("ISR - Aluna v4.dc.html") + "?id=" + cen.alunaId);
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div")]
      .filter(x => /^Meu caderno/.test(x.textContent.trim().replace(/^\W+\s*/, "")))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1600);
  const noCaderno = await p.evaluate(() => document.querySelector("main").innerText);
  T("a pergunta chega ao caderno inteira", noCaderno.indexOf(FRASE) >= 0,
    (noCaderno.match(/What[^\n]*/) || [""])[0]);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
