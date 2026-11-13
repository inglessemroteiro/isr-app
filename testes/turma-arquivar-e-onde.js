// A turma pode ser arquivada, e sabe onde a aula acontece.
//
// DUAS COISAS QUE A TURMA NÃO TINHA
//
// 1 · Arquivar. Só existia excluir — e excluir desliga as alunas e
//     leva o histórico junto. Turma que acabou precisa sair da frente
//     sem sair do sistema: a chamada de agosto, a folha de agosto e a
//     ficha da aluna continuam apontando para ela.
//
//     Por isso turmasLista() continua devolvendo TUDO. Quem esconde a
//     arquivada é quem monta lista de TRABALHO: a agenda (e com ela a
//     pilha de chamadas pendentes), as pendências da escola e as
//     turmas abaixo do mínimo.
//
// 2 · Online ou presencial. A escola tem as duas, e isso não estava
//     em lugar nenhum da turma.
//
//     O campo NÃO se chama "formato": esse já existe na turma e quer
//     dizer se o caderno da aula é digital ou em papel. São duas
//     perguntas diferentes — há turma online com aluna que escreve à
//     mão —, e usar a mesma palavra quebraria a que já existe. Esta
//     suíte guarda essa separação.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1400, height: 1500 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Turmas v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— arquivar tira do trabalho e deixa o histórico —");
  const antes = await p.evaluate(() => {
    const C = window.ISRCRM;
    // uma turma com dia da semana no rótulo: é o que faz a agenda
    // gerar aula para ela, e é a agenda que alimenta as pendências
    const u = C.turmasLista().filter(x => /MON|TUE|WED|THU|FRI/i.test(x.turma))[0];
    const label = u.nivel + " · " + u.turma;
    return {
      id: u.id, label: label, turma: u.turma,
      naAgenda: C.agendaItens(30).filter(i => i.turmaId === u.id).length,
      alunas: C.getPessoas().filter(x => x.turma === label).length,
      abaixoDoMinimo: C.turmasAbaixoDoMinimo().some(x => x.id === u.id),
      ativas: C.turmasAtivas().length, todas: C.turmasLista().length
    };
  });
  T("o cenário tem turma com aula na agenda", antes.naAgenda > 0, antes);
  T("e as duas listas começam iguais", antes.ativas === antes.todas, antes);

  const depois = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const r = C.arquivarTurma(d.id, true);
    return {
      ok: !!(r && r.ok), arquivada: r.arquivada,
      naAgenda: C.agendaItens(30).filter(i => i.turmaId === d.id).length,
      // o histórico fica: a turma continua em turmasLista, com as alunas
      naLista: C.turmasLista().some(x => x.id === d.id),
      nasAtivas: C.turmasAtivas().some(x => x.id === d.id),
      alunas: C.getPessoas().filter(x => x.turma === d.label).length,
      abaixoDoMinimo: C.turmasAbaixoDoMinimo().some(x => x.id === d.id),
      // as chamadas já salvas continuam encontrando a turma
      chamadas: (C.chamadasDaTurma(d.label) || []).length
    };
  }, antes);
  T("arquivar responde ok", depois.ok && !!depois.arquivada, depois);
  T("a turma sai da agenda", depois.naAgenda === 0, depois);
  T("e some das listas de trabalho",
    depois.nasAtivas === false && depois.abaixoDoMinimo === false, depois);
  T("mas continua existindo", depois.naLista === true, depois);
  T("com as alunas ainda ligadas a ela",
    depois.alunas === antes.alunas && antes.alunas > 0, { antes, depois });
  T("e as chamadas dela continuam encontráveis",
    depois.chamadas >= 0 && depois.naLista, depois);

  console.log("\n— a pilha de chamadas para de cobrar a turma encerrada —");
  const pilha = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const comArquivada = C.chamadasPendentes(null, 60)
      .filter(x => x.turmaId === d.id).length;
    C.arquivarTurma(d.id, false);
    const semArquivar = C.chamadasPendentes(null, 60)
      .filter(x => x.turmaId === d.id).length;
    C.arquivarTurma(d.id, true);
    return { comArquivada: comArquivada, semArquivar: semArquivar };
  }, antes);
  T("arquivada, a turma não aparece na pilha",
    pilha.comArquivada === 0, pilha);
  T("e desarquivada ela volta a aparecer",
    pilha.semArquivar > 0, pilha);

  console.log("\n— desarquivar devolve a turma ao trabalho —");
  const voltou = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const r = C.arquivarTurma(d.id, false);
    return { arquivada: r.arquivada,
      nasAtivas: C.turmasAtivas().some(x => x.id === d.id),
      naAgenda: C.agendaItens(30).filter(i => i.turmaId === d.id).length };
  }, antes);
  T("deixa de estar arquivada", voltou.arquivada === false, voltou);
  T("volta às ativas e à agenda",
    voltou.nasAtivas === true && voltou.naAgenda > 0, voltou);

  console.log("\n— online ou presencial, sem atropelar o caderno —");
  const onde = await p.evaluate((d) => {
    const C = window.ISRCRM;
    // a turma começa com o caderno em papel: é o outro campo, e ele
    // não pode se mexer quando a modalidade muda
    C.updateTurma(d.id, { formato: "papel" });
    const inicio = C.ocupacaoTurmas().filter(x => x.id === d.id)[0];
    C.updateTurma(d.id, { modalidade: "presencial", local: "Rua da Escola, 10" });
    const agora = C.ocupacaoTurmas().filter(x => x.id === d.id)[0];
    C.updateTurma(d.id, { modalidade: "online" });
    const online = C.ocupacaoTurmas().filter(x => x.id === d.id)[0];
    return {
      inicioModalidade: inicio.modalidade, inicioCaderno: inicio.formato,
      modalidade: agora.modalidade, local: agora.local, caderno: agora.formato,
      depoisOnline: online.modalidade, localGuardado: online.local,
      cadernoDepois: online.formato
    };
  }, antes);
  T("sem ninguém dizer, a turma conta como online",
    onde.inicioModalidade === "online", onde);
  T("e o caderno em papel continua em papel",
    onde.inicioCaderno === "papel", onde);
  T("marcar presencial grava a modalidade e o endereço",
    onde.modalidade === "presencial" && /Rua da Escola/.test(onde.local), onde);
  T("sem mexer no caderno", onde.caderno === "papel", onde);
  T("voltar para online muda a modalidade", onde.depoisOnline === "online", onde);
  T("e guarda o endereço, para quando a turma voltar",
    /Rua da Escola/.test(onde.localGuardado), onde);
  T("o caderno segue intocado o tempo todo", onde.cadernoDepois === "papel", onde);

  console.log("\n— a tela de Turmas tem a aba e o botão —");
  await p.reload();
  await p.waitForTimeout(3000);
  const abas = await p.evaluate(() =>
    [...document.querySelectorAll("main button")].map(x => x.textContent.trim()));
  T("existe a aba Arquivadas",
    abas.some(t => /^Arquivadas/.test(t)), abas.slice(0, 12));

  const naTela = await p.evaluate((d) => {
    const C = window.ISRCRM;
    C.arquivarTurma(d.id, true);
    return true;
  }, antes);
  await p.reload();
  await p.waitForTimeout(3000);
  const contagem = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const t = document.querySelector("main").innerText.replace(/\s+/g, " ");
    return {
      // conta as linhas: o rótulo do horário pode se repetir entre
      // turmas, e a contagem é o que diz se a arquivada saiu
      linhas: [...document.querySelectorAll("main button")]
        .filter(x => x.textContent.trim() === "editar").length,
      ativas: C.turmasAtivas().length, todas: C.turmasLista().length
    };
  }, antes);
  T("a aba Todas mostra só as ativas",
    contagem.linhas === contagem.ativas && naTela, contagem);
  T("e a conta das ativas cai em uma",
    contagem.ativas === contagem.todas - 1, contagem);

  const naAbaArquivadas = await p.evaluate((d) => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Arquivadas/.test(x.textContent.trim()))[0];
    if (!bt) return null;
    bt.click();
    return null;
  }, antes);
  await p.waitForTimeout(900);
  const dentro = await p.evaluate((d) => {
    const t = document.querySelector("main").innerText.replace(/\s+/g, " ");
    // o rótulo sai em dois pedaços na linha, então a busca é pelo
    // horário, que é a parte que identifica a turma
    return { tem: t.indexOf(d.turma) >= 0, trecho: t.slice(0, 400) };
  }, antes);
  T("e aparece na aba Arquivadas", dentro.tem === true, dentro);

  T("nenhum erro de página", erros.length === 0, erros);
  await ctx.close();
  await b.close();
  fim();
})();
