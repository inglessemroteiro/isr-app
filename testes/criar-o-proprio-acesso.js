// A aluna cria o próprio acesso.
//
// O /recover do Netlify Identity só manda e-mail para conta que já
// existe, e responde "ok" de qualquer jeito — é assim de propósito,
// para não contar quem é cadastrado. Quem nunca foi convidada não tem
// conta: pedia o link de entrada, a tela dizia que o link saiu, e não
// saía nada. A escola recebia o link porque tem conta; a aluna não,
// e nenhuma das duas tinha como saber por quê.
//
// Agora a aluna cria o acesso dela. Quem autoriza NÃO é o navegador:
// a função carrega a base pelo servidor e só convida quem já é aluna
// com turma ou produto contratado. Criar a conta também não abre nada
// sozinho — o portão continua conferindo o e-mail na base antes de
// abrir o app.
//
// Esta suíte roda a função do Netlify direto em Node, com a base e o
// Identity respondidos aqui: é o único jeito de conferir a regra de
// quem pode criar acesso sem publicar e tentar na mão.
const P = require("./preparar.js");

// o endereço da base é lido quando o módulo carrega, como no Netlify:
// defini-lo depois do require deixaria a função sem base e toda aluna
// pareceria de fora da escola
process.env.ISR_BASE_URL = "https://script.google.local/exec";
const fn = require("../netlify/functions/convidar-aluna.js");

function chamar(corpo, cabecalhos, contexto) {
  return fn.handler(
    { httpMethod: "POST", body: JSON.stringify(corpo), headers: cabecalhos || {} },
    contexto || {});
}
function resposta(r) {
  var d = {};
  try { d = JSON.parse(r.body); } catch (e) {}
  return { status: r.statusCode, d: d };
}

// a base da escola e o Identity, respondidos aqui
function montarRede(pessoas, opcoes) {
  opcoes = opcoes || {};
  var equipe = opcoes.equipe || [];
  var convidados = [];
  global.fetch = function (url, init) {
    var u = String(url);
    if (u.indexOf("/invite") >= 0) {
      var corpo = JSON.parse((init && init.body) || "{}");
      convidados.push(corpo.email);
      if (opcoes.jaExiste) {
        return Promise.resolve({ ok: false, status: 422,
          text: function () { return Promise.resolve("email already registered"); } });
      }
      return Promise.resolve({ ok: true, status: 200,
        text: function () { return Promise.resolve("{}"); } });
    }
    // a base
    if (opcoes.baseFora) return Promise.resolve({ ok: false, status: 500,
      json: function () { return Promise.resolve({}); } });
    return Promise.resolve({ ok: true, status: 200,
      json: function () {
        return Promise.resolve({ ok: true, data: { pessoas: pessoas, equipe: equipe } });
      } });
  };
  return { convidados: convidados };
}
var IDENT = { clientContext: { identity: { url: "https://x.netlify/identity", token: "tk" } } };

(async () => {
  const { T, fim } = P.placar();

  const ALUNA = { id: "p1", nome: "Marta Teste", email: "marta@teste.local",
    status: "aluna", turma: "Basics (A1) · MON 7h" };
  const SEM_TURMA = { id: "p2", nome: "Rita Teste", email: "rita@teste.local",
    status: "aluna", turma: "" };
  const PARTICULAR = { id: "p3", nome: "Sol Teste", email: "sol@teste.local",
    status: "aluna", turma: "", particular: { aulas: 8 } };
  const LEAD = { id: "p4", nome: "Lia Teste", email: "lia@teste.local", status: "lead",
    turma: "Basics (A1) · MON 7h" };
  const EX = { id: "p5", nome: "Vera Teste", email: "vera@teste.local",
    status: "ex-aluna", turma: "Basics (A1) · MON 7h" };
  const BASE = [ALUNA, SEM_TURMA, PARTICULAR, LEAD, EX];

  console.log("— a aluna da escola cria o acesso dela —");
  let rede = montarRede(BASE);
  let r = resposta(await chamar({ email: "marta@teste.local", autoacesso: true }, {}, IDENT));
  T("o convite sai", r.status === 200 && r.d.ok && r.d.convidada === true, r);
  T("e vai para o e-mail que ela digitou",
    rede.convidados.length === 1 && rede.convidados[0] === "marta@teste.local", rede.convidados);

  console.log("\\n— quem tem particular também é aluna —");
  rede = montarRede(BASE);
  r = resposta(await chamar({ email: "sol@teste.local", autoacesso: true }, {}, IDENT));
  T("aluna sem turma, com particular contratada, entra",
    r.d.ok && r.d.convidada === true, r);

  console.log("\\n— quem não pode, não cria —");
  const naoPode = async (email, oQue) => {
    const rd = montarRede(BASE);
    const rr = resposta(await chamar({ email: email, autoacesso: true }, {}, IDENT));
    T(oQue + ": nada é criado", rd.convidados.length === 0, rd.convidados);
    T(oQue + ": e a resposta não conta por quê",
      rr.status === 200 && rr.d.ok === true && rr.d.convidada === false
      && !/lead|ex-aluna|não está|sem turma/i.test(JSON.stringify(rr.d)), rr);
  };
  await naoPode("rita@teste.local", "aluna sem turma e sem produto");
  await naoPode("lia@teste.local", "quem ainda é lead");
  await naoPode("vera@teste.local", "quem já saiu");
  await naoPode("estranha@teste.local", "e-mail de fora da escola");

  console.log("\\n— o pedido não escolhe quem convidar —");
  rede = montarRede(BASE);
  r = resposta(await chamar({ email: "estranha@teste.local", nome: "Marta Teste",
    autoacesso: true }, {}, IDENT));
  T("mandar o nome de uma aluna não convida o e-mail de outra pessoa",
    rede.convidados.length === 0, rede.convidados);

  console.log("\\n— quem já tem conta não é convidada de novo —");
  rede = montarRede(BASE, { jaExiste: true });
  r = resposta(await chamar({ email: "marta@teste.local", autoacesso: true }, {}, IDENT));
  T("o Identity diz que já existe, e isso não é erro",
    r.status === 200 && r.d.ok === true && r.d.jaTinhaConta === true, r);

  console.log("\\n— base fora do ar não vira convite —");
  rede = montarRede(BASE, { baseFora: true });
  r = resposta(await chamar({ email: "marta@teste.local", autoacesso: true }, {}, IDENT));
  T("sem conseguir conferir, não convida", rede.convidados.length === 0, rede.convidados);
  T("e diz que foi a base, não a aluna",
    r.status === 503 && r.d.motivo === "base_fora", r);

  console.log("\\n— sem autoacesso, a porta antiga continua fechada —");
  rede = montarRede(BASE);
  r = resposta(await chamar({ email: "marta@teste.local" }, {}, IDENT));
  T("pedido sem chave e sem sessão é recusado",
    r.status === 401 && r.d.motivo === "sem_sessao", r);
  T("e nada é criado", rede.convidados.length === 0, rede.convidados);

  console.log("\n— quem pode convidar sai da Equipe da escola —");
  // Havia duas listas: a Equipe, na base, e a ISR_EQUIPE_EMAILS, à
  // mão nas variáveis do Netlify. Elas divergem no primeiro dia, e o
  // convite recusava quem acabara de entrar na Equipe.
  const EQUIPE = [
    { nome: "Gabi Teste", email: "gabi@teste.local", papeis: ["gestora"] },
    { nome: "Ana Teste", email: "ana@teste.local", papeis: ["professora"] },
    { nome: "Zeca Teste", email: "zeca@teste.local", papeis: [] }
  ];
  const comoEquipe = (email) => ({ clientContext: Object.assign(
    { user: { email: email } }, IDENT.clientContext) });

  delete process.env.ISR_EQUIPE_EMAILS;
  rede = montarRede(BASE, { equipe: EQUIPE });
  r = resposta(await chamar({ email: "rita@teste.local" }, {},
    comoEquipe("gabi@teste.local")));
  T("a gestora convida sem lista nenhuma no Netlify",
    r.status === 200 && r.d.ok === true, r);
  T("e o convite sai para quem ela pediu",
    rede.convidados.length === 1 && rede.convidados[0] === "rita@teste.local", rede.convidados);

  rede = montarRede(BASE, { equipe: EQUIPE });
  r = resposta(await chamar({ email: "rita@teste.local" }, {},
    comoEquipe("ana@teste.local")));
  T("a professora também convida", r.d.ok === true, r);

  rede = montarRede(BASE, { equipe: EQUIPE });
  r = resposta(await chamar({ email: "rita@teste.local" }, {},
    comoEquipe("zeca@teste.local")));
  T("quem está na Equipe sem papel não convida",
    r.status === 401 && r.d.motivo === "sem_papel", r);
  T("e nada é criado", rede.convidados.length === 0, rede.convidados);

  rede = montarRede(BASE, { equipe: EQUIPE });
  r = resposta(await chamar({ email: "rita@teste.local" }, {},
    comoEquipe("ninguem@teste.local")));
  T("quem não está na Equipe não convida",
    r.status === 401 && r.d.motivo === "fora_da_equipe", r);
  T("e a recusa diz com qual conta ela entrou",
    r.d.conta === "ninguem@teste.local", r);

  console.log("\n— a lista do Netlify soma, e nunca tranca —");
  // Ela estreitava: preenchida, só os e-mails dela convidavam. Uma
  // variável esquecida nas configurações do site passava a trancar a
  // gestora para fora do próprio sistema, sem nada na tela dizer que
  // ela existia.
  process.env.ISR_EQUIPE_EMAILS = "ninguem@teste.local";
  rede = montarRede(BASE, { equipe: EQUIPE });
  r = resposta(await chamar({ email: "rita@teste.local" }, {},
    comoEquipe("ana@teste.local")));
  T("a professora da Equipe convida mesmo fora da variável",
    r.status === 200 && r.d.ok === true, r);
  rede = montarRede(BASE, { equipe: EQUIPE });
  r = resposta(await chamar({ email: "rita@teste.local" }, {},
    comoEquipe("ninguem@teste.local")));
  T("e quem está só na variável também convida",
    r.status === 200 && r.d.ok === true, r);
  delete process.env.ISR_EQUIPE_EMAILS;

  console.log("\n— base que não foi lida não vira \"você não está na Equipe\" —");
  // O Apps Script responde 200 mesmo quando recusa. Sem conferir o
  // "ok", a recusa dele virava uma base vazia, e base vazia lia como
  // "essa pessoa não está na Equipe": a gestora recebia "o seu
  // e-mail não está em ficha nenhuma" com a ficha preenchida na
  // frente dela.
  const comBaseRuim = (resposta2) => {
    global.fetch = function (url, init) {
      if (String(url).indexOf("/invite") >= 0) {
        return Promise.resolve({ ok: true, status: 200,
          text: function () { return Promise.resolve("{}"); } });
      }
      return Promise.resolve({ ok: true, status: 200,
        json: function () { return Promise.resolve(resposta2); } });
    };
  };
  comBaseRuim({ ok: false, erro: "chave" });
  r = resposta(await chamar({ email: "rita@teste.local" }, {},
    comoEquipe("gabi@teste.local")));
  T("base que recusa vira \"não deu para conferir\", não recusa de pessoa",
    r.status === 503 && r.d.motivo === "base_fora", r);
  comBaseRuim({ ok: true, data: { pessoas: [], equipe: [] } });
  r = resposta(await chamar({ email: "rita@teste.local" }, {},
    comoEquipe("gabi@teste.local")));
  T("equipe vazia também não acusa a pessoa",
    r.status === 401 && r.d.motivo === "sem_base", r);
  T("e a mensagem fala do site, não da ficha dela",
    /ISR_BASE_URL|não pôde ser conferida/.test(r.d.erro || ""), r);

  console.log("\n— sem base configurada, a recusa diz isso —");
  const urlAntes = process.env.ISR_BASE_URL;
  delete process.env.ISR_BASE_URL;
  // a função lê URL_BASE na carga do módulo, como no Netlify; aqui a
  // conferência é da tradução, que é o que a escola lê
  T("a tela tem recado para a base não configurada",
    true, { nota: "conferido em convite-recusado.js" });
  process.env.ISR_BASE_URL = urlAntes;

  console.log("\n— criar o acesso não cria acesso dobrado —");
  // A conta do Identity é identificada pelo E-MAIL. Pedir duas vezes
  // não faz duas contas: na segunda o Identity responde que o e-mail
  // já está registrado, e a função trata isso como sucesso. E a
  // função nunca CRIA pessoa: ela só convida quem a base já tem.
  rede = montarRede(BASE);
  r = resposta(await chamar({ email: "marta@teste.local", autoacesso: true }, {}, IDENT));
  T("a primeira vez cria", r.d.ok && r.d.convidada === true, r);
  const primeira = rede.convidados.length;
  // a segunda vez, com a conta já existindo
  const rede2 = montarRede(BASE, { jaExiste: true });
  const r2 = resposta(await chamar({ email: "marta@teste.local", autoacesso: true }, {}, IDENT));
  T("a segunda vez não cria outra conta",
    r2.d.ok === true && r2.d.convidada === false && r2.d.jaTinhaConta === true, r2);
  T("o Identity é quem recusa a repetição, pelo e-mail",
    primeira === 1 && rede2.convidados.length === 1, { primeira, segunda: rede2.convidados });

  // a escola convida e a aluna também: continua uma conta só
  const rede3 = montarRede(BASE, { jaExiste: true, equipe: EQUIPE });
  const r3 = resposta(await chamar({ email: "marta@teste.local" },
    { "x-isr-chave": "" }, comoEquipe("gabi@teste.local")));
  T("convite da escola depois do autoacesso não duplica",
    r3.d.ok === true && r3.d.jaTinhaConta === true, r3);

  // e a função nunca inventa pessoa na base
  const antesDaBase = BASE.length;
  const rede4 = montarRede(BASE);
  await chamar({ email: "marta@teste.local", autoacesso: true }, {}, IDENT);
  T("a base não ganha pessoa nenhuma", BASE.length === antesDaBase,
    { antes: antesDaBase, depois: BASE.length });

  fim();
})();
