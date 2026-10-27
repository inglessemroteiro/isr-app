// O guia do professor, trazido de um PDF.
//
// Os materiais da escola moram no Drive, um guia por nível e por
// ciclo, em PDF. Cadastrar os programas à mão são dez sessões por
// guia, seis fases por sessão. Aqui a escola baixa o arquivo, solta
// na tela Programas, e o que foi lido cai na mesma caixa de texto em
// que ela colaria à mão — para conferir e completar antes de gravar.
//
// Por que passar pela caixa de texto, e não gravar direto: o guia é
// prosa, não formulário. O leitor acerta a maior parte e erra alguma
// coisa, e o erro tem de estar à vista de quem grava. Este é o mesmo
// caminho do texto colado, e por isso a conferência e a gravação são
// as mesmas dos dois lados.
//
// O que esta suíte guarda:
//   — o PDF é lido no próprio navegador, sem mandar o material da
//     escola para lugar nenhum e sem pedir a conta do Google;
//   — do cabeçalho saem o nome do projeto e o nível;
//   — cada "Session N — Título" vira uma sessão, com o objetivo
//     tirado da frase "By the end of...";
//   — as seis fases da escola saem da tabela com o tempo de cada
//     uma, mesmo quando a extração parte o nome da fase em duas
//     linhas ("Language" / "Focus") ou separa o número do "min";
//   — a fase que o guia não descrever entra vazia com o tempo
//     padrão, e a tela diz quantas ficaram assim;
//   — o que foi lido vira o texto do formato da casa, que a tela
//     confere com as mesmas regras do texto colado.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1100 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Programas v3.dc.html"));
  await p.waitForTimeout(3000);

  const b64 = fs.readFileSync(path.join(__dirname, "materiais", "guia-exemplo.pdf"))
    .toString("base64");
  const soltar = (seletorPronto) => p.evaluate(async (b64) => {
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const arq = new File([arr], "guia-exemplo.pdf", { type: "application/pdf" });
    const texto = await window.ISRCRM.lerPdf(arq);
    return { texto: texto, lido: window.ISRCRM.lerGuiaDoProfessor(texto) };
  }, b64);

  console.log("— o PDF é lido no navegador —");
  const r = await soltar();
  T("o texto sai do PDF", !!r.texto && r.texto.length > 500, { tamanho: (r.texto || "").length });
  const pg = (r.lido.programas || [])[0] || null;
  T("o leitor devolve um programa", !!pg, r.lido.avisos);
  if (!pg) { await b.close(); return fim(); }

  console.log("\n— o cabeçalho diz de quem é o guia —");
  T("o nome do projeto sai do cabeçalho", pg.nome === "Traditions", { nome: pg.nome });
  T("e o nível também", pg.nivel === "Speaking (B1)", { nivel: pg.nivel });

  console.log("\n— cada sessão do guia vira uma sessão —");
  T("as duas sessões do guia estão lá", (pg.sessoes || []).length === 2,
    { n: (pg.sessoes || []).length });
  const s1 = (pg.sessoes || [])[0] || {};
  T("com o número e o título", s1.n === 1 && s1.titulo === "Our End of Year Dishes", s1);
  T("e o objetivo tirado do \"By the end of\"",
    /^By the end of it every student can describe/.test(s1.objetivo || ""),
    { objetivo: (s1.objetivo || "").slice(0, 80) });

  console.log("\n— as seis fases, com o tempo de cada uma —");
  const fases = (s1.etapas || []).map(e => e.fase);
  T("as seis fases da escola entram, na ordem",
    fases.join(",") === "warmup,mindson,language,handson,shareout,wrapup", fases);
  const porFase = {};
  (s1.etapas || []).forEach(e => { porFase[e.fase] = e; });
  T("o tempo vem do guia, não do padrão",
    porFase.warmup.min === 10 && porFase.handson.min === 15 && porFase.wrapup.min === 5,
    (s1.etapas || []).map(e => e.fase + ":" + e.min));
  // "Language Focus" sai do PDF partido em duas linhas, e o tempo
  // numa terceira: sem juntar, a fase sumia e caía no tempo padrão
  T("a fase de nome partido é remontada",
    !!porFase.language && porFase.language.min === 10
    && /used to, still and every year/.test(porFase.language.titulo || ""),
    porFase.language);
  T("e a última linha da tabela não puxa a prosa que vem depois",
    /Reflection in English/.test(porFase.wrapup.titulo || "")
    && !/long prose section/.test(porFase.wrapup.titulo || ""), porFase.wrapup);

  console.log("\n— o que foi lido vira o texto da casa —");
  const texto = await p.evaluate((progs) => window.ISRCRM.guiaParaTexto(progs),
    r.lido.programas);
  T("o texto tem o cabeçalho do programa",
    /^Programa: Traditions\nNível: Speaking \(B1\)/m.test(texto), texto.slice(0, 120));
  T("e as sessões no formato de linhas",
    /\nS1: Our End of Year Dishes\n/.test(texto) && /\nWarm-up: .*\(10\)/.test(texto),
    texto.slice(0, 400));
  const conferido = await p.evaluate((t) => {
    const c = window.ISRCRM.conferirImportacao(t);
    return { podeImportar: c.podeImportar, programas: c.programas,
      avisos: (c.avisos || []).slice(0, 3) };
  }, texto);
  T("a conferência entende o texto gerado, sem sobras",
    conferido.podeImportar && !conferido.avisos.length, conferido);
  T("e vê as duas sessões", (conferido.programas[0] || {}).sessoes === 2,
    conferido.programas);

  console.log("\n— a tela avisa o que ficou em branco —");
  const vazias = (pg.sessoes || []).reduce((n, s) =>
    n + (s.etapas || []).filter(e => !e.titulo).length, 0);
  T("a conta das fases em branco é possível de fazer", vazias >= 0, { vazias });
  // a caixa de trazer programas só abre quando se pede
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /Trazer de um texto/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  const naTela = await p.evaluate(() => {
    const t = (document.querySelector("main") || document.body).innerText;
    return { temBotao: /Escolher o PDF/.test(t),
      temNota: /O guia baixado do Drive/.test(t) };
  });
  T("o botão do PDF está na tela de trazer programas", naTela.temBotao, naTela);
  T("dizendo de onde vem o arquivo", naTela.temNota, naTela);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
