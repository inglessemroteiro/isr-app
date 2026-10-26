// O clube tem dois donos, e um apagava o outro.
//
// Quem conduz o clube escreve o cadastro — nome, datas, descrição —
// no computador. As alunas escrevem quem está dentro, no celular. São
// o mesmo registro, e o sync o mesclava INTEIRO pelo carimbo mais
// novo. Duas perdas, as duas relatadas pela escola:
//
//   — a aluna entrou no clube pelo celular e a gestão continuava
//     vendo "0 de 10". Salvar o clube no computador devolvia o
//     registro sem ela;
//   — as datas dos encontros apareciam diferentes nos dois aparelhos:
//     a aluna via a versão anterior, porque entrar no clube
//     reescrevia o registro com as datas que o celular tinha.
//
// E havia um terceiro problema, debaixo dos dois: carimbarLista só
// carimba registro SEM carimbo. Clube que já tinha um ficava com o
// mesmo para sempre, e a mesclagem, no empate, prefere o que o
// aparelho já tem — então nenhum dos dois lados via a mudança do
// outro, em silêncio, sem conflito registrado.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1200 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Clubes v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— cada mudança deixa marca —");
  const carimbos = await p.evaluate(() => {
    const C = window.ISRCRM;
    const r = C.clubeSalvar({ nome: "Clube de Teste", professora: "Gabi",
      formato: "online", descricao: "Para a suíte.", link: "https://exemplo.local",
      dia: "terça", hora: "18:30", fuso: "America/Sao_Paulo", vagas: 10, nivel: "a2",
      encontros: [{ data: "2026-11-10", tema: "um" }, { data: "2026-11-24", tema: "dois" },
                  { data: "2026-12-08", tema: "três" }, { data: "2026-12-15", tema: "quatro" }] });
    const bruto = () => (JSON.parse(localStorage.getItem("isr_clubes_v1")) || [])
      .filter(x => x.id === r.id)[0];
    const nascimento = bruto()._v;
    C.clubeSalvar({ id: r.id, descricao: "Mudou a descrição." });
    const depoisDoCadastro = bruto()._v;
    const pessoa = C.getPessoas().filter(x => x.status === "aluna")[0];
    C.clubePublicar(r.id);
    C.clubeEntrar(r.id, pessoa.id);
    const d = bruto();
    return { id: r.id, pessoa: pessoa.id, nascimento,
      depoisDoCadastro, vmDepoisDaEntrada: d._vm,
      vDepoisDaEntrada: d._v };
  });
  T("editar o cadastro renova o carimbo do cadastro",
    carimbos.depoisDoCadastro > carimbos.nascimento, carimbos);
  T("entrar no clube renova o carimbo das inscritas",
    carimbos.vmDepoisDaEntrada > 0, carimbos);

  console.log("\n— a professora salva e a aluna continua inscrita —");
  const naoApaga = await p.evaluate((c) => {
    const C = window.ISRCRM;
    // o que o celular da aluna mandou: ela dentro, com as datas que
    // aquele aparelho tinha
    const bruto = JSON.parse(localStorage.getItem("isr_clubes_v1"));
    const doCelular = JSON.parse(JSON.stringify(bruto.filter(x => x.id === c.id)[0]));
    doCelular.encontros = [{ data: "2026-11-02", tema: "antigo" }];
    doCelular._v = (doCelular._v || 0) - 10000;   // cadastro velho
    doCelular._vm = (doCelular._vm || 0) + 10000; // inscrição nova

    // e o que o computador da professora tem: datas novas, sem ela
    const doComputador = JSON.parse(JSON.stringify(bruto.filter(x => x.id === c.id)[0]));
    doComputador.membros = [];
    doComputador.entrou = {};
    doComputador._v = (doComputador._v || 0) + 10000;
    doComputador._vm = (doComputador._vm || 0) - 10000;
    localStorage.setItem("isr_clubes_v1", JSON.stringify(
      bruto.filter(x => x.id !== c.id).concat([doComputador])));

    const r = C.mesclarComRemoto({ clubes: [doCelular] });
    const junto = (r.data.clubes || []).filter(x => x.id === c.id)[0];
    return { membros: junto.membros, datas: (junto.encontros || []).map(e => e.data),
      conflitos: r.conflitos };
  }, carimbos);
  T("a aluna que entrou pelo celular continua dentro",
    naoApaga.membros.indexOf(carimbos.pessoa) >= 0, naoApaga);
  T("e as datas que a professora salvou são as que ficam",
    naoApaga.datas.indexOf("2026-11-10") >= 0 && naoApaga.datas.indexOf("2026-11-02") < 0,
    naoApaga);
  T("a divergência é contada como conflito", naoApaga.conflitos > 0, naoApaga);

  console.log("\n— sair do clube também vale —");
  const saiu = await p.evaluate((c) => {
    const C = window.ISRCRM;
    const bruto = JSON.parse(localStorage.getItem("isr_clubes_v1"));
    const reg = bruto.filter(x => x.id === c.id)[0];
    // o aparelho remoto ainda tem a aluna dentro, com carimbo velho
    const antigo = JSON.parse(JSON.stringify(reg));
    antigo.membros = [c.pessoa];
    antigo.entrou = {}; antigo.entrou[c.pessoa] = "2026-10-01T00:00:00.000Z";
    antigo._vm = (antigo._vm || 0) - 10000;
    // e aqui ela saiu agora
    reg.membros = []; reg.entrou = {};
    reg._vm = Date.now();
    localStorage.setItem("isr_clubes_v1", JSON.stringify(bruto));
    const r = C.mesclarComRemoto({ clubes: [antigo] });
    return ((r.data.clubes || []).filter(x => x.id === c.id)[0] || {}).membros;
  }, carimbos);
  T("quem saiu não volta porque o outro aparelho ainda a listava",
    Array.isArray(saiu) && saiu.length === 0, { saiu });

  console.log("\n— a gestão vê quem entrou —");
  const naTela = await p.evaluate((c) => {
    const C = window.ISRCRM;
    C.clubeEntrar(c.id, c.pessoa);
    const cl = C.getClube(c.id);
    const resumo = C.clubesResumo();
    return { membros: (cl.membros || []).length, emClube: resumo.alunas };
  }, carimbos);
  T("o clube conta a inscrita", naTela.membros === 1, naTela);

  await p.reload();
  await p.waitForTimeout(3000);
  const texto = await p.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " "));
  T("e a tela da gestão mostra 1 de 10, não 0 de 10",
    /Clube de Teste[\s\S]{0,400}?1 de 10/.test(texto),
    (texto.match(/Clube de Teste.{0,160}/) || [""])[0]);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
