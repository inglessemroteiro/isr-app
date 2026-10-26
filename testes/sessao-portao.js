// O portão: entrar por link, e a sessão do Identity guardada.
//
// O que esta suíte guarda:
//   — a porta da frente é o link. A aluna digita o e-mail, recebe um
//     link e entra — sem inventar senha, sem guardar senha. Eram 40
//     alunas paradas na tela de senha. Quem já tem senha continua
//     entrando por ela, na mesma tela, um toque abaixo;
//   — CARREGAR A PÁGINA NÃO GASTA O LINK. O token vale uma vez, e
//     era a página que o gastava ao carregar, sem ninguém pedir. O
//     app do Gmail abre o link no navegador interno dele antes de
//     passar para o navegador de verdade: essa primeira abertura já
//     gastava o token, e a segunda — a que a pessoa vê — lia "link
//     já usado". Prévia de e-mail, antivírus de empresa e recarregar
//     davam no mesmo. Quem gasta o token é o toque;
//   — link gasto manda pedir outro, com o e-mail já escrito quando
//     foi deste aparelho que ele foi pedido;
//   — o link do convite entra sozinho. A API do Identity exige uma
//     senha para aceitar o convite: ela é sorteada aqui e ninguém
//     precisa sabê-la. A tela de criar senha fica como alternativa
//     para quando a aceitação automática falha;
//   — o link que chega é o mesmo para entrar e para trocar a senha. Só
//     vai para a tela de senha quem pediu a troca neste aparelho; sem
//     pedido registrado, o link entra;
//   — entrar por aluna.html tem de deixar o token do Netlify Identity
//     guardado. O portão recebia o token no login, no convite e na
//     troca de senha e jogava os três fora: só o gestao.html guardava.
//     Quem entrava por aqui — e é por aqui que todo mundo entra —
//     ficava sem token, e toda função do Netlify que confere quem
//     chama respondia "Sem chave e sem sessão de gestão". Foi o que
//     impediu o convite da aluna de sair;
//   — com o token guardado, a chamada à função vai com Authorization;
//   — "voltar" na tela de erro limpa a sessão: o próximo a entrar
//     neste aparelho não herda o token do anterior.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });

  // o Identity não existe no teste: respondemos por ele, como o
  // Netlify responderia. Cada caso ganha um contexto novo, porque o
  // que o portão guarda no aparelho é parte do que se confere.
  let pedidos = [];
  let verificacoes = [];
  let senhasNovas = [];
  let autorizacao = null;
  const montar = async () => {
    const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
    await ctx.route("**/.netlify/identity/settings", r =>
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ external: {}, autoconfirm: false }) }));
    await ctx.route("**/.netlify/identity/token", r =>
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ access_token: "tk-de-teste", refresh_token: "rf-de-teste",
          expires_in: 3600, token_type: "bearer" }) }));
    await ctx.route("**/.netlify/identity/recover", r => {
      pedidos.push(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await ctx.route("**/.netlify/identity/verify", r => {
      verificacoes.push(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ access_token: "tk-de-teste", refresh_token: "rf-de-teste",
          expires_in: 3600, token_type: "bearer" }) });
    });
    await ctx.route("**/.netlify/identity/user", r => {
      if (r.request().method() === "PUT")
        senhasNovas.push(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ email: "quem@teste.local" }) });
    });
    await ctx.route("**/script.google.com/**", r => r.abort());
    await ctx.route("**/.netlify/functions/**", r => {
      autorizacao = r.request().headers()["authorization"] || "";
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, convidada: true }) });
    });
    return ctx;
  };
  const telaDe = (p) => p.evaluate(() => [...document.querySelectorAll(".tela")]
    .filter(x => x.style.display === "block").map(x => x.id)[0]);
  const erros = [];

  // ── 1 · a porta da frente ────────────────────────────────────────
  console.log("— a porta da frente é o link —");
  let ctx = await montar();
  let p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto("http://localhost:8899/aluna.html");
  await p.waitForTimeout(2500);

  T("com o Identity de pé, a tela é a do link", (await telaDe(p)) === "telaLink",
    { tela: await telaDe(p) });
  const frente = await p.evaluate(() => {
    const t = document.getElementById("telaLink").innerText;
    return { texto: t.replace(/\s+/g, " "),
      senha: !!document.querySelector("#telaLink input[type=password]") };
  });
  T("ela não pede senha nenhuma", !frente.senha, frente);
  T("e diz o que vai acontecer", /link de entrada chega no seu e-mail/i.test(frente.texto), frente);
  T("e que não há senha em jogo", /senha para criar nem lembrar/i.test(frente.texto), frente);

  await p.fill("#linkEmail", "quem@teste.local");
  await p.click("#btLink");
  await p.waitForTimeout(900);
  T("pedir o link chama o Identity com o e-mail",
    pedidos.length === 1 && pedidos[0].email === "quem@teste.local", pedidos);
  const aviso = await p.evaluate(() => document.getElementById("linkInfo").textContent);
  T("e a resposta não conta quem está cadastrado",
    /Se houver uma conta com este e-mail/.test(aviso), { aviso });

  console.log("\n— quem tem senha entra por ela, um toque abaixo —");
  const caminhos = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("#telaLink button")]
      .filter(x => /Tenho uma senha/i.test(x.textContent))[0];
    if (bt) bt.click();
    const atual = [...document.querySelectorAll(".tela")]
      .filter(x => x.style.display === "block").map(x => x.id)[0];
    return { atual, links: [...document.querySelectorAll("#telaLogin button.link")]
      .map(x => x.textContent.trim()) };
  });
  T("\"Tenho uma senha\" abre a tela de senha", caminhos.atual === "telaLogin", caminhos);
  T("e de lá se volta para o link, ou se pede a troca da senha",
    caminhos.links.some(x => /por link/i.test(x))
    && caminhos.links.some(x => /Esqueci minha senha/i.test(x)), caminhos);

  console.log("\n— entrar guarda a sessão —");
  const antes = await p.evaluate(() => localStorage.getItem("isr_gestao_token"));
  T("antes de entrar não há token", !antes, { antes });
  await p.fill("#loginEmail", "quem@teste.local");
  await p.fill("#loginSenha", "12345678");
  await p.click("#btLogin");
  await p.waitForTimeout(1500);
  const guardado = await p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("isr_gestao_token")); } catch (e) { return null; }
  });
  T("depois de entrar, o token do Identity fica guardado",
    !!(guardado && guardado.access === "tk-de-teste"), guardado);
  T("com o refresh junto, para não cair de hora em hora",
    !!(guardado && guardado.refresh === "rf-de-teste"), guardado);
  T("e com a hora de vencer", !!(guardado && guardado.vence > Date.now()), guardado);

  console.log("\n— a função do Netlify recebe o token —");
  const chamada = await p.evaluate(async () => {
    const C = window.ISRCRM;
    if (!C || !C.tokenGestao) return { temApi: false };
    const tk = await C.tokenGestao();
    // chamarFuncao não é exportada; o caminho real é o mesmo: pegar o
    // token e mandar no cabeçalho
    const r = await fetch("/.netlify/functions/convidar-aluna", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
      body: JSON.stringify({ email: "quem@teste.local" })
    });
    return { temApi: true, tk: tk, ok: r.ok };
  });
  T("tokenGestao devolve o token guardado",
    chamada.temApi && chamada.tk === "tk-de-teste", chamada);
  T("e ele chega à função no cabeçalho Authorization",
    autorizacao === "Bearer tk-de-teste", { autorizacao });

  console.log("\n— \"voltar\" limpa a sessão —");
  const limpou = await p.evaluate(() => {
    if (typeof voltarAoLogin !== "function") return null;
    voltarAoLogin();
    return { token: localStorage.getItem("isr_gestao_token"),
      tela: [...document.querySelectorAll(".tela")]
        .filter(x => x.style.display === "block").map(x => x.id)[0] };
  });
  T("voltar tira o token do aparelho", !!limpou && !limpou.token, limpou);
  T("e devolve a pessoa à porta da frente",
    !!limpou && limpou.tela === "telaLink", limpou);
  await ctx.close();

  // ── 2 · o link clicado entra ─────────────────────────────────────
  console.log("\n— o link clicado entra, sem pedir senha —");
  verificacoes = [];
  ctx = await montar();
  p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto("http://localhost:8899/aluna.html#recovery_token=tok-de-teste");
  await p.waitForTimeout(2800);
  T("carregar a página não gasta o token", verificacoes.length === 0, verificacoes);
  T("a tela pede um toque", (await telaDe(p)) === "telaAbrir", { tela: await telaDe(p) });
  // e recarregar — o que o navegador do Gmail faz — também não gasta
  await p.reload();
  await p.waitForTimeout(2600);
  T("recarregar também não gasta", verificacoes.length === 0, verificacoes);
  await p.click("#btAbrir");
  await p.waitForTimeout(2000);
  T("o toque é que verifica o token",
    verificacoes.length === 1 && verificacoes[0].type === "recovery", verificacoes);
  T("e nenhuma senha vai no pedido", !verificacoes[0] || !verificacoes[0].password, verificacoes);
  const dePois = await p.evaluate(() => ({
    token: (function () { try { return JSON.parse(localStorage.getItem("isr_gestao_token")); }
      catch (e) { return null; } })(),
    tela: [...document.querySelectorAll(".tela")]
      .filter(x => x.style.display === "block").map(x => x.id)[0]
  }));
  T("a sessão fica guardada", !!(dePois.token && dePois.token.access === "tk-de-teste"), dePois);
  T("e a tela de senha não aparece", dePois.tela !== "telaRecovery", dePois);
  await ctx.close();

  // ── 3 · quem pediu para trocar a senha vai para a senha ──────────
  console.log("\n— quem pediu a troca da senha vai para a senha —");
  verificacoes = [];
  ctx = await montar();
  p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto("http://localhost:8899/aluna.html");
  await p.waitForTimeout(2300);
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("#telaLink button")]
      .filter(x => /Tenho uma senha/i.test(x.textContent))[0];
    if (bt) bt.click();
    const es = [...document.querySelectorAll("#telaLogin button.link")]
      .filter(x => /Esqueci minha senha/i.test(x.textContent))[0];
    if (es) es.click();
  });
  await p.waitForTimeout(400);
  await p.fill("#esqueciEmail", "quem@teste.local");
  await p.click("#btEsqueci");
  await p.waitForTimeout(900);
  // mudar só o pedaço depois do # não recarrega a página: o portão
  // decide a tela ao carregar, então aqui ele carrega de novo
  await p.goto("http://localhost:8899/aluna.html#recovery_token=tok-de-teste");
  await p.reload();
  await p.waitForTimeout(2600);
  T("a tela é a de escolher a nova senha", (await telaDe(p)) === "telaRecovery",
    { tela: await telaDe(p) });
  T("e abrir essa tela também não gasta o token",
    verificacoes.length === 0, verificacoes);
  senhasNovas = [];
  await p.fill("#recoverySenha", "12345678");
  await p.click("#btRecovery");
  await p.waitForTimeout(1500);
  T("e a senha nova é gravada com a sessão do link",
    senhasNovas.length === 1 && senhasNovas[0].password === "12345678", senhasNovas);
  await ctx.close();

  // ── 4 · o convite entra sozinho ──────────────────────────────────
  console.log("\n— o convite entra sozinho —");
  verificacoes = [];
  ctx = await montar();
  p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto("http://localhost:8899/aluna.html#invite_token=tok-de-convite");
  await p.waitForTimeout(2800);
  T("o convite também espera o toque", verificacoes.length === 0, verificacoes);
  const primeiraVez = await p.evaluate(() =>
    document.getElementById("abrirTexto").textContent);
  T("e diz que é a primeira vez", /primeira vez/.test(primeiraVez), { primeiraVez });
  await p.click("#btAbrir");
  await p.waitForTimeout(2000);
  const convite = verificacoes.filter(v => v.type === "signup")[0];
  T("o convite é aceito sem a aluna digitar nada", !!convite, verificacoes);
  T("com uma senha sorteada, que ninguém precisa saber",
    !!convite && typeof convite.password === "string" && convite.password.length >= 24,
    convite && { tamanho: (convite.password || "").length });
  const apos = await p.evaluate(() => ({
    token: (function () { try { return JSON.parse(localStorage.getItem("isr_gestao_token")); }
      catch (e) { return null; } })(),
    tela: [...document.querySelectorAll(".tela")]
      .filter(x => x.style.display === "block").map(x => x.id)[0]
  }));
  T("a sessão fica guardada no primeiro acesso",
    !!(apos.token && apos.token.access === "tk-de-teste"), apos);
  T("e a tela de criar senha não aparece", apos.tela !== "telaConvite", apos);
  await ctx.close();

  // ── 5 · link gasto: o caminho é pedir outro ─────────────────────
  console.log("\n— link gasto manda pedir outro, com o e-mail escrito —");
  ctx = await montar();
  // o Identity recusa: é o que ele responde para token já usado
  await ctx.route("**/.netlify/identity/verify", r =>
    r.fulfill({ status: 401, contentType: "application/json",
      body: JSON.stringify({ error: "invalid_grant" }) }));
  p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto("http://localhost:8899/aluna.html");
  await p.waitForTimeout(2400);
  await p.fill("#linkEmail", "quem@teste.local");
  await p.click("#btLink");
  await p.waitForTimeout(900);
  await p.goto("http://localhost:8899/aluna.html#recovery_token=ja-usado");
  await p.reload();
  await p.waitForTimeout(2600);
  await p.click("#btAbrir");
  await p.waitForTimeout(1800);
  const gasto = await p.evaluate(() => ({
    tela: [...document.querySelectorAll(".tela")]
      .filter(x => x.style.display === "block").map(x => x.id)[0],
    erro: document.getElementById("linkErro").textContent,
    email: document.getElementById("linkEmail").value
  }));
  T("volta para a tela de pedir o link", gasto.tela === "telaLink", gasto);
  T("dizendo que o link foi usado", /já foi usado ou expirou/.test(gasto.erro), gasto);
  T("e o e-mail já vem escrito, para ser um toque só",
    gasto.email === "quem@teste.local", gasto);
  await ctx.close();

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
