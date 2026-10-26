// O e-mail colado da planilha que sumia sem avisar.
//
// A tela Importar tem uma caixa onde a escola cola as colunas Nome e
// E-mail. A divisão em colunas esperava tabulação, três espaços ou
// " | ". Texto copiado de uma tabela da tela, de uma mensagem ou de
// um PDF vem com UM espaço entre o nome e o e-mail: a linha inteira
// virava uma célula só, que por conter "@" era descartada como linha
// torta.
//
// E era descartada em silêncio. Quem colou cinquenta linhas e viu
// quarenta na conferência não tinha como saber quais dez faltaram —
// acreditava que os e-mails tinham entrado, e depois a lista de
// alunas dizia "sem e-mail na ficha".
//
// O que esta suíte guarda:
//   — nome e e-mail na mesma célula, separados por um espaço, são
//     lidos como duas colunas;
//   — a tabulação e os três espaços continuam valendo;
//   — linha que não dá para ler aparece na conferência, com o que
//     fazer a respeito — nunca some;
//   — o cabeçalho "Nome" continua fora da lista, que é o único
//     descarte que faz sentido.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1000 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Importar v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— nome e e-mail colados juntos —");
  const leu = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.email)[0];
    const b2 = C.getPessoas().filter(x => x.email && x.id !== a.id)[0];
    return {
      // um espaço só, como vem de uma tabela da tela
      umEspaco: C.lerAtualizacaoContatos(a.nome + " trocado@teste.local").linhas[0],
      // tabulação, como vem da planilha
      tab: C.lerAtualizacaoContatos(b2.nome + "\ttambem@teste.local").linhas[0],
      // três espaços, que também já funcionava
      tresEspacos: C.lerAtualizacaoContatos(a.nome + "   outro@teste.local").linhas[0],
      nomeA: a.nome, nomeB: b2.nome
    };
  });
  T("um espaço entre nome e e-mail é lido",
    !!leu.umEspaco && leu.umEspaco.acao === "atualizar"
    && leu.umEspaco.email === "trocado@teste.local", leu.umEspaco);
  T("e a aluna certa é encontrada",
    !!leu.umEspaco && leu.umEspaco.nomeSistema === leu.nomeA, leu.umEspaco);
  T("a tabulação continua valendo",
    !!leu.tab && leu.tab.email === "tambem@teste.local", leu.tab);
  T("e os três espaços também",
    !!leu.tresEspacos && leu.tresEspacos.email === "outro@teste.local", leu.tresEspacos);

  console.log("\n— nenhuma linha some em silêncio —");
  const nenhuma = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.email)[0];
    const texto = [
      "Nome\tE-mail",
      a.nome + "\tum@teste.local",
      "@@@ isto não é uma linha",
      "Fulana Que Nao Existe Teste\tdois@teste.local"
    ].join("\n");
    const r = C.lerAtualizacaoContatos(texto);
    return { total: r.linhas.length, acoes: r.linhas.map(l => l.acao) };
  });
  T("o cabeçalho sai, as outras três ficam", nenhuma.total === 3, nenhuma);
  T("a linha ilegível é apontada, não descartada",
    nenhuma.acoes.indexOf("nao-entendi") >= 0, nenhuma);
  T("quem não está no sistema também aparece",
    nenhuma.acoes.indexOf("nao-encontrada") >= 0, nenhuma);

  console.log("\n— a conferência na tela conta o que não entendeu —");
  // a aba "Atualizar contatos" usa a mesma caixa de colar
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("button")]
      .filter(x => /Atualizar contatos/i.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(900);
  const naTela = await p.evaluate(async () => {
    const C = window.ISRCRM;
    const a = C.getPessoas().filter(x => x.email)[0];
    const campo = document.querySelectorAll("textarea")[0];
    if (!campo) return { achou: false };
    campo.value = a.nome + "\tum@teste.local\n@@@ isto não é uma linha";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const bt = [...document.querySelectorAll("button")]
      .filter(x => /Ler a planilha/i.test(x.textContent.trim()))[0];
    if (bt) bt.click();
    await new Promise(r => setTimeout(r, 1200));
    return { achou: true,
      texto: (document.querySelector("main") || document.body)
        .innerText.replace(/\s+/g, " ") };
  });
  if (naTela.achou) {
    T("a tela mostra o selo da linha que não entendeu",
      /não entendi a linha/i.test(naTela.texto),
      (naTela.texto.match(/.{0,60}não entendi a linha.{0,80}/i) || [""])[0]);
    T("e diz o que fazer com ela",
      /Separe o nome do e-mail com tabulação/.test(naTela.texto),
      (naTela.texto.match(/.{0,30}Separe o nome.{0,70}/) || [""])[0]);
  } else {
    T("a caixa de colar contatos existe na tela", false, naTela);
  }

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
