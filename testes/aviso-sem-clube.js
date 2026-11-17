// A Érika é avisada de quem está sem clube — uma vez só.
//
// O plano inclui dois clubes. Aluna que não usa nenhum está deixando
// na mesa o que já pagou, e quem fala com ela sobre isso é a Érika.
// O aviso existe para a conversa acontecer ANTES de a aluna reclamar.
//
// O que esta suíte guarda:
//   — o aviso nasce na fila da Érika, com a aluna e o que oferecer;
//   — UMA VEZ SÓ: dado como feito, não volta. Nem no dia seguinte,
//     nem se a aluna entrar num clube e sair depois;
//   — some sozinho quando ela entra num clube, sem ninguém marcar;
//   — não aparece nas duas primeiras semanas, que são da integração;
//   — não aparece quando não há clube no ar para oferecer;
//   — é da Érika: não entra na fila da comercial nem na da professora.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    gestao: { nome: "Érika", perfil: "operacao", papeis: ["operacao"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", (e) => erros.push(String(e).slice(0, 220)));

  await p.goto(P.endereco("ISR - Central v3.dc.html"));
  await p.waitForTimeout(3000);

  // ── o cenário ────────────────────────────────────────────────
  const cen = await p.evaluate(() => {
    const C = window.ISRCRM;
    const porAluna = C.clubesPorAluna();
    const alunas = C.getPessoas().filter((x) => x.status === "aluna");
    // uma aluna de casa há muito tempo e sem clube nenhum
    const semClube = alunas.filter((a) => {
      const s = C.situacaoDe(a);
      return !(porAluna[a.id] > 0) && s.diasDeCasa >= 14;
    });
    return { clubes: C.clubesPublicados(), nAlunas: alunas.length,
      nSemClube: semClube.length,
      alvo: semClube[0] ? { id: semClube[0].id, nome: semClube[0].nome } : null };
  });
  T("a escola tem clube no ar para oferecer", cen.clubes.total > 0, cen.clubes);
  T("há aluna sem clube no cenário", cen.nSemClube > 0,
    cen.nSemClube + " de " + cen.nAlunas);
  T("e dá para escolher uma", !!cen.alvo, cen.alvo);

  // ── o aviso está na fila da Érika ────────────────────────────
  const naFila = await p.evaluate((alvo) => {
    const C = window.ISRCRM;
    const f = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube");
    const meu = f.filter((x) => x.pessoaId === alvo.id)[0] || null;
    return { quantos: f.length, item: meu };
  }, cen.alvo);
  T("o aviso aparece na fila da Érika", naFila.quantos > 0, naFila.quantos);
  T("a aluna escolhida está nele", !!naFila.item, naFila.item);
  T("o dono é a Érika", !!naFila.item && naFila.item.dono === "Érika", naFila.item);
  T("diz quantos clubes o plano inclui",
    !!naFila.item && /2 inclusos/.test(naFila.item.motivo), naFila.item && naFila.item.motivo);
  T("diz o que há para oferecer",
    !!naFila.item && /com vaga|lista de espera/.test(naFila.item.motivo),
    naFila.item && naFila.item.motivo);
  T("e traz a ação, não só o aviso",
    !!naFila.item && /clube/i.test(naFila.item.acao || ""), naFila.item && naFila.item.acao);
  T("com um modelo de mensagem pronto",
    !!naFila.item && naFila.item.tpl === "clube_convite", naFila.item && naFila.item.tpl);

  // o modelo existe de verdade
  const tpl = await p.evaluate(() => {
    const C = window.ISRCRM;
    const t = (C.TEMPLATES || []).filter((x) => x.id === "clube_convite")[0];
    return t ? { titulo: t.titulo, temCorpo: !!(t.corpo || "").trim() } : null;
  });
  T("o modelo clube_convite existe", !!tpl && tpl.temCorpo, tpl);

  // ── uma vez só ───────────────────────────────────────────────
  const umaVez = await p.evaluate((alvo) => {
    const C = window.ISRCRM;
    const pega = () => (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube" && x.pessoaId === alvo.id).length;
    const antes = pega();
    const item = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube" && x.pessoaId === alvo.id)[0];
    C.marcarItemFeito("sem_clube", item.pessoaId, item.fato);
    return { antes: antes, depois: pega(), fato: item.fato };
  }, cen.alvo);
  T("antes de marcar, o aviso está lá", umaVez.antes === 1, umaVez);
  T("dado como feito, o aviso sai da fila", umaVez.depois === 0, umaVez);
  T("o fato é fixo — é o que o faz não voltar", umaVez.fato === "sem_clube", umaVez.fato);

  // recarregar a página não o traz de volta
  await p.reload();
  await p.waitForTimeout(2500);
  const depoisDeRecarregar = await p.evaluate((alvo) => {
    const C = window.ISRCRM;
    return (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube" && x.pessoaId === alvo.id).length;
  }, cen.alvo);
  T("e não volta ao recarregar a tela", depoisDeRecarregar === 0, depoisDeRecarregar);

  // nem depois de entrar num clube e sair dele
  const idaEVolta = await p.evaluate((alvo) => {
    const C = window.ISRCRM;
    const cl = C.clubesLista().filter((c) => c.status === "publicado")[0];
    C.clubeEntrar(cl.id, alvo.id);
    const dentro = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube" && x.pessoaId === alvo.id).length;
    C.clubeSair(cl.id, alvo.id);
    const fora = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube" && x.pessoaId === alvo.id).length;
    return { dentro: dentro, fora: fora };
  }, cen.alvo);
  T("dentro do clube, nada na fila", idaEVolta.dentro === 0, idaEVolta);
  T("e ao sair do clube o aviso continua sem voltar", idaEVolta.fora === 0, idaEVolta);

  // ── some sozinho quando ela entra num clube ──────────────────
  const outra = await p.evaluate(() => {
    const C = window.ISRCRM;
    const f = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube");
    if (!f.length) return null;
    const alvo = f[0];
    const cl = C.clubesLista().filter((c) => c.status === "publicado")[0];
    C.clubeEntrar(cl.id, alvo.pessoaId);
    const depois = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube" && x.pessoaId === alvo.pessoaId).length;
    C.clubeSair(cl.id, alvo.pessoaId);
    return { nome: alvo.nome, depois: depois };
  });
  T("quem entra num clube sai da fila sem ninguém marcar",
    !!outra && outra.depois === 0, outra);

  // ── as duas primeiras semanas são da integração ──────────────
  const nova = await p.evaluate(() => {
    const C = window.ISRCRM;
    const hoje = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const ontem = new Date(hoje.getTime() - 3 * 86400000);
    const r = C.novaPessoa({ nome: "Recém Teste", email: "recem.teste@exemplo.invalido" });
    const id = r && r.id;
    if (!id) return { criou: false };
    C.updateLead(id, { status: "aluna", desde: iso(ontem), turma: "" });
    const dias = C.situacaoDe(C.getPessoas().filter((x) => x.id === id)[0]).diasDeCasa;
    const n = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube" && x.pessoaId === id).length;
    return { criou: true, id: id, dias: dias, naFila: n };
  });
  T("aluna de três dias de casa não entra no aviso",
    nova.criou && nova.dias < 14 && nova.naFila === 0, nova);

  // e entra quando passa das duas semanas
  const madura = await p.evaluate((id) => {
    const C = window.ISRCRM;
    const hoje = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    C.updateLead(id, { desde: iso(new Date(hoje.getTime() - 40 * 86400000)) });
    return (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube" && x.pessoaId === id).length;
  }, nova.id);
  T("a mesma aluna entra no aviso depois de 40 dias", madura === 1, madura);

  // ── sem clube no ar, não há o que avisar ─────────────────────
  const semOferta = await p.evaluate(() => {
    const C = window.ISRCRM;
    const pub = C.clubesLista().filter((c) => c.status === "publicado");
    pub.forEach((c) => C.clubeSalvar({ id: c.id, status: "rascunho" }));
    const n = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube").length;
    pub.forEach((c) => C.clubeSalvar({ id: c.id, status: "publicado" }));
    const volta = (C.filaParaHoje("operacao", "Érika") || [])
      .filter((x) => x.sinal === "sem_clube").length;
    return { semNenhum: n, comClube: volta };
  });
  T("sem clube no ar, o aviso não aparece", semOferta.semNenhum === 0, semOferta);
  T("e volta quando há clube publicado de novo", semOferta.comClube > 0, semOferta);

  // ── é da Érika ───────────────────────────────────────────────
  const dequem = await p.evaluate(() => {
    const C = window.ISRCRM;
    const conta = (perfil, nome) => (C.filaParaHoje(perfil, nome) || [])
      .filter((x) => x.sinal === "sem_clube").length;
    return { operacao: conta("operacao", "Érika"), comercial: conta("comercial", "Carla"),
      professora: conta("professora", "Gabi"), gestora: conta("gestora", "Gabi") };
  });
  T("na fila da operação, sim", dequem.operacao > 0, dequem);
  T("na da comercial, não", dequem.comercial === 0, dequem);
  T("na da professora, não", dequem.professora === 0, dequem);
  T("a gestora vê tudo, então vê também", dequem.gestora > 0, dequem);

  T("nenhum erro de JavaScript", erros.length === 0, erros.slice(0, 2));
  await b.close();
  fim();
})();
