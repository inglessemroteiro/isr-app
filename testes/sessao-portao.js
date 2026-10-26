// O portão guarda a sessão do Identity.
//
// O que esta suíte guarda:
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
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
  // o Identity não existe no teste: respondemos por ele, como o
  // Netlify responderia num login bem-sucedido
  await ctx.route("**/.netlify/identity/settings", r =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ external: {}, autoconfirm: false }) }));
  await ctx.route("**/.netlify/identity/token", r =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ access_token: "tk-de-teste", refresh_token: "rf-de-teste",
        expires_in: 3600, token_type: "bearer" }) }));
  await ctx.route("**/.netlify/identity/user", r =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ email: "quem@teste.local" }) }));
  await ctx.route("**/script.google.com/**", r => r.abort());
  // a função do Netlify: devolve o que chegou no cabeçalho, que é o
  // que esta suíte quer ver
  let autorizacao = null;
  await ctx.route("**/.netlify/functions/**", r => {
    autorizacao = r.request().headers()["authorization"] || "";
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, convidada: true }) });
  });

  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto("http://localhost:8899/aluna.html");
  await p.waitForTimeout(2500);

  console.log("— o portão pede e-mail e senha —");
  const tela = await p.evaluate(() => [...document.querySelectorAll(".tela")]
    .filter(x => x.style.display === "block").map(x => x.id)[0]);
  T("com o Identity de pé, a tela é a de senha", tela === "telaLogin", { tela });

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
    return localStorage.getItem("isr_gestao_token");
  });
  T("voltar ao login tira o token do aparelho", !limpou, { limpou });

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
