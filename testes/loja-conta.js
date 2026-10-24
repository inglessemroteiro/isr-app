// A Loja de milhas e a Conta da aluna, pelos arquivos
// handoff/aluna/07 Shop.md e 08 Account.md, no desenho do
// Student Portal v3.
//
// O que esta suíte guarda:
//   — a loja é a vitrine em grade do desenho: um cartão por prêmio,
//     com símbolo, custo e botão, e o saldo numa pílula ao lado das
//     subabas. Antes era um herói escuro com barra de progresso e uma
//     lista vertical, que não é o desenho;
//   — o prêmio que ela já resgatou, o que custa mais do que ela tem e
//     o que uma regra da escola fecha têm cada um a sua resposta no
//     lugar do botão;
//   — resgatar gasta milhas, e gasta uma vez só: o primeiro clique
//     pergunta, o segundo paga;
//   — prêmio fora de cartaz não aparece;
//   — as trocas entre alunas têm páginas numeradas, e apagar o último
//     anúncio da última página não deixa a aluna numa página vazia;
//   — a Conta são os três cartões do desenho, e o percentual de
//     presença é o mesmo que a tela Meu progresso mostra.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, { contexto: { viewport: { width: 1280, height: 1500 } } });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  const ler = () => p.evaluate(() => (document.querySelector("main") || document.body)
    .innerText.replace(/\s+/g, " "));
  const irPara = async (nome) => {
    await p.evaluate((x) => {
      const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div")]
        .filter(y => new RegExp("^" + x).test(y.textContent.trim().replace(/^\W+\s*/, "")))[0];
      if (e) e.click();
    }, nome);
    await p.waitForTimeout(1300);
  };
  const subaba = async (nome) => {
    await p.evaluate((x) => {
      const e = [...document.querySelectorAll("main div")]
        .filter(y => y.textContent.trim() === x)[0];
      if (e) e.click();
    }, nome);
    await p.waitForTimeout(1200);
  };

  await p.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p.waitForTimeout(2800);
  const cen = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna" && x.turma)[0];
    // saldo que alcança uns prêmios e não alcança outros
    const saldo = C.moedasDe(a.id).total;
    if (saldo < 200) C.addMoedas(a.id, 200 - saldo, "Teste de tela");
    const cat = C.catalogoDaAluna(a.id);
    const itens = cat.niveis.reduce((t, n) => t.concat(n.itens), []);
    // um prêmio fora de cartaz não pode aparecer na vitrine
    const escondido = itens.filter(x => x.pode)[0];
    C.setRecompensaVisivel(escondido.id, false);
    // anúncios: oito, para haver duas páginas
    const outras = C.getPessoas().filter(x => x.status === "aluna" && x.id !== a.id);
    for (var i = 0; i < 8; i++) {
      var dona = i % 3 === 0 ? a : (outras[i % outras.length] || a);
      C.salvarAnuncio(dona.id, { tipo: ["troca", "venda", "servico", "milhas"][i % 4],
        titulo: "Anúncio de teste " + (i + 1), descricao: "Para a suíte de tela.",
        preco: i % 2 ? "" : "€ 10" });
    }
    return { id: a.id, saldo: C.moedasDe(a.id).total, escondido: escondido.nome,
      pctProgresso: (C.progressoDaAluna(a.id) || { presenca: {} }).presenca.pct };
  });

  await p.goto(P.endereco("ISR - Aluna v4.dc.html") + "?id=" + cen.id);
  await p.waitForTimeout(3000);
  await irPara("Loja");

  console.log("— a vitrine do desenho —");
  let t = await ler();
  T("o saldo aparece numa pílula ao lado das subabas",
    new RegExp(cen.saldo + " milhas").test(t), t.slice(0, 160));
  const vitrine = await p.evaluate(() => {
    const cs = [...document.querySelectorAll("main section")]
      .filter(s => /milhas$/m.test(s.innerText) && s.querySelector("div[style*='110px']"));
    if (!cs.length) return null;
    const linha1 = cs.filter(x => Math.abs(x.getBoundingClientRect().top
      - cs[0].getBoundingClientRect().top) < 2);
    return {
      n: cs.length,
      porLinha: linha1.length,
      emoji: cs.every(s => /\p{Extended_Pictographic}|€/u.test(s.innerText)),
      alturas: linha1.map(x => Math.round(x.getBoundingClientRect().height)),
      botaoLargura: (() => {
        const bt = cs.map(s => s.querySelector("button")).filter(Boolean)[0];
        const dono = cs.filter(s => s.querySelector("button"))[0];
        return bt ? Math.round(bt.getBoundingClientRect().width)
          - Math.round(dono.getBoundingClientRect().width) : -999;
      })()
    };
  });
  T("os prêmios saem em cartões, não em lista", vitrine && vitrine.n >= 6, vitrine);
  T("a grade põe mais de um cartão por fileira", vitrine && vitrine.porLinha >= 3, vitrine);
  T("cada cartão tem o seu símbolo", vitrine && vitrine.emoji, vitrine);
  T("os cartões de uma fileira ficam do mesmo tamanho",
    vitrine && Math.max.apply(null, vitrine.alturas)
      - Math.min.apply(null, vitrine.alturas) < 2, vitrine && vitrine.alturas);
  T("o botão ocupa a largura do cartão",
    vitrine && vitrine.botaoLargura > -60, vitrine);
  T("o prêmio tirado de cartaz não aparece",
    t.indexOf(cen.escondido) < 0, cen.escondido);
  T("o que falta milha diz quanto falta", /faltam \d+/.test(t), t.slice(0, 600));
  T("como ganhar milhas é uma linha no pé, não uma lista",
    /Como ganhar milhas: .+ · .+ · /.test(t), (t.match(/Como ganhar milhas:[^|]{0,160}/) || [""])[0]);

  console.log("\n— resgatar gasta milhas, e pergunta antes —");
  const resg = await p.evaluate(async () => {
    const C = window.ISRCRM;
    const antes = C.moedasDe(new URLSearchParams(location.search).get("id")).total;
    const botoes = [...document.querySelectorAll("main section button")]
      .filter(x => /^Resgatar$/.test(x.textContent.trim()));
    if (!botoes.length) return null;
    botoes[0].click();
    await new Promise(r => setTimeout(r, 400));
    const pergunta = [...document.querySelectorAll("main section button")]
      .some(x => /^Confirmar$/.test(x.textContent.trim()));
    const semGastar = C.moedasDe(new URLSearchParams(location.search).get("id")).total === antes;
    return { pergunta, semGastar, antes };
  });
  T("o primeiro clique pergunta", resg && resg.pergunta, resg);
  T("e não gasta milha nenhuma ainda", resg && resg.semGastar, resg);
  const pago = await p.evaluate(async () => {
    const C = window.ISRCRM;
    const id = new URLSearchParams(location.search).get("id");
    const antes = C.moedasDe(id).total;
    const bt = [...document.querySelectorAll("main section button")]
      .filter(x => /^Confirmar$/.test(x.textContent.trim()))[0];
    bt.click();
    await new Promise(r => setTimeout(r, 700));
    return { antes, depois: C.moedasDe(id).total };
  });
  T("o segundo clique paga", pago && pago.depois < pago.antes, pago);
  await p.waitForTimeout(800);
  t = await ler();
  T("e o prêmio pago fica marcado como resgatado", /✓ Resgatado/.test(t), t.slice(0, 400));

  console.log("\n— as trocas, com páginas —");
  await subaba("Trocas entre alunas");
  const mural = await p.evaluate(() => {
    const paginas = [...document.querySelectorAll("main button")]
      .filter(x => /^\d+$/.test(x.textContent.trim()));
    const cartoes = [...document.querySelectorAll("main section")]
      .filter(s => /Anúncio de teste/.test(s.innerText));
    return { paginas: paginas.map(x => x.textContent.trim()),
      cartoes: cartoes.length,
      faixa: /\d+–\d+ de \d+/.test(document.querySelector("main").innerText) };
  });
  T("a grade mostra uma página por vez", mural.cartoes <= 6 && mural.cartoes > 0, mural);
  T("e as páginas são numeradas", mural.paginas.length >= 2, mural);
  T("com a faixa do que está à vista", mural.faixa, mural);
  const p2 = await p.evaluate(async () => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => x.textContent.trim() === "2")[0];
    bt.click();
    await new Promise(r => setTimeout(r, 900));
    return [...document.querySelectorAll("main section")]
      .filter(s => /Anúncio de teste/.test(s.innerText)).length;
  });
  T("a segunda página traz o resto", p2 > 0, { p2 });

  console.log("\n— a conta do arquivo 08 —");
  await irPara("Conta");
  t = await ler();
  const conta = await p.evaluate(() => {
    const secs = [...document.querySelectorAll("main section")];
    const pres = secs.filter(s => /^Presença/.test(s.innerText))[0];
    const quadros = pres ? [...pres.querySelectorAll("span[title]")] : [];
    const grade = pres ? [...pres.querySelectorAll("div")]
      .filter(d => /repeat\(5/.test(d.getAttribute("style") || ""))[0] : null;
    return {
      cartoes: secs.filter(s => /^(Presença|Financeiro|Configurações)/.test(s.innerText)).length,
      mesmaLinha: (() => {
        const tres = secs.filter(s => /^(Presença|Financeiro|Configurações)/.test(s.innerText));
        if (tres.length < 3) return false;
        const topo = Math.round(tres[0].getBoundingClientRect().top);
        return tres.every(x => Math.abs(Math.round(x.getBoundingClientRect().top) - topo) < 2);
      })(),
      quadros: quadros.length,
      cincoPorLinha: !!grade,
      pct: (pres && (pres.innerText.match(/(\d+)%/) || [])[1]) || ""
    };
  });
  T("os três cartões do desenho estão lá", conta.cartoes === 3, conta);
  T("e lado a lado, não um debaixo do outro", conta.mesmaLinha, conta);
  T("a presença é uma grade de cinco por fileira", conta.cincoPorLinha, conta);
  T("com um quadro por sessão", conta.quadros > 0, conta);
  T("e o percentual é o mesmo da tela Meu progresso",
    cen.pctProgresso === null || String(cen.pctProgresso) === conta.pct,
    { conta: conta.pct, progresso: cen.pctProgresso });

  console.log("\n— nenhum recado de obra —");
  const proibido = ["chave de avisos", "não guarda essa escolha", "notification switch",
    "does not store that choice", "a escola decide primeiro", "o desenho tem",
    "ainda não cadastrou um link"];
  const achados = proibido.filter(x => t.toLowerCase().indexOf(x) >= 0);
  T("nada escrito para a escola na Conta", achados.length === 0, achados);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
