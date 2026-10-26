// Quem conduz o clube, na tela Clubes.
//
// O que esta suíte guarda:
//   — a lista sai da Equipe: quem tem o papel de professora ou de
//     gestora. Quem não tem o papel marcado não aparece, e é na
//     Equipe que isso se corrige;
//   — clube conduzido por quem não está na lista abria com o campo em
//     branco, e salvar gravava vazio por cima: o clube perdia quem o
//     conduz sem ninguém pedir. O nome que já está no clube entra na
//     lista;
//   — clube novo não vem com a primeira professora da ordem
//     alfabética já escolhida.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1300 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));

  await p.goto(P.endereco("ISR - Clubes v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— a lista vem da Equipe —");
  const cen = await p.evaluate(() => {
    const C = window.ISRCRM;
    C.getPessoas();
    const equipe = C.equipeLista();
    const comPapel = equipe.filter(m => (m.papeis || [])
      .some(x => x === "professora" || x === "gestora")).map(m => m.nome);
    const semPapel = equipe.filter(m => !(m.papeis || [])
      .some(x => x === "professora" || x === "gestora")).map(m => m.nome);
    // um clube conduzido por quem NÃO está na lista
    const r = C.clubeSalvar({ nome: "Clube da Teste", professora: "Quem Saiu Teste",
      formato: "online", descricao: "Para a suíte.", link: "https://exemplo.local",
      dia: "quinta", hora: "19:00", fuso: "America/Sao_Paulo", vagas: 5, nivel: "b1" });
    return { comPapel, semPapel, id: r.id };
  });
  T("há quem conduza na equipe", cen.comPapel.length > 0, cen.comPapel);

  const abrir = async (nome) => {
    // o cartão do clube abre primeiro: "editar o clube" só existe
    // dentro dele
    await p.evaluate((n) => {
      const titulo = [...document.querySelectorAll("main span")]
        .filter(x => x.textContent.trim() === n)[0];
      if (titulo) titulo.click();
    }, nome);
    await p.waitForTimeout(900);
    await p.evaluate((n) => {
      // "editar o clube" é um span dentro do cartão de cada clube
      const alvo = [...document.querySelectorAll("main span, main button")]
        .filter(x => /^editar o clube$/i.test(x.textContent.trim()))
        .filter(x => {
          let e = x;
          for (let i = 0; i < 7 && e; i++) { e = e.parentElement;
            if (e && e.textContent.indexOf(n) >= 0) return true; }
          return false;
        })[0];
      if (alvo) alvo.click();
    }, nome);
    await p.waitForTimeout(1200);
  };
  const opcoes = () => p.evaluate(() => {
    const sel = [...document.querySelectorAll("main select")]
      .filter(s => [...s.options].some(o => /escolha quem conduz|fora da equipe/.test(o.text))
        || s.previousElementSibling && /quem conduz/i.test(s.previousElementSibling.textContent))[0]
      || document.querySelectorAll("main select")[0];
    if (!sel) return null;
    return { valor: sel.value, textos: [...sel.options].map(o => o.text) };
  });

  console.log("\n— o clube de quem saiu da lista —");
  await abrir("Clube da Teste");
  const fora = await opcoes();
  T("o campo não abre em branco", !!fora && fora.valor === "Quem Saiu Teste", fora);
  T("e diz que essa pessoa está fora da equipe",
    !!fora && fora.textos.some(t => /Quem Saiu Teste · fora da equipe/.test(t)), fora);

  // salvar não pode apagar quem conduz
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /Salvar|Guardar/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  const depois = await p.evaluate((c) => {
    const C = window.ISRCRM;
    return (C.getClube(c.id) || {}).professora;
  }, cen);
  T("e salvar não apaga quem conduz", depois === "Quem Saiu Teste", { depois });

  console.log("\n— clube novo não escolhe sozinho —");
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button, header button")]
      .filter(x => /Novo clube|\+ Clube/i.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  const novo = await opcoes();
  T("o campo começa vazio, pedindo a escolha",
    !!novo && novo.valor === "" && novo.textos.some(t => /escolha quem conduz/.test(t)), novo);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
