// Quando a sincronização falha, a tela diz por quê.
//
// O SINTOMA: "falha ao sincronizar" e mais nada.
//
// O selo da barra mostrava três palavras para causas completamente
// diferentes — endereço não configurado, Apps Script fora do ar,
// gravação recusada pela chave do sistema. Quem lê esse aviso é quem
// administra a escola, e sem o motivo não há o que fazer a não ser
// tentar de novo e esperar.
//
// Pior: o erro era engolido no .catch, então nem o console guardava
// a razão. A informação não existia em lugar nenhum.
//
// O que esta suíte guarda:
//   — o estado da sincronização grava a etapa (ler ou gravar), o
//     motivo e o detalhe;
//   — cada motivo vira uma frase que diz o que conferir;
//   — gravação recusada com 200 e { ok: false } é FALHA, não
//     sucesso: tratá-la como sucesso marcava "sincronizado" sem
//     nada ter sido gravado;
//   — e o teste de conexão separa "não lê" de "lê mas não grava".
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1200 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Central v3.dc.html"));
  await p.waitForTimeout(2800);

  // o exemplo tem de sair do caminho: com ele ligado nada sai do
  // aparelho, de propósito, e não é disso que esta suíte trata
  // O modo vai como texto: função não atravessa para dentro da página.
  // "fora" = o Apps Script não responde; "recusa" = lê mas recusa a
  // gravação com 200 e ok:false; "ok" = os dois caminhos de pé.
  const preparar = async (modo) => p.evaluate((m) => {
    const C = window.ISRCRM;
    localStorage.removeItem("isr_exemplo_v1");
    C.setBackendUrl("https://script.teste.local/macros/s/abc/exec");
    window.__original = window.__original || window.fetch;
    const json = (o, st) => Promise.resolve(new Response(JSON.stringify(o),
      { status: st || 200, headers: { "Content-Type": "application/json" } }));
    const lido = { ok: true, data: { pessoas: [], atualizadoEm: "2026-11-13T10:00:00.000Z" } };
    window.fetch = (u, o) => {
      const url = String(u);
      // a função do site responde 401: é o caminho que cai no direto
      if (/netlify\/functions\/base/.test(url)) return json({}, 401);
      if (/script\.teste\.local/.test(url)) {
        if (m === "fora") return Promise.reject(new TypeError("Failed to fetch"));
        const corpo = String((o && o.body) || "");
        if (m === "recusa" && /sistemaSave/.test(corpo)) {
          return json({ ok: false, error: "chave do sistema ausente ou inválida" });
        }
        return json(lido);
      }
      return window.__original(u, o);
    };
  }, modo);

  console.log("— o Apps Script fora do ar —");
  await preparar("fora");
  const fora = await p.evaluate(async () => {
    const C = window.ISRCRM;
    C.enviarSync();
    await new Promise(r => setTimeout(r, 900));
    return { estado: C.syncEstado(), diag: C.syncDiagnostico() };
  });
  T("o estado fica em erro", fora.estado.status === "erro", fora.estado);
  T("e grava o motivo", fora.estado.motivo === "base_fora", fora.estado);
  T("dizendo em que etapa parou", fora.diag.etapa === "ao ler", fora.diag);
  T("a frase manda conferir o endereço e a implantação",
    /\/exec/.test(fora.diag.recado) && /implantação/.test(fora.diag.recado),
    fora.diag.recado);
  T("e o detalhe guarda o que o navegador disse",
    /Failed to fetch/.test(fora.diag.detalhe || ""), fora.diag.detalhe);

  console.log("\n— lê, mas a gravação é recusada —");
  // Esta é a falha perigosa: 200 com ok:false. Era tratada como
  // sucesso, e a tela dizia "sincronizado" sem nada ter sido gravado.
  await preparar("recusa");
  const recusou = await p.evaluate(async () => {
    const C = window.ISRCRM;
    C.enviarSync();
    await new Promise(r => setTimeout(r, 900));
    return { estado: C.syncEstado(), diag: C.syncDiagnostico() };
  });
  T("recusa com 200 não vira \"sincronizado\"",
    recusou.estado.status === "erro", recusou.estado);
  T("a etapa é a gravação", recusou.diag.etapa === "ao gravar", recusou.diag);
  T("o motivo é recusa, não queda", recusou.estado.motivo === "base_recusou", recusou.estado);
  T("e a frase fala da chave do sistema",
    /chave do sistema/.test(recusou.diag.recado), recusou.diag.recado);
  T("com o que o banco respondeu junto",
    /chave do sistema ausente/.test(recusou.diag.detalhe || ""), recusou.diag.detalhe);

  console.log("\n— o teste de conexão separa ler de gravar —");
  const teste1 = await p.evaluate(() => window.ISRCRM.testarConexao());
  T("o teste reprova na gravação", teste1.ok === false && teste1.etapa === "gravar", teste1);
  T("e mostra o endereço, encurtado", /script\.teste\.local/.test(teste1.endereco || ""), teste1);

  await preparar("ok");
  const teste2 = await p.evaluate(() => window.ISRCRM.testarConexao());
  T("com os dois caminhos de pé, o teste passa", teste2.ok === true, teste2);
  T("e diz isso em uma frase", /lê e grava/.test(teste2.recado), teste2);

  const depoisDeOk = await p.evaluate(async () => {
    const C = window.ISRCRM;
    C.enviarSync();
    await new Promise(r => setTimeout(r, 900));
    return { estado: C.syncEstado(), diag: C.syncDiagnostico() };
  });
  T("e a sincronização volta a dar certo",
    depoisDeOk.estado.status === "ok", depoisDeOk.estado);
  T("o diagnóstico deixa de acusar erro",
    depoisDeOk.diag.erro === false, depoisDeOk.diag);

  console.log("\n— sem endereço, a frase é outra —");
  const semEndereco = await p.evaluate(async () => {
    const C = window.ISRCRM;
    C.setBackendUrl("");
    const t = await C.testarConexao();
    return t;
  });
  T("o teste diz que falta o endereço",
    semEndereco.ok === false && semEndereco.etapa === "endereço", semEndereco);
  T("e onde configurá-lo",
    /Configurar banco central/.test(semEndereco.recado), semEndereco.recado);

  console.log("\n— o selo leva o motivo para a tela —");
  await p.evaluate(() => {
    window.ISRCRM.setBackendUrl("https://script.teste.local/macros/s/abc/exec");
    window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  });
  await p.evaluate(async () => {
    window.ISRCRM.enviarSync();
    await new Promise(r => setTimeout(r, 900));
  });
  const selo = await p.evaluate(() => {
    const el = document.getElementById("isr-shell-sync");
    return el ? { titulo: el.title, cursor: el.style.cursor,
      papel: el.getAttribute("role") } : null;
  });
  if (selo) {
    T("o título do selo traz a frase do motivo",
      /implantação/.test(selo.titulo), selo.titulo.slice(0, 200));
    T("e convida a tocar para testar",
      /testar a conexão/i.test(selo.titulo), selo.titulo.slice(-80));
    T("o selo vira botão quando há erro",
      selo.cursor === "pointer" && selo.papel === "button", selo);
  } else {
    T("a casca desenhou o selo da sincronização", false, "sem #isr-shell-sync");
  }

  T("nenhum erro de página", erros.length === 0, erros);
  await ctx.close();
  await b.close();
  fim();
})();
