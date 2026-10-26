// Quem consegue entrar no app, e quem não — a tela Alunas.
//
// O que esta suíte guarda:
//   — três coisas têm de estar de pé para a aluna entrar: e-mail na
//     ficha, convite enviado e acesso liberado (turma ou produto). A
//     escola não tinha onde ver qual das três falta, e a aluna via
//     três mensagens diferentes do lado de fora;
//   — o chip "Sem acesso" conta quem ainda não entrou;
//   — cada linha diz o que falta, e traz o botão de convidar só
//     quando convidar é possível. O convite é para quem já é aluna:
//     botão que sempre falha é pior que botão nenhum;
//   — o convite em lote só alcança quem pode ser convidada.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1400 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  const ler = () => p.evaluate(() => (document.querySelector("main") || document.body)
    .innerText.replace(/\s+/g, " "));

  await p.goto(P.endereco("ISR - Alunas v3.dc.html"));
  await p.waitForTimeout(3200);

  console.log("— as três coisas que faltam —");
  const casos = await p.evaluate(() => {
    const C = window.ISRCRM;
    const alunas = C.getPessoas().filter(x => x.status === "aluna" && x.turma);
    const a = alunas[0], b2 = alunas[1], c = alunas[2];
    // 1 · sem e-mail na ficha
    const emailDe = a.email;
    C.updateLead(a.id, { email: "" });
    const semEmail = C.situacaoDeAcesso(a.id);
    C.updateLead(a.id, { email: emailDe });
    // 2 · com e-mail e turma, nunca convidada
    const semConvite = C.situacaoDeAcesso(b2.id);
    // 3 · sem turma e sem produto
    const turmaDe = c.turma;
    C.setTurmaDaPessoa(c.id, "", "");
    const semAcesso = C.situacaoDeAcesso(c.id);
    C.setTurmaDaPessoa(c.id, turmaDe, c.professora || "");
    // 4 · quem não é aluna não se convida
    const lead = C.getPessoas().filter(x => x.status === "lead" && x.email)[0];
    const doLead = lead ? C.situacaoDeAcesso(lead.id) : null;
    return { semEmail, semConvite, semAcesso, doLead,
      naoEntraram: C.quemNaoEntrou().length };
  });
  T("sem e-mail na ficha, a tela diz isso",
    casos.semEmail.estado === "semEmail" && !casos.semEmail.podeConvidar, casos.semEmail);
  T("e diz o que fazer", /e-mail da matrícula na ficha/.test(casos.semEmail.acao), casos.semEmail);
  T("com e-mail e turma e sem convite, dá para convidar",
    casos.semConvite.estado === "semConvite" && casos.semConvite.podeConvidar === true,
    casos.semConvite);
  T("sem turma nem produto, o convite não resolve",
    casos.semAcesso.estado === "semAcesso" && !casos.semAcesso.podeConvidar, casos.semAcesso);
  T("e a tela manda arrumar a ficha, não convidar",
    /turma ou o produto/.test(casos.semAcesso.acao), casos.semAcesso);
  T("quem ainda é lead não ganha botão de convite",
    !casos.doLead || casos.doLead.podeConvidar === false, casos.doLead);
  T("e há uma lista de quem não entrou", casos.naoEntraram > 0, casos);

  console.log("\n— o chip e a lista —");
  let t = await ler();
  T("o chip \"Sem acesso\" existe, com a contagem", /Sem acesso · \d+/.test(t), t.slice(0, 400));
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("main button")]
      .filter(x => /^Sem acesso/.test(x.textContent.trim()))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1400);
  t = await ler();
  T("a lista mostra o que falta em cada linha", /sem convite/.test(t), t.slice(0, 600));
  const linhas = await p.evaluate(() => {
    const bts = [...document.querySelectorAll("main button")]
      .filter(x => /^Convidar$|^Convidar de novo$/.test(x.textContent.trim()));
    return bts.length;
  });
  T("com o botão de convidar na própria linha", linhas > 0, { linhas });

  console.log("\n— o convite em lote —");
  T("a caixa do lote aparece neste filtro", /Convidar para o app/.test(t), t.slice(0, 300));
  T("e diz quantas nunca foram convidadas",
    /nunca (foi|foram) convidada/.test(t), (t.match(/\d+ alunas? desta lista[^.]*\./) || [""])[0]);
  T("a caixa de datas sai de cena neste filtro",
    !/Início das aulas em lote/.test(t), t.slice(0, 300));

  // o lote só alcança quem pode ser convidada
  const alcance = await p.evaluate(() => {
    const C = window.ISRCRM;
    const txt = document.querySelector("main").innerText;
    const m = txt.match(/Convidar (\d+) alunas?/);
    const noBotao = m ? parseInt(m[1], 10) : -1;
    const podem = C.getPessoas()
      .filter(x => x.status === "aluna" || x.status === "mvs")
      .map(x => C.situacaoDeAcesso(x.id))
      .filter(x => x && x.podeConvidar && x.estado !== "entrou").length;
    return { noBotao, podem };
  });
  T("o botão do lote conta só quem pode ser convidada",
    alcance.noBotao === alcance.podem, alcance);

  console.log("\n— o e-mail do convite está em português —");
  const email = await p.evaluate(async () => {
    const r = await fetch("/email-templates/convite.html");
    if (!r.ok) return { achou: false };
    const h = await r.text();
    // o que a aluna lê é o corpo; o comentário de cima é para quem
    // mexe no arquivo, e cita o texto antigo de propósito
    const corpo = h.replace(/<!--[\s\S]*?-->/g, "");
    return { achou: true, pt: /Criar a minha senha/.test(corpo),
      link: corpo.indexOf("{{ .ConfirmationURL }}") > 0,
      ingles: /You have been invited|Accept the invite/i.test(corpo) };
  });
  T("o texto do convite existe no site", email.achou, email);
  T("está em português e com o botão de criar a senha",
    email.achou && email.pt && !email.ingles, email);
  T("e carrega o link que o Netlify preenche", email.achou && email.link, email);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
