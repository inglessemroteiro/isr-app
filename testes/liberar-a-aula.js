// Liberar a aula, onde a aula está.
//
// Publicar o plano e liberar a aula são duas coisas, e a tela tratava
// só da primeira. Publicar faz a aluna LER a aula. Liberar faz o
// caderno dela abrir para ESCREVER — é o que iniciarAula marca, e é o
// que o app da aluna confere antes de aceitar uma resposta.
//
// O botão que libera existia num lugar só: o herói do painel. E o
// herói só o mostra no dia da aula. Quem estava na tela da turma,
// olhando o plano da aula de hoje, não tinha como liberá-la — a
// pergunta foi exatamente essa: "como que o prof vai turn on the
// lesson para que o aluno consiga responder no caderno?".
//
// O que esta suíte guarda:
//   — na aba do plano, a aula de hoje traz os botões de começar e de
//     fazer a chamada, junto de Ajustar e Publicar;
//   — o toque marca a aula como ao vivo, que é o que abre o caderno;
//   — ao vivo, o botão vira Encerrar, e encerrar fecha o caderno;
//   — a tela diz a diferença entre publicar e liberar, porque as duas
//     palavras parecem a mesma coisa e não são;
//   — e o botão NÃO espera o dia. Ele só aparecia na sessão de hoje,
//     e aula muda de dia: a professora remarca, antecipa, repõe. A
//     tela não tem como saber quando a aula vai acontecer de verdade
//     — quem sabe é ela. Na sessão de outro dia, a tela diz de que
//     dia ela é: informação, não trava.
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

  await p.goto(P.endereco("ISR - Turmas v3.dc.html"));
  await p.waitForTimeout(2500);
  const alvo = await p.evaluate(() => {
    const C = window.ISRCRM;
    const hoje = new Date().toISOString().slice(0, 10);
    let comHoje = null, semHoje = null;
    C.turmasLista().forEach(u => {
      const m = C.datasDasSessoes ? C.datasDasSessoes(u.id) : {};
      Object.keys(m).forEach(n => {
        if (!m[n]) return;
        if (m[n].data === hoje && !comHoje)
          comHoje = { id: u.id, n: Number(n), label: u.nivel + " · " + u.turma };
        if (m[n].data > hoje && !semHoje) semHoje = { id: u.id, n: Number(n) };
      });
    });
    return { comHoje, semHoje, hoje };
  });
  T("há uma turma com sessão hoje para abrir", !!alvo.comHoje, alvo);
  if (!alvo.comHoje) { await b.close(); return fim(); }

  await p.goto(P.endereco("ISR - Turma v3.dc.html") + "?id=" + alvo.comHoje.id + "&sub=plano");
  await p.waitForTimeout(3000);

  const botoes = () => p.evaluate(() => [...document.querySelectorAll("main button")]
    .map(x => x.textContent.trim())
    .filter(t => /Começar aula|Encerrar aula|Fazer chamada|Ajustar/i.test(t)));
  const texto = () => p.evaluate(() => (document.querySelector("main") || document.body)
    .innerText.replace(/\s+/g, " "));

  console.log("— a aula de hoje traz os botões —");
  let bts = await botoes();
  T("o botão de começar a aula está na tela do plano",
    bts.some(t => /Começar aula/.test(t)), bts);
  T("e o de fazer a chamada também", bts.some(t => /Fazer chamada/.test(t)), bts);
  T("sem tirar o Ajustar de lugar", bts.some(t => /Ajustar/.test(t)), bts);

  let t = await texto();
  T("a tela separa publicar de liberar",
    /Publicar abre esta aula para leitura\. Começar abre o caderno das alunas para escrita/.test(t),
    (t.match(/.{0,10}Publicar abre.{0,100}/) || [""])[0]);

  console.log("\n— o toque libera, e o caderno abre —");
  const antes = await p.evaluate((a) => window.ISRCRM.aulaViva(a.label, a.hoje).estado,
    { label: alvo.comHoje.label, hoje: alvo.hoje });
  T("antes do toque a aula não começou", antes === "nao_comecou", { antes });
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /Começar aula/.test(x.textContent))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1300);
  const vivo = await p.evaluate((a) => window.ISRCRM.aulaViva(a.label, a.hoje).estado,
    { label: alvo.comHoje.label, hoje: alvo.hoje });
  T("depois do toque a aula está ao vivo", vivo === "ao_vivo", { vivo });
  bts = await botoes();
  T("e o botão vira Encerrar", bts.some(t => /Encerrar aula/.test(t))
    && !bts.some(t => /Começar aula/.test(t)), bts);
  t = await texto();
  T("a tela diz que o caderno está aberto",
    /Caderno aberto para escrita/.test(t),
    (t.match(/.{0,10}Caderno aberto para escrita.{0,60}/) || [""])[0]);

  console.log("\n— encerrar fecha o caderno —");
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /Encerrar aula/.test(x.textContent))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1300);
  const fechada = await p.evaluate((a) => window.ISRCRM.aulaViva(a.label, a.hoje).estado,
    { label: alvo.comHoje.label, hoje: alvo.hoje });
  T("a aula sai do ar", fechada === "encerrada", { fechada });

  console.log("\n— a sessão de outro dia também se libera —");
  // na mesma turma, a sessão seguinte: a faixa de cima troca de sessão
  const trocou = await p.evaluate((n) => {
    const chip = [...document.querySelectorAll("main span")]
      .filter(x => x.children.length === 2
        && x.textContent.trim().indexOf("S" + (n + 1)) === 0)[0];
    if (!chip) return false;
    chip.click();
    return true;
  }, alvo.comHoje.n);
  await p.waitForTimeout(1400);
  T("a faixa troca para a sessão seguinte", trocou, { trocou });
  const bts2 = await botoes();
  T("o botão de começar continua lá",
    bts2.some(t => /Começar aula/.test(t)), bts2);
  const t2 = await texto();
  T("e a tela diz de que dia é essa sessão",
    /Sessão marcada para \d{2}\/\d{2}/.test(t2),
    (t2.match(/.{0,10}Sessão marcada para.{0,70}/) || [""])[0]);
  T("sem dizer que não dá para começar",
    !/não é possível|só no dia|aguarde/i.test(t2), (t2.match(/.{0,60}só no dia.{0,40}/) || [""])[0]);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
