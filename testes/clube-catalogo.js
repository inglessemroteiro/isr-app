// O catálogo "Todos os clubes" da aluna, pelo arquivo
// handoff/aluna/04 Clubs.md.
//
// O que esta suíte guarda:
//   — o nível escolhido pela professora chega ao cartão. Ele não
//     chegava: a projeção do catálogo não levava o campo, e TODO clube
//     aparecia como "todos os níveis";
//   — o cartão tem o que o arquivo pede: emoji, pílula de nível, "New"
//     quando é novo, nome, descrição, e professor / horário / membros
//     em linhas separadas;
//   — uma descrição comprida não estica o cartão e com ele a grade;
//   — publicar exige o nível escolhido. Antes o campo nascia "todos"
//     sozinho e a trava passava sem ninguém ter decidido nada.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, { contexto: { viewport: { width: 1280, height: 1300 } } });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  const ler = () => p.evaluate(() => (document.querySelector("main") || document.body)
    .innerText.replace(/\s+/g, " "));

  await p.goto(P.endereco("ISR - Painel v3.dc.html"));
  await p.waitForTimeout(2800);

  console.log("— publicar exige o nível —");
  const trava = await p.evaluate(() => {
    const C = window.ISRCRM;
    C.getPessoas();
    const r = C.clubeSalvar({ nome: "Clube Teste", professora: "Gabi Teste",
      formato: "online", descricao: "Para o teste.", link: "https://exemplo.local",
      dia: "quinta", hora: "19:00", fuso: "America/Sao_Paulo", vagas: 5,
      encontros: [1, 2, 3, 4].map(i => ({ data: "2026-12-0" + i, hora: "19:00", tema: "t" + i })) });
    const nasceu = (C.getClube(r.id) || {}).nivel;
    const semNivel = C.clubePublicar(r.id);
    C.clubeSalvar({ id: r.id, nivel: "b1" });
    const comNivel = C.clubePublicar(r.id);
    return { nasceu, semNivel, comNivel, guardado: (C.getClube(r.id) || {}).nivel };
  });
  T("clube novo nasce sem nível", !trava.nasceu, trava);
  T("e sem nível não publica",
    trava.semNivel.ok === false && /n[íi]vel/i.test(trava.semNivel.erro || ""), trava.semNivel);
  T("com o nível escolhido, publica", trava.comNivel.ok === true, trava.comNivel);
  T("e o nível fica guardado", trava.guardado === "b1", trava);

  console.log("\n— o nível chega ao cartão da aluna —");
  const alvo = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna")[0];
    const cs = C.clubesLista().filter(c => c.status === "publicado" && c.nome !== "Clube Teste");
    const niveis = ["b1", "a2", "todos"];
    cs.forEach((c, i) => C.clubeSalvar({ id: c.id, nivel: niveis[i % 3],
      emoji: ["📖", "🍲", "🎬"][i % 3] }));
    // uma descrição comprida de verdade, como as que a escola escreve
    if (cs[1]) C.clubeSalvar({ id: cs[1].id, descricao: "Um espaço para praticar o inglês "
      + "de forma leve e descontraída. ".repeat(14) });
    cs.forEach(c => { if (c.membros.indexOf(a.id) >= 0) C.clubeSair(c.id, a.id); });
    return { id: a.id, n: cs.length };
  });
  T("há clubes publicados para o catálogo", alvo.n >= 2, alvo);

  await p.goto(P.endereco("ISR - Aluna v4.dc.html") + "?id=" + alvo.id);
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div")]
      .filter(x => /^Clubes/.test(x.textContent.trim().replace(/^\W+\s*/, "")))[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1300);
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("div")]
      .filter(x => x.textContent.trim() === "Todos os clubes")[0];
    if (e) e.click();
  });
  await p.waitForTimeout(1300);
  const t = await ler();
  T("o catálogo abre", /Cada clube tem 4 encontros/.test(t), t.slice(0, 300));
  T("os níveis são os que a professora escolheu",
    /A partir do B1/.test(t) && /A partir do A2/.test(t), t.slice(0, 900));
  T("e não saem todos como \"todos os níveis\"",
    (t.match(/Todos os níveis/g) || []).length <= 1, t.slice(0, 900));

  console.log("\n— o cartão do arquivo 04 —");
  const cartao = await p.evaluate(() => {
    const secs = [...document.querySelectorAll("main section")]
      .filter(s => /Ver datas e detalhes/.test(s.innerText));
    if (!secs.length) return null;
    const s = secs[0];
    const desc = [...s.querySelectorAll("div")]
      .filter(d => getComputedStyle(d).webkitLineClamp === "4")[0];
    const botao = s.querySelector("button");
    return {
      n: secs.length,
      temEmoji: /\p{Extended_Pictographic}/u.test(s.innerText),
      linhas: (s.innerText.match(/👩‍🏫|🗓/gu) || []).length,
      membros: /\d+ membros? · /.test(s.innerText),
      clamp: !!desc,
      botaoLargura: botao ? Math.round(botao.getBoundingClientRect().width) : 0,
      cartaoLargura: Math.round(s.getBoundingClientRect().width),
      // só os da MESMA fileira: a grade estica os cartões por fileira,
      // e um cartão sozinho na fileira de baixo é mais curto de direito
      alturas: (() => {
        const topo = Math.round(secs[0].getBoundingClientRect().top);
        return secs.filter(x => Math.abs(Math.round(x.getBoundingClientRect().top) - topo) < 2)
          .map(x => Math.round(x.getBoundingClientRect().height));
      })()
    };
  });
  T("emoji no cartão", cartao && cartao.temEmoji, cartao);
  T("professor e horário em linhas próprias", cartao && cartao.linhas === 2, cartao);
  T("e a linha de membros e local", cartao && cartao.membros, cartao);
  T("a descrição comprida para em quatro linhas", cartao && cartao.clamp, cartao);
  T("o botão ocupa a largura do cartão",
    cartao && cartao.botaoLargura > cartao.cartaoLargura - 60, cartao);
  T("e os cartões de uma fileira ficam do mesmo tamanho",
    cartao && Math.max.apply(null, cartao.alturas) - Math.min.apply(null, cartao.alturas) < 2,
    cartao && cartao.alturas);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
