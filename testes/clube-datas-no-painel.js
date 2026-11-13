// A professora consegue marcar as datas de onde ela está olhando.
//
// O SINTOMA: "Falta as 4 datas dos encontros para publicar" — e, pela
// tela da professora, nenhum lugar onde pôr as datas.
//
// O clube é editado em duas telas: a de Clubes, da coordenação, e o
// Painel, que é o único item de menu que a professora tem. As duas
// gravam no mesmo clubeSalvar, então o dado não diverge. Mas a aba
// "Encontros" do Painel só mostrava "sem data ainda" e o botão de
// chamada: as datas moram no modo de edição da aba "página", e quem
// chegava pela aba dos encontros não tinha como saber disso.
//
// O que esta suíte guarda:
//   — a aba Encontros diz quantas datas faltam, e leva ao lugar onde
//     elas se marcam;
//   — marcadas as quatro, o aviso some e o clube publica;
//   — e o que a coordenação escreveu e a professora não edita — o
//     preço do site — sobrevive a um salvamento pelo Painel.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1500 } },
    gestao: { nome: "Bárbara", perfil: "professora", papeis: ["professora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— um clube dela, sem data nenhuma —");
  // O Painel abre no painel de UMA professora — a primeira que tem
  // turma, quando quem entrou não tem. O clube da suíte precisa ser
  // dessa pessoa, senão ele não aparece na lista dela.
  const quem = await p.evaluate(() => {
    const t = document.querySelector("main").innerText;
    const m = /visualizando como\s+([^\n]+)/.exec(t);
    return m ? m[1].trim() : "";
  });
  T("o painel diz de quem é", !!quem, quem);
  const cen = await p.evaluate((prof) => {
    const C = window.ISRCRM;
    const r = C.clubeSalvar({ nome: "Clube sem datas Teste", professora: prof,
      formato: "online", descricao: "Para a suíte.", link: "https://exemplo.local",
      dia: "quinta", hora: "19:00", fuso: "Europe/Amsterdam", nivel: "A partir do A2",
      vagas: 6, encontros: [] });
    // o preço é da coordenação, não da professora
    C.clubeSalvar({ id: r.id, preco: 30 });
    const c = C.getClube(r.id);
    return { id: r.id, falta: C.faltaParaPublicar(c), preco: c.preco };
  }, quem);
  T("o clube nasce sem as 4 datas",
    cen.falta.indexOf("encontros") >= 0, cen.falta);
  T("e com o preço que a coordenação pôs", cen.preco === 30, cen);

  await p.reload();
  await p.waitForTimeout(3000);
  const foiPraClubes = await p.evaluate(() => {
    const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div, main button")]
      .filter(x => /^Clubes/.test(x.textContent.trim().replace(/^\W+\s*/, "")))[0];
    if (e) { e.click(); return true; }
    return false;
  });
  await p.waitForTimeout(1400);
  // o cartão do clube é um botão: clicar nele é o que abre o painel
  const abriu = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /Clube sem datas Teste/.test(x.textContent))[0];
    if (bt) { bt.click(); return true; }
    return false;
  });
  await p.waitForTimeout(1400);
  T("a professora chega ao clube dela", foiPraClubes && abriu, { foiPraClubes, abriu });

  console.log("\n— a aba Encontros diz o que falta e leva ao lugar —");
  const naAba = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => x.textContent.trim() === "Encontros")[0];
    if (bt) { bt.click(); return true; }
    return { botoes: [...document.querySelectorAll("main button")]
      .map(x => x.textContent.trim().slice(0, 24)) };
  });
  await p.waitForTimeout(1200);
  const aviso = await p.evaluate(() => {
    const t = document.querySelector("main").innerText.replace(/\s+/g, " ");
    const bt = [...document.querySelectorAll("main button")]
      .map(x => x.textContent.trim());
    return { texto: t, temBotao: bt.indexOf("Marcar as datas") >= 0 };
  });
  T("a aba Encontros abre", naAba === true, naAba);
  T("o aviso diz que nenhuma data foi marcada",
    /Nenhum encontro tem data ainda/.test(aviso.texto), aviso.texto.slice(0, 400));
  T("e oferece marcar as datas", aviso.temBotao, aviso);

  const levou = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => x.textContent.trim() === "Marcar as datas")[0];
    if (!bt) return false;
    bt.click();
    return true;
  });
  await p.waitForTimeout(1300);
  const noForm = await p.evaluate(() =>
    document.querySelectorAll("main input[type=date]").length);
  T("o botão abre o formulário com os campos de data",
    levou && noForm >= 4, { levou, noForm });

  console.log("\n— marcadas as quatro, o clube publica —");
  const publicou = await p.evaluate((id) => {
    const C = window.ISRCRM;
    const hoje = new Date();
    const p2 = (n) => (n < 10 ? "0" : "") + n;
    const dia = (n) => {
      const d = new Date(hoje.getTime() + n * 7 * 86400000);
      return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
    };
    C.clubeSalvar({ id: id, encontros: [1, 2, 3, 4].map(n => ({
      data: dia(n), hora: "19:00", tema: "Encontro " + n })) });
    const c = C.getClube(id);
    const r = C.clubePublicar(id);
    return { falta: C.faltaParaPublicar(c), publicou: !!(r && r.ok),
      erro: (r && r.erro) || "", preco: C.getClube(id).preco };
  }, cen.id);
  T("não falta mais nada para publicar",
    publicou.falta.length === 0, publicou);
  T("e o clube publica", publicou.publicou === true, publicou);
  T("o preço da coordenação sobreviveu às gravações da professora",
    publicou.preco === 30, publicou);

  console.log("\n— com as datas, o aviso some —");
  await p.reload();
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div, main button")]
      .filter(x => /^Clubes/.test(x.textContent.trim().replace(/^\W+\s*/, "")))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1300);
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /Clube sem datas Teste/.test(x.textContent))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1300);
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => x.textContent.trim() === "Encontros")[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  const semAviso = await p.evaluate(() => {
    const t = document.querySelector("main").innerText.replace(/\s+/g, " ");
    const bt = [...document.querySelectorAll("main button")].map(x => x.textContent.trim());
    return { temAviso: /data ainda|falta a data de/.test(t),
      temBotao: bt.indexOf("Marcar as datas") >= 0, texto: t.slice(0, 300) };
  });
  T("o aviso desaparece", semAviso.temAviso === false, semAviso);
  T("e o botão também", semAviso.temBotao === false, semAviso);

  T("nenhum erro de página", erros.length === 0, erros);
  await ctx.close();
  await b.close();
  fim();
})();
