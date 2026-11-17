// A hora E A DATA no relógio de quem está olhando.
//
// O que esta suíte guarda:
//   — a conversão em si: 20:30 em Amsterdã é 16:30 em São Paulo e
//     02:30 do dia seguinte em Jacarta, com horário de verão incluído;
//   — a DATA viaja junto com a hora. O sistema convertia a hora e
//     imprimia a data de quem conduz ao lado: a aluna em Jacarta lia
//     "sáb 21/11 · 02:30 (+1)" de um encontro que, para ela, é domingo
//     22. Data e hora na mesma linha diziam coisas diferentes, e
//     sobrava para ela fazer a conta;
//   — o encontro entra na semana DELA. Colocado pela data de quem
//     conduz, um encontro de sábado à noite sumia da semana da aluna
//     em Jacarta, porque para ela já era domingo;
//   — o nome do dia da semana também vira;
//   — sem fuso guardado, ou sem data, nada é convertido e a tela diz
//     de onde a hora é, em vez de mostrá-la como se fosse a de quem lê.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });

  // ── a conta, em três relógios ────────────────────────────────
  const esperado = {
    "America/Sao_Paulo": { hora: "16:30", vira: 0 },
    "Europe/Amsterdam": { hora: "20:30", vira: 0 },
    "Asia/Jakarta": { hora: "02:30", vira: 1 }
  };
  for (const tz of Object.keys(esperado)) {
    const ctx = await P.novoContexto(b, {
      contexto: { timezoneId: tz },
      gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
    });
    const p = await ctx.newPage();
    const erros = []; p.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
    await p.goto(P.endereco("ISR - Painel v3.dc.html"));
    await p.waitForTimeout(2800);

    const r = await p.evaluate(() => {
      const C = window.ISRCRM;
      // um encontro inventado, de sábado 21/11 às 20:30 em Amsterdã
      const h = C.horaNoRelogioDe("20:30", "Europe/Amsterdam", "2026-11-21",
        C.fusoDoNavegador());
      return { navegador: C.fusoDoNavegador(), horaVisor: h.horaVisor,
        dataVisor: h.dataVisor, mudouDeDia: h.mudouDeDia,
        diaLa: C.diaNoRelogioDe(h), nota: C.notaDoFuso(h) };
    });
    const e = esperado[tz];
    T(`${tz} · a hora`, r.horaVisor === e.hora, r.horaVisor);
    T(`${tz} · o dia`, r.mudouDeDia === e.vira, r.mudouDeDia);
    const dataCerta = e.vira ? "2026-11-22" : "2026-11-21";
    T(`${tz} · a data viaja com a hora`, r.dataVisor === dataCerta, r.dataVisor);
    if (e.vira) {
      T(`${tz} · o nome do dia também vira`, r.diaLa === "dom", r.diaLa);
    } else if (tz === "Europe/Amsterdam") {
      T(`${tz} · mesmo fuso não repete nada`, r.nota === "" && r.diaLa === "",
        r.nota + "|" + r.diaLa);
    }
    await ctx.close();
  }

  // ── sem fuso e sem data: nada é inventado ────────────────────
  {
    const ctx = await P.novoContexto(b, {
      contexto: { timezoneId: "Asia/Jakarta" },
      gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
    });
    const p = await ctx.newPage();
    await p.goto(P.endereco("ISR - Painel v3.dc.html"));
    await p.waitForTimeout(2800);
    const r = await p.evaluate(() => {
      const C = window.ISRCRM;
      const semFuso = C.horaNoRelogioDe("20:30", "", "2026-11-21", "Asia/Jakarta");
      const semData = C.horaNoRelogioDe("20:30", "Europe/Amsterdam", "", "Asia/Jakarta");
      return {
        semFuso: { marca: semFuso.semFuso, mostra: semFuso.horaVisor, nota: C.notaDoFuso(semFuso) },
        semData: { marca: !!semData.semData, mostra: semData.horaVisor,
          nota: C.notaDoFuso(semData), dia: C.diaNoRelogioDe(semData) }
      };
    });
    T("sem fuso guardado · a hora sai como está", r.semFuso.marca && r.semFuso.mostra === "20:30",
      JSON.stringify(r.semFuso));
    T("sem fuso guardado · sem nota inventada", r.semFuso.nota === "", r.semFuso.nota);
    T("sem data · a hora é a de quem conduz", r.semData.marca && r.semData.mostra === "20:30",
      JSON.stringify(r.semData));
    T("sem data · a tela diz de onde a hora é",
      /Amsterd/.test(r.semData.nota), r.semData.nota);
    T("sem data · nenhum dia é virado", r.semData.dia === "", r.semData.dia);
    await ctx.close();
  }

  // ── o que a ALUNA vê, nos dois relógios ──────────────────────
  //
  // O clube "Movie Lovers" é de sábado 20:30 em Amsterdã. Em Jacarta,
  // o encontro é domingo de madrugada — e tem de aparecer no domingo
  // da semana dela, com a data do domingo.
  const porFuso = {};
  for (const tz of ["America/Sao_Paulo", "Asia/Jakarta"]) {
    const ctx = await P.novoContexto(b, {
      contexto: { timezoneId: tz },
      gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
    });
    const p = await ctx.newPage();
    const erros = []; p.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
    await p.goto(P.endereco("ISR - Painel v3.dc.html"));
    await p.waitForTimeout(2500);
    const id = await p.evaluate(() => {
      const C = window.ISRCRM;
      const a = C.getPessoas().filter((x) => x.status === "aluna")[0];
      return a ? a.id : "";
    });
    await p.goto(P.endereco("ISR - Aluna v4.dc.html") + "?id=" + id);
    await p.waitForTimeout(3000);
    const texto = await p.evaluate(() => document.body.innerText);
    porFuso[tz] = texto;
    T(`${tz} · a tela da aluna abre sem erro`, erros.length === 0, erros.slice(0, 2));
    await ctx.close();
  }

  const sp = porFuso["America/Sao_Paulo"] || "";
  const jk = porFuso["Asia/Jakarta"] || "";
  // a linha do Movie Lovers na semana dela
  const linhaDe = (txt) => {
    const l = txt.split("\n").map((s) => s.trim()).filter(Boolean);
    const i = l.findIndex((x) => /movie lovers/i.test(x));
    return i < 0 ? "" : l.slice(Math.max(0, i - 1), i + 2).join(" | ");
  };
  T("São Paulo · o encontro é sábado 16:30", /S[áa]b 21\/11 · 16:30/.test(sp), linhaDe(sp));
  T("Jacarta · o encontro é domingo 02:30", /Dom 22\/11 · 02:30/.test(jk), linhaDe(jk));
  T("Jacarta · nenhum '(+1)' sobrou na tela da aluna", jk.indexOf("(+1)") < 0,
    linhaDe(jk));
  T("Jacarta · a data de quem conduz não aparece com a hora dela",
    !/S[áa]b 21\/11 · 02:30/.test(jk), linhaDe(jk));

  // ── A HORA ESCRITA À MÃO ──────────────────────────────────────
  //
  // O campo é texto livre e a escola escreveu de tudo. O conversor
  // lia só os dígitos: "7:30 PM" virava 07:30, doze horas antes da
  // aula, e o fuso era calculado em cima de uma hora já errada.
  {
    const ctx = await P.novoContexto(b, {
      gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
    });
    const p = await ctx.newPage();
    await p.goto(P.endereco("ISR - Painel v3.dc.html"));
    await p.waitForTimeout(2800);
    const casos = await p.evaluate(() => {
      const C = window.ISRCRM;
      return ["19:00", "18:30", "7:30 PM", "5:00 pm", "18:00 pm", "19h30", "7.30pm",
        "12:00 am", "12:30 PM", "8h", "Tuesdays 18:30", "terça-feira 7:30 PM",
        "9 am", "sábado"].map((x) => [x, C.horaNormal(x)]);
    });
    const esperaHora = {
      "19:00": "19:00", "18:30": "18:30", "7:30 PM": "19:30", "5:00 pm": "17:00",
      "18:00 pm": "18:00", "19h30": "19:30", "7.30pm": "19:30", "12:00 am": "00:00",
      "12:30 PM": "12:30", "8h": "08:00", "Tuesdays 18:30": "18:30",
      "terça-feira 7:30 PM": "19:30", "9 am": "09:00", "sábado": "sábado"
    };
    casos.forEach(function (par) {
      T("hora escrita · " + JSON.stringify(par[0]), par[1] === esperaHora[par[0]],
        par[1] + " (esperava " + esperaHora[par[0]] + ")");
    });
    await ctx.close();
  }

  // ── AS TELAS DO CLUBE, UMA A UMA ──────────────────────────────
  //
  // O clube é o mesmo; o relógio de quem abre a tela é que muda. Um
  // clube de terça "7:30 PM" em Amsterdã é 19:30 lá e 15:30 em São
  // Paulo, e toda tela que mostra esse clube tem de dizer isso.
  const CLUBE = {
    nome: "Teste Fuso", professora: "Gabi", dia: "terça-feira",
    hora: "7:30 PM", duracao: "60", fuso: "Europe/Amsterdam", formato: "online",
    link: "https://meet", nivel: "a2", descricao: "Teste.", vagas: 8,
    encontros: [{ data: "2031-11-25", tema: "um" }, { data: "2031-12-02", tema: "dois" },
                { data: "2031-12-09", tema: "três" }, { data: "2031-12-16", tema: "quatro" }],
    status: "publicado"
  };
  const esperaTela = {
    "Europe/Amsterdam": { hora: "19:30", nota: false },
    "America/Sao_Paulo": { hora: "15:30", nota: true }
  };
  for (const tz of Object.keys(esperaTela)) {
    const ctx = await P.novoContexto(b, {
      contexto: { timezoneId: tz },
      gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
    });
    const p = await ctx.newPage();
    const err = []; p.on("pageerror", (e) => err.push(String(e).slice(0, 200)));
    await p.goto(P.endereco("ISR - Painel v3.dc.html"));
    await p.waitForTimeout(2500);
    await p.evaluate((c) => {
      const C = window.ISRCRM;
      if (!C.clubesLista().some((x) => x.nome === c.nome)) C.clubeSalvar(c);
    }, CLUBE);
    const e = esperaTela[tz];

    // 1 · a tela de Clubes, da gestão
    await p.goto(P.endereco("ISR - Clubes v3.dc.html"));
    await p.waitForTimeout(2500);
    const tClubes = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    T(tz + " · tela Clubes mostra a hora dele", tClubes.indexOf(e.hora) >= 0,
      tClubes.slice(0, 300));
    if (e.nota) {
      T(tz + " · tela Clubes diz de onde a hora é", /19:30 em Amsterd/.test(tClubes),
        tClubes.slice(0, 300));
    }

    // 2 · o painel da professora
    await p.goto(P.endereco("ISR - Painel v3.dc.html"));
    await p.waitForTimeout(2500);
    await p.evaluate(() => {
      const bt = [...document.querySelectorAll("button")]
        .filter((x) => /^clubes$/i.test(x.textContent.trim()))[0];
      if (bt) bt.click();
    });
    await p.waitForTimeout(1200);
    const tPainel = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    T(tz + " · painel da professora mostra a hora dele", tPainel.indexOf(e.hora) >= 0,
      tPainel.slice(0, 400));
    if (e.nota) {
      T(tz + " · painel diz de onde a hora é", /19:30 em Amsterd/.test(tPainel),
        tPainel.slice(0, 400));
      T(tz + " · painel não mostra 7:30 como se fosse a hora",
        tPainel.indexOf("7:30 PM") < 0, tPainel.slice(0, 400));
    }
    T(tz + " · as telas de clube abrem sem erro", err.length === 0, err.slice(0, 2));
    await ctx.close();
  }

  await b.close();
  fim();
})();
