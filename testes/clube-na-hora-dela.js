// O horário do clube, no relógio da aluna, igual nas duas telas.
//
// A escola tem professora no Brasil, na Holanda, na Indonésia e no
// Paquistão, e a aluna pode estar em qualquer um desses lugares. A
// hora guardada é a do relógio de QUEM CONDUZ.
//
// A página de Clubes já convertia essa hora. A lista "Esta semana",
// na Home, mostrava a hora crua — então o mesmo encontro aparecia às
// 20:00 numa tela e às 23:00 na outra, dentro do mesmo app. Quem
// seguisse a Home chegava três horas atrasada.
//
// O que esta suíte guarda:
//   — a Home converte para o relógio de quem está lendo;
//   — a página de Clubes mostra a mesma hora para o mesmo encontro;
//   — clube sem fuso guardado continua aparecendo como está, porque
//     inventar um fuso seria marcar encontro na hora errada com cara
//     de certeza.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];

  // o relógio da aluna: Amsterdã. O Book Club é conduzido de São
  // Paulo, às 20:00 — que lá são 00:00 do dia seguinte no inverno.
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1600 },
      timezoneId: "Europe/Amsterdam" }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  // o app da aluna é quem semeia os clubes do exemplo: a primeira
  // abertura é o que põe a base de pé
  await p.goto(P.endereco("ISR - Aluna v4.dc.html"));
  await p.waitForTimeout(3000);

  const cen = await p.evaluate(() => {
    const C = window.ISRCRM;
    const clube = C.clubesLista().filter(c => c.fuso && c.status === "publicado"
      && (c.membros || []).length)[0];
    const alunaId = clube.membros[0];
    const enc = (clube.encontros || []).filter(e => e && e.data)[0];
    const h = C.horaDoEncontro(clube, enc, "Europe/Amsterdam");
    return { alunaId: alunaId, clube: clube.nome, fuso: clube.fuso,
      horaDeQuemConduz: h.hora, horaDela: h.horaVisor,
      data: enc.data, mudouDeDia: h.mudouDeDia };
  });
  T("o cenário tem um clube de outro fuso",
    !!cen.clube && cen.horaDeQuemConduz !== cen.horaDela,
    cen);

  console.log("— a Home mostra a hora dela —");
  await p.goto(P.endereco("ISR - Aluna v4.dc.html") + "?id=" + cen.alunaId);
  await p.waitForTimeout(3000);
  const home = await p.evaluate((nome) => {
    const t = document.querySelector("main").innerText.replace(/\s+/g, " ");
    const i = t.indexOf(nome + " · ");
    return i < 0 ? "" : t.slice(i, i + 90);
  }, cen.clube);
  T("o encontro do clube aparece na semana", home.indexOf(cen.clube) >= 0, home);
  T("com a hora do relógio dela", home.indexOf(cen.horaDela) >= 0, { home, cen });
  T("e não com a hora de quem conduz",
    home.indexOf(cen.horaDeQuemConduz) < 0, { home, cen });

  console.log("\n— e a página de Clubes diz a mesma coisa —");
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div")]
      .filter(x => /^Clubes|^Clubs/.test(x.textContent.trim().replace(/^\W+\s*/, "")))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1800);
  const clubes = await p.evaluate(() =>
    document.querySelector("main").innerText.replace(/\s+/g, " "));
  T("a hora dela também está na página de Clubes",
    clubes.indexOf(cen.horaDela) >= 0, { trecho: clubes.slice(0, 300), cen });
  T("as duas telas não discordam",
    home.indexOf(cen.horaDela) >= 0 && clubes.indexOf(cen.horaDela) >= 0,
    { home, cen });

  console.log("\n— clube sem fuso fica como está —");
  const semFuso = await p.evaluate(() => {
    const C = window.ISRCRM;
    const h = C.horaDoEncontro({ hora: "19:00", fuso: "" },
      { data: "2026-12-01" }, "Asia/Jakarta");
    return { hora: h.hora, visor: h.horaVisor, semFuso: h.semFuso };
  });
  T("sem fuso guardado, a hora não é convertida",
    semFuso.semFuso === true && semFuso.hora === "19:00"
      && semFuso.visor === "19:00", semFuso);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
