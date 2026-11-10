// O programa arquivado que voltava, e as sessões que não subiam.
//
// "Eu já apaguei e ele continua aparecendo." / "O programa não subiu
// com ela."
//
// As duas são a mesma falha. Toda gravação de programa e de sessão
// passava por carimbarLista, que carimba só registro SEM carimbo.
// Registro que já tinha um ficava com o mesmo para sempre — e na
// mesclagem entre aparelhos o empate fica com a cópia que já estava
// lá. Então:
//
//   — arquivar um programa num aparelho era desfeito pelo outro na
//     sincronização seguinte, e ele voltava para a lista;
//   — escrever as dez sessões num aparelho não chegava aos outros,
//     que continuavam vendo o programa vazio.
//
// Agora o registro que muda é carimbado na hora.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];
  const ctx = await P.novoContexto(b, {
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Programas v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— arquivar carimba, e o arquivo resiste à mesclagem —");
  const arq = await p.evaluate(() => {
    const C = window.ISRCRM;
    const pg = C.programasEstudoLista()[0];
    const antes = (JSON.parse(localStorage.getItem("isr_programas_estudo_v1")) || [])
      .filter(x => x.id === pg.id)[0];
    const carimboAntes = antes._v || 0;
    // a cópia do outro aparelho: a mesma, sem arquivar
    const doOutro = JSON.parse(JSON.stringify(
      JSON.parse(localStorage.getItem("isr_programas_estudo_v1"))));
    C.arquivarProgramaEstudo(pg.id, true);
    const agora = (JSON.parse(localStorage.getItem("isr_programas_estudo_v1")) || [])
      .filter(x => x.id === pg.id)[0];
    const local = JSON.parse(localStorage.getItem("isr_programas_estudo_v1"));
    const juntos = C.mesclarListaParaTeste(local, doOutro, "id");
    const depoisDaMesclagem = (juntos.lista || []).filter(x => x.id === pg.id)[0];
    return { id: pg.id, carimboAntes: carimboAntes, carimboDepois: agora._v || 0,
      arquivado: !!agora.arquivado,
      continuaArquivado: !!(depoisDaMesclagem && depoisDaMesclagem.arquivado) };
  });
  T("arquivar grava o arquivamento", arq.arquivado === true, arq);
  T("e carimba o registro", arq.carimboDepois > arq.carimboAntes, arq);
  T("então a cópia do outro aparelho não o desarquiva",
    arq.continuaArquivado === true, arq);

  console.log("\n— a sessão escrita hoje vence a cópia de ontem —");
  const sessao = await p.evaluate(() => {
    const C = window.ISRCRM;
    const pg = C.programasEstudoLista().filter(x => x.sessoes > 0)[0];
    const doOutro = JSON.parse(JSON.stringify(
      JSON.parse(localStorage.getItem("isr_syllabus_v1")) || []));
    const antes = C.syllabusDoPrograma(pg.id).length;
    C.salvarSessaoSyllabus({ programaId: pg.id, nivel: pg.nivel, ciclo: "",
      n: 99, titulo: "Sessão Teste de Carimbo", objetivo: "para a suíte",
      etapas: [{ fase: "warmup", titulo: "abertura", min: 10 }] });
    const local = JSON.parse(localStorage.getItem("isr_syllabus_v1"));
    const juntos = C.mesclarListaParaTeste(local, doOutro, "id");
    const nova = (juntos.lista || []).filter(x => x.n === 99 && x.programaId === pg.id)[0];
    return { antes: antes, depois: C.syllabusDoPrograma(pg.id).length,
      sobreviveu: !!nova, carimbo: nova ? (nova._v || 0) : 0 };
  });
  T("a sessão nova entra no programa", sessao.depois === sessao.antes + 1, sessao);
  T("e sobrevive à mesclagem com o aparelho que não a tem",
    sessao.sobreviveu === true && sessao.carimbo > 0, sessao);

  console.log("\n— editar uma sessão que já existia também carimba —");
  const editada = await p.evaluate(() => {
    const C = window.ISRCRM;
    const pg = C.programasEstudoLista().filter(x => x.sessoes > 0)[0];
    const s1 = C.syllabusDoPrograma(pg.id)[0];
    const carimboAntes = s1._v || 0;
    const doOutro = JSON.parse(JSON.stringify(
      JSON.parse(localStorage.getItem("isr_syllabus_v1")) || []));
    C.salvarSessaoSyllabus({ id: s1.id, programaId: pg.id, nivel: pg.nivel,
      ciclo: s1.ciclo || "", n: s1.n, titulo: "Título Teste Trocado",
      objetivo: s1.objetivo || "", etapas: s1.etapas || [] });
    const local = JSON.parse(localStorage.getItem("isr_syllabus_v1"));
    const juntos = C.mesclarListaParaTeste(local, doOutro, "id");
    const depois = (juntos.lista || []).filter(x => x.id === s1.id)[0];
    return { carimboAntes: carimboAntes, titulo: depois ? depois.titulo : "",
      carimbo: depois ? (depois._v || 0) : 0 };
  });
  T("o título novo é o que fica depois da mesclagem",
    editada.titulo === "Título Teste Trocado", editada);
  T("porque o registro editado foi carimbado",
    editada.carimbo > editada.carimboAntes, editada);

  console.log("\n— programa vazio não entra na escolha da turma —");
  const escolha = await p.evaluate(() => {
    const C = window.ISRCRM;
    const u = C.turmasLista()[0];
    const r = C.salvarProgramaEstudo({ nome: "Vazio Teste", nivel: u.nivel });
    const lista = C.programasEstudoLista();
    return { criado: r.ok,
      naLista: lista.filter(x => x.nome === "Vazio Teste").length,
      sessoes: (lista.filter(x => x.nome === "Vazio Teste")[0] || {}).sessoes };
  });
  T("o programa vazio existe no repositório",
    escolha.criado && escolha.naLista === 1 && escolha.sessoes === 0, escolha);
  // uma turma cujo nível já tem programa com sessões: assim o vazio
  // não vira o programa dela por falta de opção
  const turmaId = await p.evaluate(() => {
    const C = window.ISRCRM;
    const u = C.turmasLista().filter(x => {
      const pg = C.programaDaTurma(x);
      return pg && (C.syllabusDoPrograma(pg.id) || []).length > 0;
    })[0];
    return u.id;
  });
  await p.goto(P.endereco("ISR - Turma v3.dc.html") + "?id=" + turmaId + "&sub=plano");
  await p.waitForTimeout(3000);
  const noPicker = await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^(Trocar|Escolher o programa|Change|Choose)/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
    return true;
  });
  await p.waitForTimeout(1400);
  const lista = await p.evaluate(() =>
    document.querySelector("main").innerText.replace(/\s+/g, " "));
  T("mas não aparece para a turma escolher",
    noPicker && lista.indexOf("Vazio Teste") < 0,
    (lista.match(/.{0,60}Vazio Teste.{0,30}/) || [""])[0]);
  T("e os que têm sessões aparecem",
    /\d+ sess/.test(lista), lista.slice(0, 200));

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
