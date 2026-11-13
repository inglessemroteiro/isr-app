// A aluna diz qual clube ela quer que exista.
//
// A lista de espera já existia, e ela responde uma pergunta só: quem
// quer entrar num clube que JÁ EXISTE. Não diz nada sobre o clube que
// ainda não foi aberto — e é essa a informação que falta para decidir
// a grade do ciclo seguinte.
//
// A sugestão pede quatro coisas: tema, quem conduz, dia e horário. O
// tema é o único obrigatório; o resto é preferência, e preferência em
// branco é resposta legítima ("tanto faz o dia").
//
// O valor não está em cada sugestão isolada: está em quantas pedem a
// mesma coisa. Por isso a tela da escola agrupa por tema, com o dia e
// o horário mais pedidos de cada grupo.
//
// O que esta suíte guarda:
//   — o tema é obrigatório e o dia e a hora são conferidos;
//   — a mesma aluna pedindo o mesmo tema atualiza, não duplica;
//   — o agrupamento junta "Business" e "business  english" quando são
//     o mesmo tema, e conta as pessoas certas;
//   — a sugestão viaja no sync como qualquer registro;
//   — e a aluna só apaga a dela.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1400 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Clubes v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— o que a gravação aceita e o que recusa —");
  const regras = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna")[0];
    return {
      alunaId: a.id,
      semTema: C.sugerirClube(a.id, { tema: "   " }),
      diaInvalido: C.sugerirClube(a.id, { tema: "Teste", dia: "terça-feira" }),
      horaInvalida: C.sugerirClube(a.id, { tema: "Teste", hora: "19h30" }),
      semAluna: C.sugerirClube("", { tema: "Teste" }),
      completa: C.sugerirClube(a.id, { tema: "Inglês para entrevista",
        dia: "quinta", hora: "19:30", professora: "Bárbara",
        observacao: "depois do trabalho fica melhor" }),
      soTema: C.sugerirClube(a.id, { tema: "Clube de leitura Teste" })
    };
  });
  T("sem tema não grava",
    regras.semTema.ok === false && /tema/i.test(regras.semTema.erro), regras.semTema);
  T("dia que não é dia da semana é recusado",
    regras.diaInvalido.ok === false, regras.diaInvalido);
  T("horário fora do formato é recusado, dizendo o formato",
    regras.horaInvalida.ok === false && /19:30/.test(regras.horaInvalida.erro),
    regras.horaInvalida);
  T("sugestão sem aluna não existe", regras.semAluna.ok === false, regras.semAluna);
  T("com tema, dia, hora e professora, grava", regras.completa.ok === true, regras.completa);
  T("e só com o tema também grava: preferência em branco é resposta",
    regras.soTema.ok === true, regras.soTema);

  console.log("\n— a mesma aluna, o mesmo tema: atualiza, não duplica —");
  const repetiu = await p.evaluate((alunaId) => {
    const C = window.ISRCRM;
    const antes = C.minhasSugestoesDeClube(alunaId).length;
    C.sugerirClube(alunaId, { tema: "inglês  para ENTREVISTA", dia: "sexta", hora: "20:00" });
    const minhas = C.minhasSugestoesDeClube(alunaId);
    const a = minhas.filter(s => /entrevista/i.test(s.tema))[0];
    return { antes: antes, depois: minhas.length, dia: a.dia, hora: a.hora };
  }, regras.alunaId);
  T("não vira uma linha nova", repetiu.depois === repetiu.antes, repetiu);
  T("e a preferência nova substitui a antiga",
    repetiu.dia === "sexta" && repetiu.hora === "20:00", repetiu);

  console.log("\n— há um teto de sugestões abertas por aluna —");
  const teto = await p.evaluate((alunaId) => {
    const C = window.ISRCRM;
    const r = [];
    for (let i = 0; i < 6; i++) {
      r.push(C.sugerirClube(alunaId, { tema: "Tema " + i + " Teste" }));
    }
    const ultima = r[r.length - 1];
    return { aceitas: r.filter(x => x.ok).length,
      recusou: !ultima.ok, erro: ultima.erro || "" };
  }, regras.alunaId);
  T("a sexta é recusada, e a mensagem diz por quê",
    teto.recusou === true && /sugestões aguardando/.test(teto.erro), teto);

  console.log("\n— o agrupamento junta o mesmo tema escrito diferente —");
  const grupos = await p.evaluate(() => {
    const C = window.ISRCRM;
    // alunas diferentes da do teste do teto, que já gastou a cota dela
    const alunas = C.getPessoas().filter(x => x.status === "aluna").slice(3, 6);
    window.__trio = alunas.map(a => a.id);
    // três alunas, o mesmo tema escrito de três jeitos
    C.sugerirClube(alunas[0].id, { tema: "Business English", dia: "terça", hora: "19:00" });
    C.sugerirClube(alunas[1].id, { tema: "business  english", dia: "terça", hora: "19:00" });
    C.sugerirClube(alunas[2].id, { tema: "BUSINESS ENGLISH", dia: "quinta" });
    const g = C.sugestoesAgrupadas().filter(x => /business/i.test(x.tema))[0] || null;
    return {
      achou: !!g,
      quantas: g ? g.quantas : 0,
      pessoas: g ? g.pessoas.length : 0,
      dia: g ? g.diaMaisPedido : null,
      hora: g ? g.horaMaisPedida : null,
      semPrefDia: g ? g.semPreferenciaDeDia : null,
      trio: window.__trio
    };
  });
  T("um grupo só para as três grafias", grupos.achou && grupos.quantas === 3, grupos);
  T("com as três alunas nomeadas", grupos.pessoas === 3, grupos);
  T("o dia mais pedido é terça, por duas das três",
    grupos.dia && grupos.dia.valor === "terça" && grupos.dia.quantas === 2, grupos);
  T("o horário mais pedido traz quantas pediram",
    grupos.hora && grupos.hora.valor === "19:00" && grupos.hora.quantas === 2, grupos);
  T("e quem não disse o dia é contado como sem preferência",
    grupos.semPrefDia === 0, grupos);

  console.log("\n— a tela da escola mostra o grupo, não o pedido solto —");
  await p.reload();
  await p.waitForTimeout(2800);
  const abriu = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Sugestões/.test(x.textContent.trim()))[0];
    if (!bt) return false;
    bt.click();
    return true;
  });
  T("a vista Sugestões existe, com a contagem", abriu === true, abriu);
  await p.waitForTimeout(900);
  const naTela = await p.evaluate(() =>
    document.querySelector("main").innerText.replace(/\s+/g, " "));
  T("o tema aparece com quantas alunas pediram",
    /Business English/i.test(naTela) && /3 alunas/.test(naTela), naTela.slice(0, 500));
  T("com o dia mais pedido", /terça/.test(naTela), naTela.slice(0, 700));
  T("e com os nomes de quem pediu", /Pediram:/.test(naTela), naTela.slice(0, 700));

  console.log("\n— abrir o clube tira o grupo da fila —");
  const fechou = await p.evaluate(() => {
    const C = window.ISRCRM;
    const antes = C.sugestoesAgrupadas().filter(g => /business/i.test(g.tema)).length;
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => x.textContent.trim() === "Abri este clube")[0];
    if (bt) bt.click();
    return { antes: antes };
  });
  await p.waitForTimeout(900);
  const depoisDeAbrir = await p.evaluate((trio) => {
    const C = window.ISRCRM;
    return {
      aindaNaFila: C.sugestoesAgrupadas()
        .filter(g => /business/i.test(g.tema)).length,
      // a aluna continua vendo o que pediu, com o estado novo
      minhaStatus: (C.minhasSugestoesDeClube(trio[0])
        .filter(s => /business/i.test(s.tema))[0] || {}).status || ""
    };
  }, grupos.trio);
  T("o grupo atendido sai da fila da escola",
    fechou.antes === 1 && depoisDeAbrir.aindaNaFila === 0, depoisDeAbrir);
  T("e a aluna vê que o pedido dela virou clube",
    depoisDeAbrir.minhaStatus === "virou_clube", depoisDeAbrir);

  console.log("\n— a sugestão viaja, e cada uma só apaga a sua —");
  const viagem = await p.evaluate((alunaId) => {
    const C = window.ISRCRM;
    const noPayload = Object.prototype.hasOwnProperty.call(
      C.payloadParaTeste(), "clubeSugestoes");
    const minhas = JSON.parse(localStorage.getItem("isr_clube_sugestoes_v1") || "[]");
    const doOutro = minhas.slice(0, Math.max(0, minhas.length - 1));
    const juntas = C.mesclarListaParaTeste(minhas, doOutro, "id").lista;
    // outra aluna tentando apagar a sugestão desta
    const alheia = C.minhasSugestoesDeClube(alunaId)[0];
    const recusou = C.apagarSugestaoDeClube(alheia.id, "p-outra-pessoa");
    const continua = C.minhasSugestoesDeClube(alunaId)
      .some(s => s.id === alheia.id);
    // a própria aluna apaga
    C.apagarSugestaoDeClube(alheia.id, alunaId);
    const sumiu = !C.minhasSugestoesDeClube(alunaId).some(s => s.id === alheia.id);
    return { noPayload: noPayload, mesclou: juntas.length === minhas.length,
      recusou: recusou.ok === false, continua: continua, sumiu: sumiu };
  }, regras.alunaId);
  T("a sugestão entra no que sobe para o banco", viagem.noPayload, viagem);
  T("e a cópia velha do outro aparelho não apaga nenhuma",
    viagem.mesclou, viagem);
  T("outra pessoa não apaga a sugestão de quem a escreveu",
    viagem.recusou && viagem.continua, viagem);
  T("e quem escreveu apaga a sua", viagem.sumiu, viagem);

  await ctx.close();

  console.log("\n— e a aluna sugere pelo app dela —");
  const cA = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1400 } }
  });
  const pa = await cA.newPage();
  pa.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await pa.goto(P.endereco("ISR - Aluna v4.dc.html"));
  await pa.waitForTimeout(3000);
  const quemSou = await pa.evaluate(() => {
    const C = window.ISRCRM;
    const eu = C.getPessoas().filter(x => x.status === "aluna")[0];
    return eu ? eu.id : "";
  });
  T("o app abre com uma aluna", !!quemSou, quemSou);
  await pa.goto(P.endereco("ISR - Aluna v4.dc.html") + "?id=" + quemSou);
  await pa.waitForTimeout(3200);
  // o menu lateral leva aos clubes; dentro deles, "Todos os clubes"
  await pa.evaluate(() => {
    const e = [...document.querySelectorAll("aside div, aside a, aside button, nav div")]
      .filter(x => /^Clubes/.test(x.textContent.trim().replace(/^\W+\s*/, "")))[0];
    if (e) e.click();
  });
  await pa.waitForTimeout(1300);
  await pa.evaluate(() => {
    const e = [...document.querySelectorAll("div, button")]
      .filter(x => x.textContent.trim() === "Todos os clubes")[0];
    if (e) e.click();
  });
  await pa.waitForTimeout(1300);
  const temForm = await pa.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    return { tem: /Sugerir um clube/.test(t), texto: t.slice(0, 300) };
  });
  T("o catálogo da aluna oferece sugerir um clube", temForm.tem, temForm);

  const enviou = await pa.evaluate(() => {
    const abrir = [...document.querySelectorAll("div, span, button")]
      .filter(x => x.textContent.trim() === "Sugerir um clube"
        && x.children.length === 0);
    if (!abrir.length) return 0;
    // o último é o botão que abre o formulário; o primeiro é o título
    abrir[abrir.length - 1].click();
    return abrir.length;
  });
  await pa.waitForTimeout(900);
  const preencheu = await pa.evaluate(() => {
    const inp = [...document.querySelectorAll("input")]
      .filter(x => /tema|entrevista/i.test(x.placeholder || ""))[0];
    if (!inp) return { achou: false };
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value").set;
    setter.call(inp, "Clube de cinema Teste");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    const bt = [...document.querySelectorAll("button")]
      .filter(x => /Enviar a sugestão/.test(x.textContent))[0];
    if (!bt) return { achou: true, botao: false };
    bt.click();
    return { achou: true, botao: true };
  });
  T("o formulário abre e aceita o tema",
    enviou > 0 && preencheu.achou && preencheu.botao, { enviou, preencheu });
  await pa.waitForTimeout(1200);
  const gravou = await pa.evaluate(() => {
    const C = window.ISRCRM;
    const t = document.body.innerText.replace(/\s+/g, " ");
    return {
      nasSugestoes: C.sugestoesDeClube()
        .some(s => /Clube de cinema Teste/.test(s.tema)),
      naTela: /Clube de cinema Teste/.test(t),
      recado: /chegou na escola/.test(t)
    };
  });
  T("a sugestão da aluna é gravada", gravou.nasSugestoes, gravou);
  T("ela vê o que sugeriu na própria tela", gravou.naTela, gravou);
  T("e o app confirma que chegou na escola", gravou.recado, gravou);
  await cA.close();

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
