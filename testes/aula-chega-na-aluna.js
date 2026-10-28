// A aula aberta chega à aluna.
//
// A professora apertou "Começar aula" e a página da aluna não mudou:
// nem abriu o caderno, nem mostrou as perguntas do dia. Três coisas
// diferentes causavam isso, e esta suíte guarda as três.
//
//   1. O NÚMERO DA SESSÃO VINHA SÓ DA CHAMADA.
//      O caderno precisa do número para saber quais perguntas são as
//      de hoje, e esse número era lido da chamada. Mas a chamada é o
//      FIM da aula e "Começar aula" é o começo: quem abre a aula
//      antes de fazer a chamada — ou seja, todo mundo — deixava a
//      aluna com o caderno aberto e nenhuma pergunta dentro.
//      Agora o número vem da chamada, do registro da aula aberta ou
//      da data no plano, nessa ordem.
//
//   2. PUXAR OS DADOS NÃO AVISAVA A TELA.
//      O dado chegava no aparelho da aluna e a página seguia
//      desenhada com o estado velho até alguém recarregar à mão.
//
//   3. A ALUNA SÓ PUXAVA RÁPIDO SE JÁ SOUBESSE DA AULA.
//      O relógio de 20 s do caderno exigia uma aula aberta para
//      rodar — e quem precisa saber que a aula ABRIU é justamente
//      quem ainda não tem aula aberta.
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
  await p.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p.waitForTimeout(2800);

  const PERGUNTA = "Pergunta da suite: what did you cook last weekend?";

  console.log("— o cenário: plano publicado, chamada nenhuma —");
  const cen = await p.evaluate((PERGUNTA) => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna" && x.turma)[0];
    const t = C.turmasLista().filter(u => (u.nivel + " · " + u.turma) === a.turma)[0];
    const ss = C.planoSessoes(t.id) || [];
    const n = (ss[0] || {}).n;
    const plano = C.planoDaTurma(t.id, n);
    // uma etapa marcada, com pergunta: é o que vira tarefa no caderno
    const etapas = (plano.etapas || []).map((e, i) => (i === 0
      ? Object.assign({}, e, { on: true, pergunta: PERGUNTA }) : e));
    C.salvarPlano(t.id, n, { etapas: etapas });
    const pub = C.publicarPlano(t.id, n);
    const datas = C.datasDasSessoes(t.id) || {};
    const data = (datas[n] || {}).data || "";
    return { turmaId: t.id, n: n, turma: a.turma, alunaId: a.id, data: data,
      publicou: pub.ok,
      jaTemChamada: !!C.getChamada(a.turma, data),
      outraSessao: (ss[1] || {}).n || 0 };
  }, PERGUNTA);
  T("o plano da sessão foi publicado", cen.publicou === true, cen);
  T("a sessão tem data no plano da turma", /^\d{4}-\d{2}-\d{2}$/.test(cen.data), cen);
  T("e não existe chamada nessa data", cen.jaTemChamada === false, cen);

  console.log("\n— abrir a aula sem chamada já leva as perguntas —");
  const aberta = await p.evaluate((c) => {
    const C = window.ISRCRM;
    const r = C.iniciarAula(c.turma, c.data, "Gabi Teste", c.n);
    return {
      ok: r.ok, estado: r.aula.estado,
      tarefas: (C.tarefasDaAula(c.turma, c.data) || []).length,
      perguntas: (C.tarefasDaAula(c.turma, c.data) || [])
        .map(t => t.pergunta).filter(Boolean),
      sessaoResolvida: C.sessaoDaAula(c.turma, c.data),
      viva: C.aulaVivaDaAluna(c.alunaId)
    };
  }, cen);
  T("a aula fica ao vivo", aberta.ok && aberta.estado === "ao_vivo", aberta);
  T("as tarefas da aula existem sem chamada nenhuma",
    aberta.tarefas > 0, { tarefas: aberta.tarefas });
  T("e são as perguntas do plano publicado",
    aberta.perguntas.join(" ").indexOf("what did you cook") >= 0, aberta.perguntas);
  T("a sessão é a de onde o botão foi apertado",
    aberta.sessaoResolvida === cen.n, { resolvida: aberta.sessaoResolvida, n: cen.n });
  T("e a aluna recebe a aula com o número da sessão",
    aberta.viva && aberta.viva.sessao === cen.n && aberta.viva.estado === "ao_vivo",
    aberta.viva);

  console.log("\n— de onde sai o número da sessão, em ordem —");
  const ordem = await p.evaluate((c) => {
    const C = window.ISRCRM;
    const r = {};
    // sem o número no registro da aula: sobra a data no plano
    const m = JSON.parse(localStorage.getItem("isr_aula_viva_v1"));
    const k = c.turma + "|" + c.data;
    m[k].sessao = 0;
    localStorage.setItem("isr_aula_viva_v1", JSON.stringify(m));
    r.pelaData = C.sessaoDaAula(c.turma, c.data);
    r.tarefasPelaData = (C.tarefasDaAula(c.turma, c.data) || []).length;
    // com o número no registro: é ele
    m[k].sessao = c.n;
    localStorage.setItem("isr_aula_viva_v1", JSON.stringify(m));
    r.peloRegistro = C.sessaoDaAula(c.turma, c.data);
    // e a chamada manda em cima dos dois: é lá que a professora
    // escreve o número, e é lá que ela o corrige
    if (c.outraSessao) {
      C.salvarChamada(c.turma, c.data, {}, "Gabi Teste", {},
        { topico: "Tópico da suíte", sessao: c.outraSessao });
      r.pelaChamada = C.sessaoDaAula(c.turma, c.data);
    }
    return r;
  }, cen);
  T("sem número gravado, a data no plano resolve",
    ordem.pelaData === cen.n, { pelaData: ordem.pelaData, n: cen.n });
  T("e as perguntas chegam por esse caminho também",
    ordem.tarefasPelaData > 0, ordem);
  T("com número gravado, vale o número",
    ordem.peloRegistro === cen.n, ordem);
  T("e a chamada manda em cima dos dois",
    !cen.outraSessao || ordem.pelaChamada === cen.outraSessao,
    { pelaChamada: ordem.pelaChamada, outra: cen.outraSessao });

  console.log("\n— e a aluna vê a pergunta na página dela —");
  // volta o cenário: a chamada da suíte apontava para outra sessão
  await p.evaluate((c) => {
    const C = window.ISRCRM;
    C.salvarChamada(c.turma, c.data, {}, "Gabi Teste", {},
      { topico: "Tópico da suíte", sessao: c.n });
  }, cen);
  await p.goto(P.endereco("ISR - Aluna v4.dc.html") + "?id=" + cen.alunaId);
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div")]
      .filter(x => /^Meu caderno/.test(x.textContent.trim().replace(/^\W+\s*/, "")))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1800);
  const noCaderno = await p.evaluate(() => document.querySelector("main").innerText);
  T("a pergunta está no caderno dela",
    noCaderno.indexOf("what did you cook") >= 0,
    (noCaderno.match(/Pergunta da suite[^\n]*/) || [""])[0]);
  T("e o caderno está aberto para escrever",
    /aberto|abriu|Responder|escrever/i.test(noCaderno)
      && !/ainda não abriu/i.test(noCaderno),
    (noCaderno.match(/.{0,80}(aberto|ainda não abriu).{0,60}/) || [""])[0]);
  await ctx.close();

  console.log("\n— aberta sem roteiro publicado, a tela diz —");
  // Começar abre o caderno; publicar é o que põe as perguntas dentro
  // dele. Quem aperta só o primeiro deixava a aluna com um caderno
  // aberto e vazio, e nenhuma das duas telas dizia nada.
  const ctx3 = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1200 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p3 = await ctx3.newPage();
  p3.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p3.goto(P.endereco("ISR - Turma v3.dc.html") + "?id=" + cen.turmaId + "&sub=plano");
  await p3.waitForTimeout(3000);
  const semPlano = await p3.evaluate(() => {
    const C = window.ISRCRM;
    // uma sessão da turma que NÃO está publicada
    const u = C.turmasLista().filter(x => document.location.search.indexOf(x.id) >= 0)[0];
    const label = u.nivel + " · " + u.turma;
    const ss = C.planoSessoes(u.id) || [];
    const livre = ss.filter(s => {
      const pl = C.planoDaTurma(u.id, s.n);
      return pl && pl.estado !== "publicada";
    })[0];
    if (!livre) return null;
    const datas = C.datasDasSessoes(u.id) || {};
    return { n: livre.n, data: (datas[livre.n] || {}).data || "", label: label, id: u.id };
  });
  T("existe sessão sem roteiro publicado para o teste", !!semPlano, semPlano);
  if (semPlano) {
    await p3.evaluate((n) => {
      const chip = [...document.querySelectorAll("main span")]
        .filter(x => x.children.length === 2 && x.textContent.trim().indexOf("S" + n) === 0)[0];
      if (chip) chip.click();
    }, semPlano.n);
    await p3.waitForTimeout(1400);
    await p3.evaluate(() => {
      const bt = [...document.querySelectorAll("main button")]
        .filter(x => /Começar aula/.test(x.textContent.trim()))[0];
      if (bt) bt.click();
    });
    await p3.waitForTimeout(1600);
    const aviso = await p3.evaluate(() => (document.querySelector("main") || document.body)
      .innerText.replace(/\s+/g, " "));
    T("a aula abre e a tela avisa que o roteiro não está publicado",
      /roteiro desta sessão não está publicado/.test(aviso)
        && /abre sem pergunta nenhuma/.test(aviso),
      (aviso.match(/.{0,20}roteiro desta sessão.{0,110}/) || [""])[0]);
    T("sem dizer que a aula não abriu",
      !/não abriu|falhou/i.test(aviso), (aviso.match(/.{0,50}não abriu.{0,40}/) || [""])[0]);
    T("e a aula está mesmo ao vivo",
      await p3.evaluate((s) => window.ISRCRM.aulaViva(s.label, s.data).estado,
        semPlano) === "ao_vivo", semPlano);
  }
  await ctx3.close();

  console.log("\n— quem puxa dado novo avisa a tela —");
  // Sem o aviso, a página da aluna recebia a aula aberta e continuava
  // desenhada como antes. Aqui a base é falsa de propósito: o que se
  // mede é o aviso, não o conteúdo.
  let carimbo = "2026-10-28T10:00:00Z";
  const ctx2 = await P.novoContexto(b, {
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  await ctx2.route("**/base-falsa**", r => r.fulfill({ status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { atualizadoEm: carimbo } }) }));
  const p2 = await ctx2.newPage();
  p2.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p2.goto(P.endereco("ISR - Alunas v3.dc.html"));
  await p2.waitForTimeout(1500);
  const avisos = await p2.evaluate(async () => {
    const C = window.ISRCRM;
    // o dado de exemplo nunca fala com base nenhuma, de propósito; a
    // marca é reposta a cada carregamento da página, então ela sai
    // aqui, sem recarregar
    localStorage.removeItem("isr_exemplo_v1");
    localStorage.setItem("isr_backend_url", location.origin + "/base-falsa");
    localStorage.removeItem("isr_sync_em");
    let n = 0;
    window.addEventListener("isr-dados", () => { n++; });
    const puxa = () => new Promise(r => C.carregarDoBackend(() => setTimeout(r, 120)));
    await puxa();
    const primeiro = n;
    await puxa();
    return { primeiro: primeiro, depoisDoIgual: n };
  });
  T("o primeiro dado novo avisa a tela", avisos.primeiro >= 1, avisos);
  T("e puxar a mesma coisa de novo não avisa",
    avisos.depoisDoIgual === avisos.primeiro, avisos);

  carimbo = "2026-10-28T11:30:00Z";
  const comMudanca = await p2.evaluate(async () => {
    const C = window.ISRCRM;
    let n = 0;
    window.addEventListener("isr-dados", () => { n++; });
    await new Promise(r => C.carregarDoBackend(() => setTimeout(r, 120)));
    return n;
  });
  T("servidor mudou, a tela é avisada", comMudanca >= 1, { comMudanca });

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
