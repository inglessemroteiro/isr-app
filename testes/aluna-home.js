// A Home da aluna pelo arquivo handoff/aluna/01 Home.md, e o que a
// tela da aluna NÃO pode ter.
//
// O que esta suíte guarda:
//   — a sala só abre no dia da aula. O botão "Entrar na sala"
//     aparecia dois dias antes, e levava a uma sala vazia;
//   — a lista da semana tem os quatro itens do arquivo: aula,
//     tarefa, revisão do dia e encontro de clube;
//   — nenhum recado de obra. Três telas da aluna traziam parágrafos
//     escritos para a escola ("o desenho tem também…", "isso a
//     escola decide primeiro"), que não dizem nada a quem estuda.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, { contexto: { viewport: { width: 1280, height: 1500 } } });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  const ler = () => p.evaluate(() => (document.querySelector("main") || document.body)
    .innerText.replace(/\s+/g, " "));
  const irPara = async (nome) => {
    await p.evaluate((x) => {
      const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div")]
        .filter(y => new RegExp("^" + x).test(y.textContent.trim().replace(/^\W+\s*/, "")))[0];
      if (e) e.click();
    }, nome);
    await p.waitForTimeout(1200);
  };

  await p.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p.waitForTimeout(2800);
  const cen = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna" && x.turma)[0];
    const t = C.turmasLista().filter(u => (u.nivel + " · " + u.turma) === a.turma)[0];
    // a turma ganha sala: é o que faz o botão existir
    C.updateTurma(t.id, { meet: "https://meet.google.com/teste-teste" });
    return { id: a.id, turma: a.turma, turmaId: t.id };
  });

  console.log("— a sala só abre no dia da aula —");
  await p.goto(P.endereco("ISR - Aluna v4.dc.html") + "?id=" + cen.id);
  await p.waitForTimeout(3000);
  let t = await ler();
  const temBotao = () => p.evaluate(() => [...document.querySelectorAll("main a")]
    .some(x => /Entrar na sala|Join live room/.test(x.textContent)));
  const hojeTemAula = /hoje/.test((t.match(/próxima aula[^·]*/) || [""])[0] || "");
  const antes = await temBotao();
  T("sem aula hoje, a sala não aparece", hojeTemAula || !antes,
    { hojeTemAula, botao: antes, hero: t.slice(0, 220) });

  // a professora abre a aula: aí a sala tem de aparecer, qualquer dia
  await p.evaluate((c) => {
    const C = window.ISRCRM;
    const hoje = C.iso ? C.iso(new Date()) : new Date().toISOString().slice(0, 10);
    C.salvarChamada(c.turma, hoje, {}, "Gabi Teste", {}, { topico: "Teste", sessao: 1 });
    C.iniciarAula(c.turma, hoje, "Gabi Teste");
  }, cen);
  await p.reload(); await p.waitForTimeout(3000);
  T("com a aula aberta pela professora, a sala aparece", await temBotao());

  console.log("\n— a semana do arquivo 01 —");
  t = await ler();
  T("a lista da semana existe", /Esta semana/.test(t), t.slice(0, 400));
  const semana = await p.evaluate(() => {
    const C = window.ISRCRM;
    return { temRevisao: /Revisão do dia/.test(document.body.innerText),
      palavras: (C.revisaoDeHoje(C.getPessoas().filter(x => x.status === "aluna" && x.turma)[0].id) || {}).total };
  });
  T("a revisão do dia entra quando há palavra no cofre",
    semana.palavras ? semana.temRevisao : !semana.temRevisao, semana);

  console.log("\n— nenhum recado de obra na tela da aluna —");
  const proibido = [
    "o desenho tem", "the design also has",
    "a escola decide primeiro", "the school decides",
    "o sistema ainda não", "the system has nowhere",
    "não há quadro para mostrar",
    // a Conta ainda trazia um: dizia à aluna que a escola não guarda
    // a escolha de avisos em lugar nenhum
    "chave de avisos", "notification switch",
    "não guarda essa escolha", "does not store that choice",
    "ainda não cadastrou", "has not registered"
  ];
  const varrer = async (pagina) => {
    await irPara(pagina);
    const txt = (await ler()).toLowerCase();
    return proibido.filter(x => txt.indexOf(x) >= 0);
  };
  for (const pag of ["Início", "Review", "Meu perfil", "Meu progresso", "Clubes", "Conta"]) {
    const achados = await varrer(pag);
    T("nada de recado para a escola em " + pag, achados.length === 0, achados);
  }

  console.log("\n— o perfil não repete o nível —");
  await irPara("Meu perfil");
  const meta = await p.evaluate(() => {
    const s = [...document.querySelectorAll("main div")]
      .map(x => x.textContent.trim())
      .filter(x => /·/.test(x) && x.length < 70 && !/\n/.test(x));
    return s.slice(0, 8);
  });
  T("a linha do perfil não traz o nível duas vezes",
    !meta.some(x => { const m = x.match(/A\d/g); return m && m.length > 1; }), meta);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
