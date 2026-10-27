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
      json: function () { return Promise.resolve({ ok: true, data: { pessoas: pessoas } }); } });
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

  fim();
})();
