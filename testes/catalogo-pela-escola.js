// O catálogo dos clubes, visto de dentro da escola.
//
// O que esta suíte guarda:
//   — o catálogo morava só no app de cada aluna. Com clubes no ar, a
//     escola não tinha como olhar o que estava publicado, nem como
//     estava: via a lista de inscrições e nada mais. A visão
//     "Catálogo" lê o MESMO lugar de onde o app da aluna lê, e as
//     duas não podem divergir;
//   — clube publicado pela metade aparece pela metade. O cartão diz o
//     que falta nele, em vez de mostrar "todos os níveis" como se
//     alguém tivesse escolhido isso;
//   — esta tela publicava sem passar pelas travas: gravava o status
//     "publicado" direto, e o clube ia para o catálogo sem nível, sem
//     fuso e sem as 4 datas. Agora publicar passa por clubePublicar;
//   — e salvar um clube que já está no ar não o tira do ar: tirar do
//     catálogo um clube com inscritas deixaria alunas com inscrição
//     para lugar nenhum.
const { chromium } = require("playwright");
const P = require("./preparar.js");

(async () => {
  const { T, fim } = P.placar();
  const b = await chromium.launch({ executablePath: P.acharChromium() });
  const erros = [];

  const ctx = await P.novoContexto(b, {
    contexto: { viewport: { width: 1280, height: 1600 } },
    gestao: { nome: "Gabi", perfil: "gestora", papeis: ["gestora"] }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => erros.push(String(e).slice(0, 220)));
  await p.goto(P.endereco("ISR - Clubes v3.dc.html"));
  await p.waitForTimeout(3000);

  console.log("— o que o catálogo devolve —");
  const cat = await p.evaluate(() => {
    const C = window.ISRCRM;
    const r = C.catalogoDeClubes();
    return { incluidos: r.incluidos, preco: r.precoExtra.label,
      nomes: r.clubes.map(c => c.nome),
      publicados: C.clubesLista().filter(c => c.status === "publicado").length,
      rascunhos: C.clubesLista().filter(c => c.status !== "publicado").map(c => c.nome),
      primeiro: r.clubes[0] || null,
      campos: r.clubes.map(c => ({ nome: c.nome, nivel: c.nivel, emoji: c.emoji,
        novo: c.novo, vagas: c.vagas, inscritas: c.inscritas,
        encontros: c.encontros.length, falta: c.falta, prof: c.professora }))
    };
  });
  T("só clube publicado entra no catálogo",
    cat.nomes.length === cat.publicados && cat.rascunhos.length > 0
      && !cat.rascunhos.some(n => cat.nomes.indexOf(n) >= 0),
    { catalogo: cat.nomes, rascunhos: cat.rascunhos });
  T("o catálogo não é filtrado por quem conduz",
    new Set(cat.campos.map(c => c.prof)).size > 1, cat.campos.map(c => c.prof));
  T("cada clube traz nível, emoji e os 4 encontros",
    cat.campos.every(c => c.encontros === 4 && c.emoji) && cat.campos.some(c => c.nivel),
    cat.campos);
  T("e quantas entraram de quantas vagas",
    cat.campos.every(c => typeof c.vagas === "number" && typeof c.inscritas === "number"),
    cat.campos);
  T("os números do plano são os mesmos do app da aluna",
    cat.incluidos === 2 && /50/.test(cat.preco), cat);
  T("o mais recém-publicado vem primeiro",
    cat.primeiro && cat.primeiro.novo === true, cat.primeiro && cat.primeiro.nome);
  T("e 'New' não fica em clube publicado há meses",
    cat.campos.filter(c => c.novo).length < cat.campos.length, cat.campos.map(c => [c.nome, c.novo]));

  console.log("\n— a tela mostra os cartões —");
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => x.textContent.trim() === "Catálogo")[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  const tela = await p.evaluate(() => ({
    texto: document.querySelector("main").innerText.replace(/\s+/g, " ")
  }));
  T("a visão Catálogo existe e abre", /É o que a aluna vê em All clubs/.test(tela.texto),
    tela.texto.slice(0, 200));
  T("com a regra dos 4 encontros e do terceiro clube",
    /4 encontros/.test(tela.texto) && /inclui 2 clubes/.test(tela.texto)
      && /€50/.test(tela.texto), tela.texto.slice(0, 400));
  T("um cartão por clube publicado",
    cat.nomes.every(n => tela.texto.indexOf(n) >= 0), cat.nomes);
  T("com o nível que a aluna lê",
    /Todos os níveis|A partir do A2|A partir do B1/.test(tela.texto),
    (tela.texto.match(/.{0,60}níveis|.{0,30}A partir do .{0,20}/) || [""])[0]);
  T("e quantas entraram", /\d+ de \d+ inscrita/.test(tela.texto),
    (tela.texto.match(/\d+ de \d+ inscritas?[^·]*/) || [""])[0]);
  T("o rascunho não aparece nesta visão",
    cat.rascunhos.every(n => tela.texto.indexOf(n) < 0), cat.rascunhos);

  console.log("\n— clube publicado pela metade diz o que falta —");
  const meio = await p.evaluate(async () => {
    const C = window.ISRCRM;
    // um clube no ar sem nível e sem fuso: é o caso dos que foram
    // publicados antes das travas existirem
    const r = C.clubeSalvar({ nome: "Clube Teste", professora: "Gabi",
      formato: "online", dia: "terça", hora: "19:00", vagas: 5,
      descricao: "Para a suíte.", link: "https://exemplo.local/sala",
      encontros: [1, 2, 3, 4].map(n => ({ data: "2026-12-0" + n, tema: "Tema " + n })) });
    const l = JSON.parse(localStorage.getItem("isr_clubes_v1"));
    l.forEach(c => { if (c.id === r.id) { c.status = "publicado"; c.publicadoEm = "2026-10-01"; } });
    localStorage.setItem("isr_clubes_v1", JSON.stringify(l));
    window.dispatchEvent(new Event("isr-dados"));
    const no = C.catalogoDeClubes().clubes.filter(c => c.nome === "Clube Teste")[0];
    return { falta: no ? no.falta : null, nivel: no ? no.nivel : null, id: r.id };
  });
  T("o catálogo acusa o que falta no cartão",
    meio.falta && meio.falta.indexOf("nivel") >= 0 && meio.falta.indexOf("fuso") >= 0,
    meio);
  await p.waitForTimeout(1200);
  const avisoNaTela = await p.evaluate(() =>
    document.querySelector("main").innerText.replace(/\s+/g, " "));
  T("e a tela escreve isso no cartão, com as palavras do campo",
    /Falta no cartão: .*nível/.test(avisoNaTela)
      && /fuso de quem conduz/.test(avisoNaTela),
    (avisoNaTela.match(/Falta no cartão:[^.]*/) || [""])[0]);
  T("sem falar de código nenhum",
    !/nivel\b|_v\b|undefined/.test(avisoNaTela),
    (avisoNaTela.match(/.{0,40}(nivel|undefined).{0,40}/) || [""])[0]);

  console.log("\n— publicar passa pelas travas —");
  const trava = await p.evaluate(() => {
    const C = window.ISRCRM;
    // o que a tela faz quando se aperta "Publicar para as alunas" com
    // o formulário pela metade: salva o rascunho e pede a publicação
    const r = C.clubeSalvar({ nome: "Clube Sem Nada Teste", professora: "Gabi",
      formato: "online", dia: "", hora: "", vagas: 0, descricao: "", link: "" });
    const pub = C.clubePublicar(r.id);
    const depois = C.getClube(r.id);
    return { ok: pub.ok, erro: pub.erro, status: depois.status };
  });
  T("clube pela metade não é publicado", trava.ok === false && trava.status === "rascunho", trava);
  T("e a recusa diz o que falta, campo por campo",
    /nível/.test(trava.erro) && /horário/.test(trava.erro)
      && /4 datas/.test(trava.erro) && /vagas/.test(trava.erro), trava.erro);

  console.log("\n— salvar não tira do ar —");
  const noAr = await p.evaluate(() => {
    const C = window.ISRCRM;
    const antes = C.catalogoDeClubes().clubes[0];
    // é o que "Salvar alterações" faz: grava os campos sem mexer no
    // status do clube
    C.clubeSalvar({ id: antes.id, descricao: "Descrição trocada pela suíte." });
    const depois = C.getClube(antes.id);
    const noCatalogo = C.catalogoDeClubes().clubes.filter(c => c.id === antes.id)[0];
    return { status: depois.status, descricao: depois.descricao,
      aindaNoCatalogo: !!noCatalogo,
      descricaoNoCatalogo: noCatalogo ? noCatalogo.descricao : "" };
  });
  T("o clube continua publicado depois de salvar", noAr.status === "publicado", noAr);
  T("segue no catálogo, com o texto novo",
    noAr.aindaNoCatalogo && /trocada pela suíte/.test(noAr.descricaoNoCatalogo), noAr);

  console.log("\n— o formulário tem os campos que a publicação exige —");
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /novo clube/.test(x.textContent))[0];
    if (bt) bt.click();
  });
  await p.waitForTimeout(1200);
  const campos = await p.evaluate(() => {
    const rotulos = [...document.querySelectorAll("main label")].map(l =>
      ({ texto: l.innerText.trim().toLowerCase(),
        campo: l.querySelector("input, select, textarea") ? true : false }));
    const sel = [...document.querySelectorAll("main label")]
      .filter(l => /fuso/.test(l.innerText.toLowerCase()))[0];
    return { rotulos: rotulos.map(r => r.texto),
      fusoOpcoes: sel ? [...sel.querySelectorAll("option")].map(o => o.textContent) : [],
      fusoEscolhido: sel ? sel.querySelector("select").value : null };
  });
  T("o formulário pede o nível", campos.rotulos.some(r => /^nível/.test(r)), campos.rotulos);
  T("e o fuso de quem conduz",
    campos.rotulos.some(r => /fuso de quem conduz/.test(r)), campos.rotulos);
  T("com os fusos da escola, por país",
    campos.fusoOpcoes.some(o => /Brasil/.test(o)) && campos.fusoOpcoes.some(o => /Holanda/.test(o)),
    campos.fusoOpcoes);

  const pelaTela = await p.evaluate(async () => {
    const porRotulo = (texto) => {
      const l = [...document.querySelectorAll("main label")]
        .filter(x => x.innerText.toLowerCase().indexOf(texto) >= 0)[0];
      return l ? l.querySelector("input, select, textarea") : null;
    };
    const por = (rotulo, v) => { const c = porRotulo(rotulo); if (c) c.value = v; };
    por("nome do clube", "Clube da Tela Teste");
    por("quem conduz", "Gabi");
    por("dia", "sexta"); por("hora", "18:00"); por("duração", "60 min");
    por("vagas", "7"); por("link da sala", "https://exemplo.local/tela");
    por("descrição para as alunas", "Clube criado pela suíte.");
    // data escrita como a escola escreve, dd/mm/aaaa
    porRotulo("encontros").value =
      "01/12/2026 · Um\n08/12/2026 · Dois\n15/12/2026 · Três\n22/12/2026 · Quatro";
    // de propósito sem nível: a publicação tem de recusar
    por("nível", "");
    const clicar = (re) => {
      const bt = [...document.querySelectorAll("main button")]
        .filter(x => re.test(x.textContent.trim()))[0];
      if (bt) bt.click();
      return !!bt;
    };
    clicar(/^Publicar para as alunas$/);
    await new Promise(r => setTimeout(r, 400));
    const erro = document.querySelector("main").innerText.replace(/\s+/g, " ");
    return { erro: (erro.match(/Falta [^.]*para publicar\./) || [""])[0] };
  });
  T("publicar sem nível é recusado na tela, dizendo o que falta",
    /nível/.test(pelaTela.erro), pelaTela.erro);

  const publicou = await p.evaluate(async () => {
    const porRotulo = (texto) => {
      const l = [...document.querySelectorAll("main label")]
        .filter(x => x.innerText.toLowerCase().indexOf(texto) >= 0)[0];
      return l ? l.querySelector("input, select, textarea") : null;
    };
    porRotulo("nível").value = "b1";
    const bt = [...document.querySelectorAll("main button")]
      .filter(x => /^Publicar para as alunas$/.test(x.textContent.trim()))[0];
    if (bt) bt.click();
    await new Promise(r => setTimeout(r, 500));
    const no = window.ISRCRM.catalogoDeClubes().clubes
      .filter(c => c.nome === "Clube da Tela Teste")[0];
    return no ? { nome: no.nome, nivel: no.nivel, fuso: no.fuso,
      vagas: no.vagas, falta: no.falta, novo: no.novo } : null;
  });
  T("com o nível escolhido, o clube entra no catálogo",
    publicou && publicou.nivel === "b1" && publicou.vagas === 7, publicou);
  T("já com o fuso de quem o criou, e sem nada faltando",
    publicou && publicou.fuso && publicou.falta.length === 0, publicou);
  T("e nasce marcado como novo", publicou && publicou.novo === true, publicou);

  console.log("\n— o que a escola vê e o que a aluna vê é o mesmo —");
  const igual = await p.evaluate(() => {
    const C = window.ISRCRM;
    const alunas = C.getPessoas().filter(x => x.status === "aluna");
    // uma aluna que não está em clube nenhum vê o catálogo inteiro
    const fora = alunas.filter(a => C.clubesDaAluna(a.id).length === 0)[0];
    if (!fora) return { semAluna: true };
    const dela = C.clubesParaAluna(fora.id).abertos;
    const nossa = C.catalogoDeClubes().clubes;
    const chave = (c) => [c.nome, c.nivel || "", String(c.vagas),
      c.formato, c.dia || "", c.hora || ""].join("|");
    return {
      dela: dela.map(chave).sort(),
      nossa: nossa.map(chave).sort()
    };
  });
  T("o catálogo da aluna e o da escola têm os mesmos clubes",
    !igual.semAluna && igual.dela.length > 0
      && igual.dela.join("\n") === igual.nossa.join("\n"),
    { dela: igual.dela, nossa: igual.nossa });

  T("nenhum erro de página", erros.length === 0, erros);
  await b.close();
  fim();
})();
