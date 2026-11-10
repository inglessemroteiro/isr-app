// O que foi marcado como feito na Central não volta.
//
// O RELATO: marca a atividade como feita, e depois ela aparece de novo.
//
// "adiar" e "feito" são dois gestos diferentes, e escreviam a mesma
// coisa: um adiamento de UM DIA, guardado só no localStorage daquele
// aparelho, sem nunca entrar no payload do sync. Duas consequências,
// as duas visíveis para quem trabalha na fila:
//
//   — o item marcado como feito no computador continuava na fila do
//     celular, porque a marca não viajava;
//   — e no dia seguinte voltava para todo mundo, mesmo resolvido,
//     porque a marca vencia à meia-noite.
//
// Agora "feito" é registro sincronizado como qualquer outro, e guarda
// QUAL fato foi resolvido: a parcela daquele vencimento, a falta
// daquele dia, o prazo daquela pendência. Enquanto o fato for o
// mesmo, o item fica fora. Fato novo — parcela nova atrasada, falta
// nova, prazo remarcado — é trabalho novo, e aí o item volta.
//
// "adiar" continua sendo o que era: não hoje, e volta amanhã.
//
// Esta suíte corre a fila dos quatro perfis, porque a Central é a
// mesma tela para todos e o relato é de uma pessoa só.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];

  const abrir = async (gestao, tela) => {
    const ctx = await P.novoContexto(b, {
      contexto: { viewport: { width: 1280, height: 1400 } }, gestao: gestao
    });
    const p = await ctx.newPage();
    p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
    await p.goto(P.endereco(tela || "ISR - Central v3.dc.html"));
    await p.waitForTimeout(2800);
    return { ctx, p };
  };

  // ── 1. a fila de cada perfil ────────────────────────────────────
  console.log("— o feito sai da fila e não volta, em todos os perfis —");
  const PERFIS = [
    { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] },
    { nome: "Carla", perfil: "comercial", papeis: ["comercial"] },
    { nome: "Érika", perfil: "operacao", papeis: ["operacao"] },
    { nome: "Bárbara", perfil: "professora", papeis: ["professora"] }
  ];
  for (const g of PERFIS) {
    const { ctx, p } = await abrir(g);
    // uma pendência mandada para esta pessoa, para que todo perfil
    // tenha os dois caminhos na fila: a pendência da equipe e, para
    // quem vê alunas, o sinal de aluna
    const r = await p.evaluate((gestao) => {
      const C = window.ISRCRM;
      const titulo = "Conferir a ficha da aluna Teste · " + gestao.perfil;
      C.addTarefa({ titulo: titulo, dono: gestao.nome, detalhe: "exemplo da suíte" });
      const fila = () => C.filaParaHoje(gestao.perfil, gestao.nome);
      const antes = fila();
      const pend = antes.filter(x => x.tarefaId && x.nome === titulo)[0];
      const sinal = antes.filter(x => !x.tarefaId)[0];
      const marcou = [];
      if (pend) { C.setTarefaFeita(pend.tarefaId, true); marcou.push(pend); }
      if (sinal) { C.marcarItemFeito(sinal.sinal || sinal.regra, sinal.pessoaId, sinal.fato); marcou.push(sinal); }
      const depois = fila();
      const aindaNaFila = (it) => depois.some(x =>
        (x.sinal || x.regra) === (it.sinal || it.regra) && x.pessoaId === it.pessoaId);
      return {
        quantos: antes.length, temPendencia: !!pend, temSinal: !!sinal,
        saiuTudo: marcou.every(it => !aindaNaFila(it)),
        restou: depois.length,
        // para conferir depois de recarregar
        chaves: marcou.map(it => ({ chave: it.sinal || it.regra, pessoaId: it.pessoaId }))
      };
    }, g);
    T("a fila de " + g.perfil + " recebe a pendência da equipe", r.temPendencia === true, r);
    T("  o que foi marcado sai da fila de " + g.perfil, r.saiuTudo === true, r);
    T("  e os outros continuam lá", r.restou === r.quantos - r.chaves.length, r);
    // recarregar é o teste do "depois": a marca tem de estar no
    // armazenamento, não só na memória da tela
    await p.reload();
    await p.waitForTimeout(2600);
    const voltou = await p.evaluate((d) => {
      const C = window.ISRCRM;
      const fila = C.filaParaHoje(d.perfil, d.nome);
      return d.chaves.filter(k => fila.some(x =>
        (x.sinal || x.regra) === k.chave && x.pessoaId === k.pessoaId));
    }, { perfil: g.perfil, nome: g.nome, chaves: r.chaves });
    T("  e não volta ao recarregar a tela de " + g.perfil, voltou.length === 0, voltou);
    await ctx.close();
  }

  // ── 2. a marca é durável, não um adiamento de um dia ────────────
  console.log("\n— feito não vence à meia-noite; adiar vence —");
  const { ctx: c2, p: p2 } = await abrir({ nome: "Érika", perfil: "operacao", papeis: ["operacao"] });
  const marcas = await p2.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna")[0];
    C.marcarItemFeito("parcela_atrasada", a.id, "2026-10-10|1");
    C.adiarItem("falta_recente", a.id);
    const todas = C.marcasFilaParaTeste();
    const feito = todas.filter(m => m.tipo === "feito")[0];
    const adiado = todas.filter(m => m.tipo === "adiado")[0];
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      feitoTemFato: !!feito && feito.fato === "2026-10-10|1",
      feitoSemDia: !!feito && !feito.dia,
      feitoCarimbado: !!feito && !!feito._v,
      feitoTemQuem: !!feito && !!feito.por,
      adiadoEhDeHoje: !!adiado && adiado.dia === hoje,
      // o adiamento de ontem já não vale; o feito de ontem continua valendo
      adiadoDeOntemVale: (() => {
        const l = C.marcasFilaParaTeste();
        l.forEach(m => { if (m.tipo === "adiado") m.dia = "2020-01-01"; });
        localStorage.setItem("isr_fila_marcas", JSON.stringify(l));
        return C.estaAdiado("falta_recente", a.id);
      })(),
      feitoDeOntemVale: C.estaFeito("parcela_atrasada", a.id, "2026-10-10|1"),
      alunaId: a.id
    };
  });
  T("o feito guarda o fato resolvido", marcas.feitoTemFato, marcas);
  T("e não guarda dia nenhum: não é um adiamento", marcas.feitoSemDia, marcas);
  T("vai carimbado, para a mesclagem saber quem decidiu por último",
    marcas.feitoCarimbado, marcas);
  T("e registra quem marcou", marcas.feitoTemQuem, marcas);
  T("o adiar continua sendo de hoje", marcas.adiadoEhDeHoje, marcas);
  T("adiamento de ontem não vale mais", marcas.adiadoDeOntemVale === false, marcas);
  T("e o feito de ontem continua valendo", marcas.feitoDeOntemVale === true, marcas);

  // ── 3. a marca viaja entre os aparelhos ─────────────────────────
  console.log("\n— a marca viaja: o celular não desfaz o computador —");
  const viaja = await p2.evaluate(() => {
    const C = window.ISRCRM;
    const noPayload = Object.prototype.hasOwnProperty.call(
      C.payloadParaTeste(), "marcasFila");
    const minhas = C.marcasFilaParaTeste();
    // o outro aparelho tem uma cópia de antes, sem a marca nova
    const doOutro = minhas.filter(m => m.tipo !== "feito");
    const juntas = C.mesclarListaParaTeste(minhas, doOutro, "id").lista;
    const aoContrario = C.mesclarListaParaTeste(doOutro, minhas, "id").lista;
    return {
      noPayload: noPayload,
      sobrevive: juntas.some(m => m.tipo === "feito"),
      sobreviveAoContrario: aoContrario.some(m => m.tipo === "feito"),
      semDuplicata: juntas.filter(m => m.tipo === "feito").length === 1
    };
  });
  T("a marca entra no que sobe para o banco", viaja.noPayload, viaja);
  T("a marca sobrevive à cópia velha do outro aparelho",
    viaja.sobrevive && viaja.sobreviveAoContrario, viaja);
  T("e não vira duplicata", viaja.semDuplicata, viaja);

  // ── 4. fato novo é trabalho novo: o item volta ──────────────────
  console.log("\n— fato novo traz o item de volta —");
  const fatoNovo = await p2.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna")[0];
    const sn = (id) => C.sinaisDe(a).filter(x => x.id === id)[0];
    const atual = sn("parcela_atrasada") || sn("falta_recente") || C.sinaisDe(a)[0];
    C.marcarItemFeito(atual.id, a.id, atual.fato);
    const mesmoFato = C.estaFeito(atual.id, a.id, atual.fato);
    const outroFato = C.estaFeito(atual.id, a.id, atual.fato + "|mais-uma");
    return { sinal: atual.id, mesmoFato: mesmoFato, outroFato: outroFato,
      temFato: !!atual.fato,
      // adiamento de outro dia não fica guardado para sempre
      adiamentoMorto: C.marcasFilaParaTeste()
        .some(m => m.tipo === "adiado" && m.dia !== new Date().toISOString().slice(0, 10)) };
  });
  T("todo sinal diz qual é o fato dele", fatoNovo.temFato, fatoNovo);
  T("adiamento de outro dia não fica guardado",
    fatoNovo.adiamentoMorto === false, fatoNovo);
  T("mesmo fato: continua marcado como feito", fatoNovo.mesmoFato === true, fatoNovo);
  T("fato diferente: volta para a fila", fatoNovo.outroFato === false, fatoNovo);

  console.log("\n— o fato não muda só porque o dia virou —");
  // "Contrato termina em 12 dias" vira 11 amanhã: se o fato fosse o
  // texto do detalhe, a renovação marcada como feita voltaria todo dia.
  const estavel = await p2.evaluate(() => {
    const C = window.ISRCRM;
    const comRenov = C.getPessoas().filter(x =>
      C.sinaisDe(x).some(s => s.id === "renovacao_aberta"))[0];
    if (!comRenov) return { semCaso: true };
    const s = C.sinaisDe(comRenov).filter(x => x.id === "renovacao_aberta")[0];
    const c = C.situacaoDe(comRenov).contrato || {};
    return { semCaso: false, fato: s.fato, detalhe: s.detalhe,
      presoAoFim: !!c.fim && s.fato.indexOf(c.fim) >= 0,
      semDiasNoFato: !/\d+ dias/.test(s.fato) };
  });
  if (!estavel.semCaso) {
    T("o fato da renovação é o fim do contrato, não a contagem de dias",
      estavel.presoAoFim && estavel.semDiasNoFato, estavel);
  }

  // ── 5. a pendência concluída também não volta ───────────────────
  console.log("\n— a pendência concluída não volta pela sincronização —");
  const pend = await p2.evaluate(() => {
    const C = window.ISRCRM;
    const titulo = "Conferir matrícula da aluna Teste";
    C.addTarefa({ titulo: titulo, dono: "Érika", detalhe: "exemplo da suíte" });
    const t = C.tarefasLista().filter(x => x.titulo === titulo)[0];
    C.setTarefaFeita(t.id, true);
    const minhas = JSON.parse(localStorage.getItem("isr_tarefas_v1"));
    const feita = minhas.filter(x => x.id === t.id)[0];
    // o outro aparelho ainda tem a pendência aberta, com carimbo velho
    const doOutro = minhas.map(x => x.id === t.id
      ? Object.assign({}, x, { feita: false, feitaEm: "", _v: 1 }) : x);
    const juntas = C.mesclarListaParaTeste(minhas, doOutro, "id").lista;
    const depois = juntas.filter(x => x.id === t.id)[0];
    return { marcada: !!(feita && feita.feita), carimbada: !!(feita && feita._v),
      continuaFeita: !!(depois && depois.feita) };
  });
  T("a pendência fica marcada como concluída", pend.marcada && pend.carimbada, pend);
  T("e a cópia velha do outro aparelho não a reabre",
    pend.continuaFeita === true, pend);

  await c2.close();

  // ── 6. a tela: clicar em feito e recarregar ─────────────────────
  console.log("\n— na tela, clicando: o cartão sai e não volta —");
  const { ctx: c3, p: p3 } = await abrir({ nome: "Érika", perfil: "operacao", papeis: ["operacao"] });
  const naTela = await p3.evaluate(() => {
    const nomes = [...document.querySelectorAll("main")]
      .map(m => m.innerText).join(" ");
    return { temFeito: /feito/.test(nomes) };
  });
  T("a fila da tela oferece o gesto de feito", naTela.temFeito, naTela);
  const antesDoClique = await p3.evaluate(() =>
    window.ISRCRM.filaParaHoje("operacao", "Érika").length);
  const clicou = await p3.evaluate(() => {
    const alvo = [...document.querySelectorAll("main span")]
      .filter(s => s.textContent.trim() === "feito")[0];
    if (!alvo) return false;
    alvo.click();
    return true;
  });
  T("o gesto de feito existe no primeiro cartão", clicou === true, clicou);
  await p3.waitForTimeout(1200);
  await p3.reload();
  await p3.waitForTimeout(2800);
  const depoisDoClique = await p3.evaluate(() =>
    window.ISRCRM.filaParaHoje("operacao", "Érika").length);
  T("a fila tem um item menos depois de recarregar",
    depoisDoClique === antesDoClique - 1, { antesDoClique, depoisDoClique });
  await c3.close();

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
