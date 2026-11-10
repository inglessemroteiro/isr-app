// Quem tem dois papéis faz as duas coisas, e vê as duas.
//
// A Carla é comercial E professora. As abas da turma eram decididas
// por uma escada — o primeiro papel que batesse decidia tudo — e
// "comercial" vinha antes de "professora". Resultado: na turma que
// ela mesma dá, ela via Visão geral, Alunas e Renovação, e perdia
// Plano das aulas, Chamadas, Projeto e Materiais. Abrir o endereço
// do plano direto caía na Visão geral, sem dizer por quê.
//
// Papel soma, não substitui. É a mesma regra da lista de quem pode
// convidar: dar um papel a alguém nunca tira o que o outro papel já
// dava.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];

  const abasDe = async (gestao, sub) => {
    const ctx = await P.novoContexto(b, {
      contexto: { viewport: { width: 1280, height: 1200 } }, gestao: gestao
    });
    const p = await ctx.newPage();
    p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
    await p.goto(P.endereco("ISR - Turmas v3.dc.html"));
    await p.waitForTimeout(2500);
    const id = await p.evaluate((nome) => {
      const C = window.ISRCRM;
      const u = C.turmasLista().filter(x => !nome || x.teacher === nome)[0]
        || C.turmasLista()[0];
      return u.id;
    }, gestao.nome || "");
    await p.goto(P.endereco("ISR - Turma v3.dc.html") + "?id=" + id
      + (sub ? "&sub=" + sub : ""));
    await p.waitForTimeout(2800);
    const r = await p.evaluate(() => {
      const nav = document.querySelector("main");
      const abas = [...nav.querySelectorAll("button, a")]
        .map(x => x.textContent.trim())
        .filter(t => /^(Visão geral|Alunas|Plano das aulas|Chamadas|Projeto|Materiais|Renovação e vagas)$/.test(t));
      return { abas: [...new Set(abas)] };
    });
    await ctx.close();
    return r.abas;
  };

  console.log("— só comercial vê o recorte comercial —");
  const comercial = await abasDe({ nome: "Carla", perfil: "comercial", papeis: ["comercial"] });
  T("tem Visão geral, Alunas e Renovação",
    comercial.indexOf("Visão geral") >= 0 && comercial.indexOf("Alunas") >= 0
      && comercial.indexOf("Renovação e vagas") >= 0, comercial);
  T("e não tem Plano das aulas",
    comercial.indexOf("Plano das aulas") < 0, comercial);

  console.log("\n— só professora vê o recorte da aula —");
  const prof = await abasDe({ nome: "Carla", perfil: "professora", papeis: ["professora"] });
  T("tem Plano das aulas e Chamadas",
    prof.indexOf("Plano das aulas") >= 0 && prof.indexOf("Chamadas") >= 0, prof);
  T("e não tem Renovação e vagas",
    prof.indexOf("Renovação e vagas") < 0, prof);

  console.log("\n— os dois papéis somam —");
  const dois = await abasDe({ nome: "Carla", perfil: "comercial",
    papeis: ["comercial", "professora"] });
  T("o plano da aula aparece para quem também é professora",
    dois.indexOf("Plano das aulas") >= 0, dois);
  T("junto com chamadas, projeto e materiais",
    dois.indexOf("Chamadas") >= 0 && dois.indexOf("Projeto") >= 0
      && dois.indexOf("Materiais") >= 0, dois);
  T("sem perder o que o papel comercial dava",
    dois.indexOf("Renovação e vagas") >= 0, dois);
  T("e a ordem das abas não muda",
    dois.join(" · ") === "Visão geral · Alunas · Plano das aulas · Chamadas · Projeto · Materiais · Renovação e vagas",
    dois.join(" · "));

  console.log("\n— e o endereço do plano abre no plano —");
  // Abrir ?sub=plano caía na Visão geral: a aba pedida só vale se o
  // papel a tiver, e o papel dela não tinha.
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1200 } },
    gestao: { nome: "Carla", perfil: "comercial", papeis: ["comercial", "professora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Turmas v3.dc.html"));
  await p.waitForTimeout(2500);
  const id = await p.evaluate(() => window.ISRCRM.turmasLista()[0].id);
  await p.goto(P.endereco("ISR - Turma v3.dc.html") + "?id=" + id + "&sub=plano");
  await p.waitForTimeout(3000);
  const naTela = await p.evaluate(() =>
    document.querySelector("main").innerText.replace(/\s+/g, " "));
  T("a tela do plano abre, e não a visão geral",
    /O PROGRAMA DESTA TURMA|programa desta turma/i.test(naTela),
    naTela.slice(0, 200));
  await ctx.close();

  console.log("\n— o clube é produto: o comercial vê a tela —");
  // Quem vende precisa do catálogo, das vagas e de quem está em cada
  // clube. A tela era só da coordenação.
  const menuDe = async (gestao) => {
    const c = await P.novoContexto(b, {
      contexto: { viewport: { width: 1280, height: 1200 } }, gestao: gestao
    });
    const pg = await c.newPage();
    pg.on("pageerror", e => erros.push(String(e).slice(0, 220)));
    await pg.goto(P.endereco("ISR - Central v3.dc.html"));
    await pg.waitForTimeout(2600);
    // o rótulo vem com o ícone grudado na frente
    const itens = await pg.evaluate(() =>
      [...document.querySelectorAll("#isr-shell a")]
        .map(a => a.textContent.trim().replace(/^[^A-Za-zÀ-ÿ]+/, "")));
    await c.close();
    return itens;
  };
  const menuCarla = await menuDe({ nome: "Carla", perfil: "comercial",
    papeis: ["comercial", "professora"] });
  T("o comercial tem Clubes no menu",
    menuCarla.some(x => /^Clubes/.test(x)), menuCarla.slice(0, 14));
  const menuSoComercial = await menuDe({ nome: "Carla", perfil: "comercial",
    papeis: ["comercial"] });
  T("mesmo sendo só comercial",
    menuSoComercial.some(x => /^Clubes/.test(x)), menuSoComercial.slice(0, 14));
  const menuProf = await menuDe({ nome: "Bárbara", perfil: "professora",
    papeis: ["professora"] });
  T("e quem é só professora segue sem a tela de coordenação dos clubes",
    !menuProf.some(x => /^Clubes/.test(x)), menuProf.slice(0, 14));

  console.log("\n— a gestora continua vendo tudo —");
  const gestora = await abasDe({ nome: "Gabi", perfil: "gestora", papeis: ["gestora"] });
  T("as sete abas", gestora.length === 7, gestora);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
