// O cofre da aluna não reinicia quando outro aparelho sincroniza.
//
// A ALUNA PERDIA O COFRE INTEIRO.
//
// Alguns mapas guardam uma LISTA por chave: as palavras do cofre de
// cada aluna, os lançamentos de milhas de cada aluna. A mesclagem
// comparava o carimbo do VALOR — e lista não tem carimbo, então os
// dois lados valiam zero, o empate ficava com o lado local, e o
// aparelho que sincronizasse por último gravava a sua cópia inteira
// por cima.
//
// Na prática: a aluna guardava palavras novas no Review; depois
// qualquer aparelho da escola, com uma cópia velha da lista dela,
// mandava a dele e apagava as palavras novas. O cofre "reiniciava",
// sem erro nenhum na tela. As milhas tinham o mesmo caminho.
//
// O que esta suíte guarda:
//   — a união dos dois lados, sempre: o que existe num lado só fica;
//   — registro nos dois lados fica com o carimbo mais novo;
//   — apagar continua valendo, porque apagar deixa lápide — sem
//     ela, a palavra apagada voltaria na sincronização seguinte;
//   — e o mapa cujo valor é objeto sem carimbo também não perde: a
//     união campo a campo preserva o que só um lado tem.
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
  await p.goto(P.endereco("ISR - Alunas v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— a aluna guarda, a escola sincroniza, nada se perde —");
  const caso = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.status === "aluna")[0];
    // o aparelho da aluna: ela acabou de guardar duas palavras
    C.salvarPalavra(a.id, { palavra: "cutlery", traducao: "talheres" });
    C.salvarPalavra(a.id, { palavra: "leftovers", traducao: "sobras" });
    const dela = JSON.parse(localStorage.getItem("isr_palavras_v1"));
    // o aparelho da escola: a cópia dele é de antes, e tem outra
    const daEscola = JSON.parse(JSON.stringify(dela));
    daEscola[a.id] = [{ id: "pv-antiga", palavra: "dough", traducao: "massa",
      em: "2026-10-01", nivel: 0, acertos: 0, erros: 0, proxima: "2026-10-01", _v: 1 }];
    const juntas = C.mesclarMapaParaTeste(daEscola, dela);
    const nomes = (juntas[a.id] || []).map(x => x.palavra).sort();
    return { alunaId: a.id, nomes: nomes };
  });
  T("as palavras da aluna sobrevivem ao aparelho da escola",
    caso.nomes.indexOf("cutlery") >= 0 && caso.nomes.indexOf("leftovers") >= 0, caso.nomes);
  T("e a palavra que só a escola tinha também",
    caso.nomes.indexOf("dough") >= 0, caso.nomes);

  console.log("\n— nos dois lados, vale o carimbo mais novo —");
  const carimbo = await p.evaluate(() => {
    const C = window.ISRCRM;
    const velho = { p1: [{ id: "w1", palavra: "dish", traducao: "prato velho", _v: 100 }] };
    const novo = { p1: [{ id: "w1", palavra: "dish", traducao: "prato novo", _v: 200 }] };
    return {
      aEsquerda: (C.mesclarMapaParaTeste(novo, velho).p1 || [])[0].traducao,
      aDireita: (C.mesclarMapaParaTeste(velho, novo).p1 || [])[0].traducao,
      quantos: (C.mesclarMapaParaTeste(novo, velho).p1 || []).length
    };
  });
  T("o registro mais novo vence dos dois sentidos",
    carimbo.aEsquerda === "prato novo" && carimbo.aDireita === "prato novo", carimbo);
  T("e não vira duplicata", carimbo.quantos === 1, carimbo);

  console.log("\n— apagar continua valendo —");
  const apagou = await p.evaluate((alunaId) => {
    const C = window.ISRCRM;
    const antes = C.palavrasDaAluna(alunaId).filter(x => x.palavra === "cutlery")[0];
    C.removerPalavra(alunaId, antes.id);
    const some = C.palavrasDaAluna(alunaId).some(x => x.palavra === "cutlery");
    // o aparelho que ainda tem a palavra manda a cópia dele
    const dela = JSON.parse(localStorage.getItem("isr_palavras_v1"));
    const velho = JSON.parse(JSON.stringify(dela));
    velho[alunaId] = velho[alunaId].map(x => x.id === antes.id
      ? { id: antes.id, palavra: "cutlery", traducao: "talheres", _v: 1 } : x);
    const juntas = C.mesclarMapaParaTeste(velho, dela);
    const lapide = (juntas[alunaId] || []).filter(x => x.id === antes.id)[0];
    return { some: some, temLapide: !!(lapide && lapide.apagado) };
  }, caso.alunaId);
  T("a palavra apagada sai da lista da aluna", apagou.some === false, apagou);
  T("e não volta pela sincronização do outro aparelho",
    apagou.temLapide === true, apagou);

  console.log("\n— escrever de novo traz a palavra de volta —");
  const voltou = await p.evaluate((alunaId) => {
    const C = window.ISRCRM;
    C.salvarPalavra(alunaId, { palavra: "cutlery", traducao: "talheres, de novo" });
    const w = C.palavrasDaAluna(alunaId).filter(x => x.palavra === "cutlery")[0];
    return { tem: !!w, traducao: w ? w.traducao : "", proxima: w ? !!w.proxima : false };
  }, caso.alunaId);
  T("a mesma palavra escrita de novo reaparece",
    voltou.tem && /de novo/.test(voltou.traducao), voltou);
  T("e volta pronta para revisão", voltou.proxima, voltou);

  console.log("\n— as milhas seguem o mesmo caminho —");
  const milhas = await p.evaluate(() => {
    const C = window.ISRCRM;
    const noAparelho = { p9: [{ id: "mo1", valor: 25, motivo: "primeira aula", em: "2026-10-01" }] };
    const naEscola = { p9: [{ id: "mo1", valor: 25, motivo: "primeira aula", em: "2026-10-01" },
      { id: "mo2", valor: 15, motivo: "caderno", em: "2026-11-01" }] };
    const juntas = C.mesclarMapaParaTeste(noAparelho, naEscola);
    return (juntas.p9 || []).map(x => x.id).sort();
  });
  T("nenhum lançamento de milha é descartado",
    milhas.join(",") === "mo1,mo2", milhas);

  console.log("\n— o mapa de objeto sem carimbo também não perde —");
  const objetos = await p.evaluate(() => {
    const C = window.ISRCRM;
    const umLado = { "2026.4": { syllabus: "link-do-syllabus" } };
    const outro = { "2026.4": { guias: { "Advanced (B2)": "link-do-guia" } } };
    const j = C.mesclarMapaParaTeste(umLado, outro)["2026.4"];
    return { temSyllabus: !!j.syllabus, temGuia: !!(j.guias && j.guias["Advanced (B2)"]) };
  });
  T("o que só um lado tem sobrevive à mesclagem",
    objetos.temSyllabus && objetos.temGuia, objetos);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
