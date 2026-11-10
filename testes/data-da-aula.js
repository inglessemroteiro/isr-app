// A data em que uma aula é dada, e o programa vazio que esvazia o plano.
//
// 1 · A DATA ERA SEMPRE DEDUZIDA
//
// A data de uma sessão vinha da chamada, quando a aula já tinha
// acontecido, ou de uma projeção sobre o dia da semana da turma,
// quando ainda não. Não havia onde dizer "esta aula vai ser noutro
// dia" — e aula muda de dia o tempo todo: feriado, remarcação,
// reposição, semana de prova. A escola ficava sem jeito de marcar.
//
// 2 · O PROGRAMA VAZIO
//
// A turma segue um programa, e o plano das aulas é feito das sessões
// dele. Apontando para um programa sem sessões, o plano abre vazio —
// sem que nada tenha sido apagado. A tela dizia "0 sessões" em letra
// pequena e mais nada, e a professora ficava procurando o que tinha
// sumido.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1500 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Turmas v3.dc.html"));
  await p.waitForTimeout(2800);

  console.log("— a data marcada vale sobre a projeção —");
  const dados = await p.evaluate(() => {
    const C = window.ISRCRM;
    const u = C.turmasLista().filter(x => (C.planoSessoes(x.id) || []).length > 1)[0];
    const ss = C.planoSessoes(u.id);
    // uma sessão que ainda não foi dada
    const datas = C.datasDasSessoes(u.id);
    const livre = ss.filter(x => !(datas[x.n] || {}).dada)[0];
    const antes = (datas[livre.n] || {}).data || "";
    const r = C.salvarPlano(u.id, livre.n, { data: "2026-12-24" });
    const depois = C.datasDasSessoes(u.id)[livre.n] || {};
    return { turmaId: u.id, n: livre.n, antes: antes, ok: r.ok,
      depois: depois.data, marcada: !!depois.marcada, dada: !!depois.dada };
  });
  T("a sessão tinha data projetada", /^\d{4}-\d{2}-\d{2}$/.test(dados.antes), dados);
  T("marcar a data é aceito", dados.ok === true, dados);
  T("e a data marcada é a que vale",
    dados.depois === "2026-12-24" && dados.marcada === true, dados);

  console.log("\n— e as outras sessões não herdam o buraco —");
  const vizinhas = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const datas = C.datasDasSessoes(d.turmaId);
    const todas = Object.keys(datas).map(k => ({ n: Number(k), data: datas[k].data }));
    const repetidas = {};
    todas.forEach(x => { repetidas[x.data] = (repetidas[x.data] || 0) + 1; });
    return { quantas: todas.length,
      semData: todas.filter(x => !x.data).length,
      aMarcada: (datas[d.n] || {}).data };
  }, dados);
  T("as demais continuam com data", vizinhas.semData === 0, vizinhas);
  T("e a marcada seguiu marcada", vizinhas.aMarcada === "2026-12-24", vizinhas);

  console.log("\n— voltar ao automático devolve a projeção —");
  const voltou = await p.evaluate((d) => {
    const C = window.ISRCRM;
    C.salvarPlano(d.turmaId, d.n, { data: "" });
    const x = C.datasDasSessoes(d.turmaId)[d.n] || {};
    return { data: x.data, marcada: !!x.marcada };
  }, dados);
  T("sem data marcada, a projeção volta",
    voltou.data === dados.antes && voltou.marcada === false, { voltou, antes: dados.antes });

  console.log("\n— data torta é recusada —");
  const torta = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const r = C.salvarPlano(d.turmaId, d.n, { data: "24/12" });
    return { ok: r.ok, erro: r.erro, ficou: (C.datasDasSessoes(d.turmaId)[d.n] || {}).marcada };
  }, dados);
  T("o que não é dia de calendário não entra",
    torta.ok === false && /dia do calendário/.test(torta.erro || ""), torta);
  T("e nada é gravado", !torta.ficou, torta);

  console.log("\n— o campo está na tela da turma —");
  await p.goto(P.endereco("ISR - Turma v3.dc.html") + "?id=" + dados.turmaId + "&sub=plano");
  await p.waitForTimeout(3000);
  const naTela = await p.evaluate(() => ({
    campos: document.querySelectorAll("main input[type=date]").length,
    texto: document.querySelector("main").innerText.replace(/\s+/g, " ")
  }));
  T("há um campo de data no plano da sessão", naTela.campos >= 1, naTela.campos);
  T("com o rótulo do que ele é",
    /dia desta aula|aula dada em/.test(naTela.texto),
    (naTela.texto.match(/.{0,30}(dia desta aula|aula dada em).{0,60}/) || [""])[0]);

  console.log("\n— programa sem sessões diz o que está havendo —");
  const vazio = await p.evaluate(() => {
    const C = window.ISRCRM;
    // uma turma de um nível que JÁ tem programa com sessões: é o
    // caso real, em que existe para onde voltar
    const u = C.turmasLista().filter(x => {
      const pg = C.programaDaTurma(x);
      return pg && (C.syllabusDoPrograma(pg.id) || []).length > 0;
    })[0];
    const atual = C.programaDaTurma(u);
    // um programa novo, do mesmo nível, sem sessão nenhuma
    const r = C.salvarProgramaEstudo({ nome: "Programa Vazio Teste",
      nivel: atual.nivel });
    C.definirProgramaDaTurma(u.id, r.programa.id);
    return { turmaId: u.id, nivel: r.programa.nivel,
      sessoes: (C.planoSessoes(u.id) || []).length };
  });
  await p.goto(P.endereco("ISR - Turma v3.dc.html") + "?id=" + vazio.turmaId + "&sub=plano");
  await p.waitForTimeout(3000);
  const aviso = await p.evaluate(() => ({
    texto: document.querySelector("main").innerText.replace(/\s+/g, " "),
    atalhos: [...document.querySelectorAll("main .isr-selo")]
      .map(x => x.textContent.trim())
      .filter(t => /· \d+ sess/.test(t))
  }));
  T("a tela diz que o programa não tem sessões",
    /não tem sessões/.test(aviso.texto)
      && /plano das aulas abre vazio/.test(aviso.texto),
    (aviso.texto.match(/.{0,20}não tem sessões.{0,90}/) || [""])[0]);
  T("e oferece, do mesmo nível, os que têm",
    aviso.atalhos.length >= 1, aviso.atalhos);

  console.log("\n— e um toque troca para o que tem sessões —");
  const trocou = await p.evaluate(() => {
    const el = [...document.querySelectorAll("main .isr-selo")]
      .filter(x => /· \d+ sess/.test(x.textContent.trim()))[0];
    if (!el) return null;
    el.click();
    return true;
  });
  await p.waitForTimeout(1600);
  const depois = await p.evaluate((turmaId) => ({
    sessoes: (window.ISRCRM.planoSessoes(turmaId) || []).length,
    aindaAvisa: /não tem sessões/.test(document.querySelector("main").innerText)
  }), vazio.turmaId);
  T("a turma passa a ter sessões", trocou === true && depois.sessoes > 0, depois);
  T("e o aviso sai da tela", depois.aindaAvisa === false, depois);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
