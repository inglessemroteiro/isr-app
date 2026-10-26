// Quando o sistema diz que falta o que a ficha tem.
//
// Duas causas distintas, as duas desta base:
//
//   1 · a importação de matrículas do Slack escrevia CPF, RG e
//       endereço num objeto p.docs que nada no sistema lê — ficha,
//       contrato e exportação leem p.cpf, p.rg e p.logradouro, soltos
//       na pessoa. Os dados estavam guardados e invisíveis, e a ficha
//       seguia pedindo o que já tinha;
//
//   2 · ids repetidos. A importação antiga carimbava o mesmo id em
//       pessoas criadas no mesmo milissegundo, e getPessoa devolve
//       sempre a primeira. A lista mostrava o nome de uma aluna com a
//       situação de acesso de outra: ficha com e-mail aparecendo como
//       "sem e-mail na ficha". Quem já tem o registro passa o
//       registro, e o conferidor de duplicadas passa a enxergar o
//       caso — era o único que ele pulava.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1400 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 220)));

  await p.goto(P.endereco("ISR - Alunas v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— o documento guardado no lugar errado —");
  const docs = await p.evaluate(() => {
    const C = window.ISRCRM;
    // uma ficha como a importação do Slack a deixava
    const alvo = C.getPessoas().filter(x => x.status === "aluna")[0];
    const bruto = JSON.parse(localStorage.getItem("isr_pessoas_v3"));
    const reg = bruto.filter(x => x.id === alvo.id)[0];
    reg.docs = { cpf: "123.456.789-00", rg: "11.222.333-4",
      logradouro: "Rua de Teste, sem número" };
    delete reg.cpf; delete reg.rg; delete reg.logradouro;
    localStorage.setItem("isr_pessoas_v3", JSON.stringify(bruto));
    return { id: alvo.id, nome: alvo.nome };
  });
  await p.reload();
  await p.waitForTimeout(3000);
  const resgatado = await p.evaluate((d) => {
    const C = window.ISRCRM;
    const x = C.getPessoa(d.id) || {};
    return { cpf: x.cpf || "", rg: x.rg || "", rua: x.logradouro || "",
      sobrou: !!x.docs };
  }, docs);
  T("o CPF volta para onde a ficha o procura",
    resgatado.cpf === "123.456.789-00", resgatado);
  T("o RG também", resgatado.rg === "11.222.333-4", resgatado);
  T("e o endereço", /Rua de Teste/.test(resgatado.rua), resgatado);
  T("o esconderijo some da ficha", !resgatado.sobrou, resgatado);

  const naFicha = await p.evaluate(async (d) => {
    const r = await fetch("/ISR%20-%20Perfil%20v3.dc.html");
    return r.ok;
  }, docs);
  T("a tela da ficha existe para ler isso", naFicha, { naFicha });

  // e não sobrescreve o que já está preenchido
  const naoPisa = await p.evaluate(() => {
    const C = window.ISRCRM;
    const alvo = C.getPessoas().filter(x => x.status === "aluna")[1];
    C.atualizarCadastro(alvo.id, { cpf: "999.999.999-99" });
    const bruto = JSON.parse(localStorage.getItem("isr_pessoas_v3"));
    const reg = bruto.filter(x => x.id === alvo.id)[0];
    reg.docs = { cpf: "000.000.000-00" };
    localStorage.setItem("isr_pessoas_v3", JSON.stringify(bruto));
    return alvo.id;
  });
  await p.reload();
  await p.waitForTimeout(3000);
  const manteve = await p.evaluate((id) => (window.ISRCRM.getPessoa(id) || {}).cpf, naoPisa);
  T("o resgate não passa por cima do que já estava na ficha",
    manteve === "999.999.999-99", { manteve });

  console.log("\n— a ficha mostra o que tem, e o exemplo é exemplo —");
  const alvo = await p.evaluate(() => {
    const C = window.ISRCRM;
    const a2 = C.getPessoas().filter(x => x.status === "aluna" && x.email)[0];
    C.atualizarCadastro(a2.id, { cpf: "321.654.987-00" });
    return { id: a2.id, email: a2.email, nome: a2.nome };
  });
  const p2 = await ctx.newPage();
  p2.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p2.goto(P.endereco("ISR - Perfil v3.dc.html") + "?id=" + alvo.id);
  await p2.waitForTimeout(3000);
  await p2.evaluate(() => {
    const bt = [...document.querySelectorAll("button")]
      .filter(x => /Editar dados/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
  });
  await p2.waitForTimeout(1200);
  const campos = await p2.evaluate(() => {
    const porRotulo = {};
    [...document.querySelectorAll("input")].forEach(i => {
      const r = i.parentElement && i.parentElement.firstElementChild;
      const rot = r ? r.textContent.trim().toLowerCase() : "";
      if (rot && !porRotulo[rot]) porRotulo[rot] = { valor: i.value, exemplo: i.placeholder };
    });
    return { email: porRotulo["e-mail"], cpf: porRotulo["cpf"],
      vazio: porRotulo["nascimento"], nome: porRotulo["nome"] };
  });
  T("o e-mail aparece como valor do campo, não como sugestão",
    !!campos.email && campos.email.valor === alvo.email, campos.email);
  T("o CPF guardado também",
    !!campos.cpf && campos.cpf.valor === "321.654.987-00", campos.cpf);
  T("campo sem dado fica vazio, com o exemplo em cinza",
    !!campos.vazio && campos.vazio.valor === ""
    && /dd\/mm\/aaaa/.test(campos.vazio.exemplo), campos.vazio);
  T("e o nome vem preenchido", !!campos.nome && campos.nome.valor === alvo.nome, campos.nome);

  // corrigir uma letra não obriga a redigitar tudo
  const corrigido = await p2.evaluate(async (a2) => {
    const inp = [...document.querySelectorAll("input")].filter(i => {
      const r = i.parentElement && i.parentElement.firstElementChild;
      return r && r.textContent.trim().toLowerCase() === "e-mail";
    })[0];
    const setar = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value").set;
    setar.call(inp, a2.email.replace("@", "x@"));
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const bt = [...document.querySelectorAll("button")]
      .filter(x => x.textContent.trim() === "Salvar")[0];
    if (bt) bt.click();
    await new Promise(r => setTimeout(r, 700));
    return (window.ISRCRM.getPessoa(a2.id) || {}).email;
  }, alvo);
  T("editar o campo grava só o que mudou",
    corrigido === alvo.email.replace("@", "x@"), { corrigido, antes: alvo.email });
  await p2.close();

  console.log("\n— o id repetido, que trocava a situação de uma pela da outra —");
  const gemeas = await p.evaluate(() => {
    const bruto = JSON.parse(localStorage.getItem("isr_pessoas_v3"));
    const base = bruto.filter(x => x.status === "aluna" && x.email && x.turma)[0];
    // a cópia de id repetido, como a importação antiga a deixava:
    // mesma pessoa, sem e-mail, e ANTES na lista — é ela que getPessoa
    // encontrava primeiro
    const copia = JSON.parse(JSON.stringify(base));
    copia.email = "";
    bruto.unshift(copia);
    localStorage.setItem("isr_pessoas_v3", JSON.stringify(bruto));
    return { id: base.id, nome: base.nome, email: base.email };
  });
  // antes de qualquer conserto, é assim que a confusão acontecia
  const trocado = await p.evaluate((g) => {
    const C = window.ISRCRM;
    const bruto = JSON.parse(localStorage.getItem("isr_pessoas_v3"));
    const comEmail = bruto.filter(x => x.id === g.id && x.email)[0];
    const semEmail = bruto.filter(x => x.id === g.id && !x.email)[0];
    return {
      peloRegistroCerto: C.situacaoDeAcesso(comEmail).estado,
      peloRegistroErrado: C.situacaoDeAcesso(semEmail).estado
    };
  }, gemeas);
  T("pelo registro, cada ficha responde por si",
    trocado.peloRegistroCerto !== "semEmail"
    && trocado.peloRegistroErrado === "semEmail", trocado);

  await p.reload();
  await p.waitForTimeout(3200);
  const consertado = await p.evaluate((g) => {
    const C = window.ISRCRM;
    const bruto = JSON.parse(localStorage.getItem("isr_pessoas_v3"));
    const mesmoNome = bruto.filter(x => x.nome === g.nome && !x.apagado);
    const ids = {};
    bruto.forEach(x => { if (x.id) ids[x.id] = (ids[x.id] || 0) + 1; });
    return { copias: mesmoNome.length,
      idsRepetidos: Object.keys(ids).filter(k => ids[k] > 1).length,
      apontadas: C.pessoasDuplicadas()
        .filter(x => x.manter && x.manter.nome === g.nome).length };
  }, gemeas);
  T("abrir o app separa os ids repetidos", consertado.idsRepetidos === 0, consertado);
  T("as duas fichas continuam lá, para a escola decidir",
    consertado.copias >= 2, consertado);
  T("e o conferidor de duplicadas aponta o par",
    consertado.apontadas > 0, consertado);

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
