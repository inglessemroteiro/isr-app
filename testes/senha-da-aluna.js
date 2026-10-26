// A senha, que é a saída quando o link não chega.
//
// A aluna entra por link. O link é o caminho bom — nada para
// inventar, nada para esquecer —, mas era um caminho só: se o e-mail
// não chega, ela não entra, e pedir outro link depende do mesmo
// e-mail que falhou.
//
// A conta dela tinha "Trocar a minha senha", e era um link para
// aluna.html. Com a sessão aberta, aluna.html devolve a aluna para o
// app: o link não fazia nada, justamente onde precisava funcionar.
//
// Agora a senha se define ali, com a sessão que ela já tem aberta,
// sem e-mail no meio — é o único jeito de a saída não depender do
// caminho que falhou.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, { contexto: { viewport: { width: 430, height: 1000 } } });

  let enviado = null;
  await ctx.route("**/.netlify/identity/user", r => {
    if (r.request().method() === "PUT") {
      enviado = { corpo: JSON.parse(r.request().postData() || "{}"),
        auth: r.request().headers()["authorization"] || "" };
    }
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ email: "quem@teste.local" }) });
  });

  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Aluna v4.dc.html"));
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna" && x.turma)[0];
    localStorage.setItem("isr_aluna_id", a.id);
    localStorage.setItem("isr_gestao_token", JSON.stringify({
      access: "tk-de-teste", refresh: "rf-de-teste", vence: Date.now() + 3600000 }));
  });
  await p.reload();
  await p.waitForTimeout(3000);

  // a conta fica dentro de "eu", na terceira aba
  const tocar = (rotulo) => p.evaluate((r) => {
    const e = [...document.querySelectorAll("*")]
      .filter(x => x.children.length === 0 && x.textContent.trim() === r)[0];
    if (e) { e.click(); return true; }
    return false;
  }, rotulo);
  await tocar("Eu");
  await p.waitForTimeout(1400);
  const abriu = await tocar("Conta");
  await p.waitForTimeout(1600);
  T("a tela da conta abre", abriu, { abriu });

  console.log("— a conta oferece a senha, ali mesmo —");
  const bloco = await p.evaluate(() => {
    const t = (document.querySelector("main") || document.body).innerText.replace(/\s+/g, " ");
    const campo = [...document.querySelectorAll("input[type=password]")][0];
    const linkMorto = [...document.querySelectorAll("a")]
      .some(a => /senha/i.test(a.textContent) && /aluna\.html/.test(a.getAttribute("href") || ""));
    return { texto: t, temCampo: !!campo, linkMorto };
  });
  T("a conta tem onde escrever a senha", bloco.temCampo, { temCampo: bloco.temCampo });
  T("e o link que não levava a lugar nenhum saiu", !bloco.linkMorto, bloco);
  T("o texto diz para que serve a senha",
    /A senha é a saída para quando o e-mail não chegar/.test(bloco.texto),
    (bloco.texto.match(/.{0,40}A senha é a saída.{0,60}/) || [""])[0]);

  console.log("\n— senha curta não sai do lugar —");
  await p.evaluate(() => {
    const c = document.querySelectorAll("input[type=password]")[0];
    c.value = "1234";
    c.dispatchEvent(new Event("input", { bubbles: true }));
    const bt = [...document.querySelectorAll("button")]
      .filter(x => x.textContent.trim() === "Salvar")[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(900);
  const curta = await p.evaluate(() => (document.querySelector("main") || document.body)
    .innerText.replace(/\s+/g, " "));
  T("avisa o mínimo de caracteres",
    /pelo menos 8 caracteres/.test(curta), (curta.match(/.{0,30}8 caracteres.{0,30}/) || [""])[0]);
  T("e nada foi mandado ao servidor", enviado === null, enviado);

  console.log("\n— a senha vai com a sessão que ela já tem —");
  await p.evaluate(() => {
    const c = document.querySelectorAll("input[type=password]")[0];
    c.value = "umasenhaboa123";
    c.dispatchEvent(new Event("input", { bubbles: true }));
    const bt = [...document.querySelectorAll("button")]
      .filter(x => x.textContent.trim() === "Salvar")[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1500);
  T("a senha chega ao Identity",
    !!enviado && enviado.corpo.password === "umasenhaboa123", enviado);
  T("com o token da sessão, sem e-mail no caminho",
    !!enviado && enviado.auth === "Bearer tk-de-teste", enviado);
  const depois = await p.evaluate(() => ({
    texto: (document.querySelector("main") || document.body).innerText.replace(/\s+/g, " "),
    campo: document.querySelectorAll("input[type=password]")[0].value
  }));
  T("a tela confirma", /Senha salva/.test(depois.texto),
    (depois.texto.match(/.{0,20}Senha salva.{0,60}/) || [""])[0]);
  T("e o campo não fica com a senha escrita", depois.campo === "", depois);

  console.log("\n— sem sessão, a tela diz o que fazer —");
  enviado = null;
  await p.evaluate(() => localStorage.removeItem("isr_gestao_token"));
  const semSessao = await p.evaluate(async () => {
    const r = await window.ISRCRM.definirSenha("umasenhaboa123");
    return r;
  });
  T("não tenta e explica", !semSessao.ok && /sessão venceu/i.test(semSessao.erro || ""),
    semSessao);
  T("marcando que o caminho é entrar de novo",
    semSessao.precisaEntrar === true, semSessao);
  T("e nada foi mandado ao servidor", enviado === null, enviado);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
