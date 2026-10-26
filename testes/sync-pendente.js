// O que foi gravado e não subiu.
//
// Toda gravação espera 1,5 s antes de ir ao banco, para agrupar
// edições em sequência. Nada forçava o envio quando a aba fechava:
// publicar um clube e fechar a aba em seguida — ou o celular dormir,
// ou a pessoa trocar de app — deixava a alteração só no aparelho
// dela, em silêncio. A escola não via o clube no ar porque ele nunca
// saiu de lá.
//
// O que esta suíte guarda:
//   — gravar deixa uma marca de pendente, ANTES da espera;
//   — a marca só sai quando o envio termina bem;
//   — a página que sai de vista manda o que está esperando;
//   — a página que abre carregando a marca manda antes de tudo.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1100, height: 900 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });

  // o banco: responde ao load e conta os saves
  let saves = 0;
  await ctx.route("**/script.google.com/**", r => {
    const corpo = r.request().postData() || "";
    if (corpo.indexOf("sistemaSave") >= 0) saves++;
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, data: null }) });
  });

  // o preparar.js liga o dado de exemplo a cada carga, e dado de
  // exemplo nunca sai do aparelho — é a trava que impede a suíte de
  // mandar qualquer coisa para fora. Aqui o assunto é justamente o
  // que sai, então a trava é desligada depois dela, a cada carga
  await ctx.addInitScript(() => {
    try {
      localStorage.removeItem("isr_exemplo_v1");
      localStorage.setItem("isr_seed_v3", "1");
      if (!localStorage.getItem("isr_clubes_v1")) localStorage.setItem("isr_clubes_v1", "[]");
      if (!localStorage.getItem("isr_pessoas_v3")) localStorage.setItem("isr_pessoas_v3", "[]");
    } catch (e) {}
  });

  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Clubes v3.dc.html"));
  await p.waitForTimeout(2600);

  console.log("— gravar deixa marca antes de subir —");
  const marcou = await p.evaluate(() => {
    const C = window.ISRCRM;
    C.setBackendUrl("https://script.google.com/macros/s/teste/exec");
    localStorage.removeItem("isr_sync_pendente");
    C.clubeSalvar({ nome: "Clube de Teste", professora: "Gabi", formato: "online",
      descricao: "Para a suíte.", link: "https://exemplo.local", dia: "terça",
      hora: "18:30", fuso: "America/Sao_Paulo", vagas: 8, nivel: "a2" });
    // ainda dentro do 1,5 s de espera
    return { pendente: C.temPendente() };
  });
  T("a marca aparece na hora da gravação, não depois", marcou.pendente, marcou);

  await p.waitForTimeout(3500);
  const limpou = await p.evaluate(() => ({
    pendente: window.ISRCRM.temPendente(),
    estado: window.ISRCRM.syncEstado().status
  }));
  T("e some quando o envio termina bem", !limpou.pendente, limpou);
  T("com o estado em ok", limpou.estado === "ok", limpou);

  console.log("\n— a aba que sai de vista manda o que está esperando —");
  const antes = saves;
  await p.evaluate(() => {
    const C = window.ISRCRM;
    C.clubeSalvar({ nome: "Outro Clube de Teste", professora: "Gabi", formato: "online",
      descricao: "Para a suíte.", link: "https://exemplo.local", dia: "quarta",
      hora: "19:00", fuso: "America/Sao_Paulo", vagas: 8, nivel: "b1" });
  });
  // sair de vista ANTES de a espera terminar
  await p.evaluate(() => {
    Object.defineProperty(document, "visibilityState",
      { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForTimeout(1200);
  T("o envio sai sem esperar o agrupamento", saves > antes, { antes, agora: saves });

  console.log("\n— a página que abre com marca manda antes de tudo —");
  await p.evaluate(() => localStorage.setItem("isr_sync_pendente", "1"));
  const antes2 = saves;
  await p.reload();
  await p.waitForTimeout(3500);
  T("abrir com a marca dispara o envio", saves > antes2, { antes2, agora: saves });
  const depois = await p.evaluate(() => window.ISRCRM.temPendente());
  T("e a marca sai depois dele", !depois, { depois });

  console.log("\n— sem banco central, não há o que ficar pendente —");
  const semBanco = await p.evaluate(() => {
    const C = window.ISRCRM;
    C.setBackendUrl("");
    localStorage.removeItem("isr_sync_pendente");
    C.clubeSalvar({ nome: "Terceiro Clube de Teste", professora: "Gabi", formato: "online",
      descricao: "Para a suíte.", link: "https://exemplo.local", dia: "sexta",
      hora: "20:00", fuso: "America/Sao_Paulo", vagas: 8, nivel: "a1" });
    return C.temPendente();
  });
  T("nada é marcado quando não há para onde mandar", !semBanco, { semBanco });

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
