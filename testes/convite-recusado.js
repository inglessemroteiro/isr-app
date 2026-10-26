// O que a escola lê quando o convite não sai.
//
// O que esta suíte guarda:
//   — a função do Netlify explica a si mesma: fala de chave, de
//     cabeçalho x-isr-chave, de variável de ambiente. Isso chegou
//     inteiro à tela da Equipe — "Sem chave e sem sessão de gestão.
//     Entre no app, ou mande a chave no cabeçalho x-isr-chave" — em
//     cima da ficha de uma professora. A resposta passa a trazer um
//     motivo, e o app traduz;
//   — sessão vencida tem um caminho: entrar de novo. As duas telas
//     que convidam escondem o botão que falharia e mostram esse
//     caminho;
//   — o convite em lote para na primeira recusa por sessão: insistir
//     quarenta vezes não melhora nada;
//   — nenhuma das duas telas fala de criar senha. O convite abre o
//     app.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];

  // a função do Netlify, respondendo como responde quando recusa
  const comResposta = async (corpo, status) => {
    const ctx = await P.novoContexto(b, {
      contexto: { viewport: { width: 1280, height: 1400 } },
      gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
    });
    await ctx.route("**/.netlify/functions/convidar-aluna", r =>
      r.fulfill({ status: status, contentType: "application/json",
        body: JSON.stringify(corpo) }));
    return ctx;
  };
  const comSessao = (p) => p.evaluate(() => {
    localStorage.setItem("isr_gestao_token", JSON.stringify({
      access: "tk-de-teste", refresh: "rf-de-teste", vence: Date.now() + 3600000 }));
  });

  console.log("— o recado traduzido —");
  let ctx = await comResposta({ ok: false, motivo: "sem_sessao",
    erro: "Sem chave e sem sessão de gestão. Entre no app, ou mande a chave "
      + "no cabeçalho x-isr-chave." }, 401);
  let p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Alunas v3.dc.html"));
  await p.waitForTimeout(3000);
  await comSessao(p);

  const traduzido = await p.evaluate(async () => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna" && x.email && x.turma)[0];
    const r = await C.convidarAluna(a.id);
    return r;
  });
  T("a tela não recebe o texto do servidor",
    !/x-isr-chave|ISR_CONVITE_CHAVE|ISR_EQUIPE_EMAILS/.test(traduzido.erro || ""), traduzido);
  T("e sim o que fazer agora",
    /sessão venceu.*Entre de novo/i.test(traduzido.erro || ""), traduzido);
  T("com a marca de que o caminho é entrar de novo",
    traduzido.precisaEntrar === true, traduzido);

  console.log("\n— o aviso aparece na tela, com o caminho —");
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Sem acesso/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Convidar$|^Convidar de novo$/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1600);
  const naTela = await p.evaluate(() => ({
    texto: document.querySelector("main").innerText.replace(/\s+/g, " "),
    entrar: [...document.querySelectorAll("main a")]
      .some(x => /Entrar de novo/.test(x.textContent) && /trocar/.test(x.getAttribute("href") || ""))
  }));
  T("a tela Alunas mostra o recado traduzido",
    /sessão venceu/i.test(naTela.texto), naTela.texto.slice(0, 300));
  T("e o botão de entrar de novo", naTela.entrar, naTela);
  T("sem o texto do servidor em lugar nenhum",
    !/x-isr-chave|cabeçalho/.test(naTela.texto), naTela.texto.slice(0, 300));
  await ctx.close();

  console.log("\n— sem sessão, o botão que falharia não aparece —");
  ctx = await comResposta({ ok: true, convidada: true }, 200);
  p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Alunas v3.dc.html"));
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    localStorage.removeItem("isr_gestao_token");
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Sem acesso/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1400);
  const semSessao = await p.evaluate(() => ({
    convidar: [...document.querySelectorAll("main button")]
      .filter(x => /^Convidar/.test(x.textContent.trim())).length,
    entrar: [...document.querySelectorAll("main a")]
      .some(x => /Entrar de novo/.test(x.textContent)),
    texto: document.querySelector("main").innerText.replace(/\s+/g, " ")
  }));
  T("nenhum botão de convidar fica de pé", semSessao.convidar === 0, semSessao);
  T("e a caixa do lote oferece entrar de novo", semSessao.entrar, semSessao);
  T("dizendo por quê", /sessão venceu/i.test(semSessao.texto), semSessao.texto.slice(0, 300));
  await ctx.close();

  console.log("\n— o lote para na primeira recusa por sessão —");
  ctx = await comResposta({ ok: false, motivo: "sem_sessao", erro: "…" }, 401);
  let chamadas = 0;
  await ctx.route("**/.netlify/functions/convidar-aluna", r => {
    chamadas++;
    return r.fulfill({ status: 401, contentType: "application/json",
      body: JSON.stringify({ ok: false, motivo: "sem_sessao", erro: "…" }) });
  });
  p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Alunas v3.dc.html"));
  await p.waitForTimeout(3000);
  await comSessao(p);
  const lote = await p.evaluate(async () => {
    const C = window.ISRCRM;
    const ids = C.getPessoas()
      .filter(x => x.status === "aluna" && x.email && x.turma).slice(0, 6).map(x => x.id);
    const r = await C.convidarAlunas(ids);
    return { pedidos: ids.length, falhas: r.falhas.length };
  });
  T("a fila tinha mais de uma", lote.pedidos > 1, lote);
  T("e o servidor foi chamado uma vez só", chamadas === 1, { chamadas, lote });
  await ctx.close();

  console.log("\n— a Equipe diz o estado, e não fala de senha —");
  ctx = await comResposta({ ok: true, convidada: true }, 200);
  p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Equipe v3.dc.html"));
  await p.waitForTimeout(3000);
  await comSessao(p);
  await p.reload();
  await p.waitForTimeout(3000);
  const abriu = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button, main span")]
      .filter(x => /^editar$|^Editar$/.test(x.textContent.trim()))[0];
    if (bt) { bt.click(); return true; }
    return false;
  });
  await p.waitForTimeout(1400);
  const eq = await p.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " "));
  T("a ficha da equipe abre", abriu && /Acesso ao sistema/i.test(eq), eq.slice(0, 200));
  T("o bloco diz o estado numa linha",
    /Ainda sem acesso|Convidada em|Sem e-mail na ficha|Sem função no sistema/.test(eq),
    (eq.match(/Acesso ao sistema.{0,200}/) || [""])[0]);
  T("não cita o Netlify Identity", !/Netlify Identity/.test(eq),
    (eq.match(/.{0,80}Netlify Identity.{0,80}/) || [""])[0]);
  T("e não manda ninguém criar senha",
    !/cria a senha|criar a senha|cria a sua senha/i.test(eq),
    (eq.match(/.{0,80}cria[r]? a (sua )?senha.{0,80}/i) || [""])[0]);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
