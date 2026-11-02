// O estado da conta de uma aluna, dito pelo Identity.
//
// Uma aluna não entra e todas as outras entram. A ficha dizia só o
// que a escola registrou — "convidada em tal dia", "nunca abriu o
// app" —, e com isso a escola ficava adivinhando entre spam, e-mail
// errado e convite perdido. O que faltava era olhar a conta.
//
// O que esta suíte guarda:
//   — a conferência é leitura pura, e diz em uma frase o estado:
//     não existe, existe e já foi usada, existe e nunca foi aberta;
//   — o caso que trava uma aluna só: a conta existe, nunca foi
//     confirmada e nunca foi usada. Nesse estado ela não recebe
//     convite (o Identity recusa convidar quem já está registrado)
//     nem link de entrada (a conta nunca foi confirmada). Fica
//     presa entre as duas coisas, em silêncio;
//   — refazer apaga e convida de novo, e SÓ nesse estado: conta com
//     acesso registrado não é apagada nem por engano, porque apagar
//     a conta de quem usa o app destrói o caderno dela;
//   — quem não é da Equipe não confere conta nenhuma.
const path = require("path");
const P = require("./preparar.js");

process.env.ISR_BASE_URL = "https://base.teste.local/exec";
process.env.ISR_CONVITE_CHAVE = "chave-de-teste";
delete process.env.ISR_EQUIPE_EMAILS;
const fn = require(path.join(__dirname, "..", "netlify", "functions", "conta-da-aluna.js"));

const IDENT = { url: "https://x.netlify/identity", token: "tk" };
const EQUIPE = [{ email: "gabi@teste.local", papeis: ["gestora"] }];

function chamar(corpo, contexto) {
  return fn.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify(corpo) },
    contexto || {});
}
function resposta(r) {
  var d = {};
  try { d = JSON.parse(r.body); } catch (e) {}
  return { status: r.statusCode, d: d };
}
function comoEquipe(email) {
  return { clientContext: { identity: IDENT, user: { email: email } } };
}

// o Identity e a base, respondidos aqui
function montarRede(conta, opcoes) {
  opcoes = opcoes || {};
  const feito = { apagou: null, convidou: [], leituras: 0 };
  global.fetch = function (url, init) {
    const u = String(url);
    const metodo = (init && init.method) || "GET";
    if (u.indexOf("/admin/users/") >= 0 && metodo === "DELETE") {
      feito.apagou = u.split("/admin/users/")[1];
      return Promise.resolve({ ok: !opcoes.apagarFalha, status: opcoes.apagarFalha ? 500 : 200,
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/admin/users") >= 0) {
      feito.leituras++;
      return Promise.resolve({ ok: true, status: 200, json: function () {
        return Promise.resolve({ users: conta ? [conta] : [] }); } });
    }
    if (u.indexOf("/invite") >= 0) {
      feito.convidou.push(JSON.parse((init && init.body) || "{}").email);
      return Promise.resolve({ ok: true, status: 200,
        text: function () { return Promise.resolve("{}"); } });
    }
    // a base da escola
    return Promise.resolve({ ok: true, status: 200, json: function () {
      return Promise.resolve({ ok: true, data: { equipe: EQUIPE, pessoa: null } }); } });
  };
  return feito;
}

(async () => {
  const { T, fim } = P.placar();

  console.log("— quem pode perguntar —");
  montarRede(null);
  let r = resposta(await chamar({ email: "bia@teste.local" }, {}));
  T("sem sessão, ninguém confere conta",
    r.status === 401 && r.d.motivo === "sem_sessao", r);
  r = resposta(await chamar({ email: "bia@teste.local" },
    { clientContext: { identity: IDENT, user: { email: "estranha@teste.local" } } }));
  T("quem não está na Equipe também não",
    r.status === 401 && r.d.motivo === "fora_da_equipe", r);
  r = resposta(await chamar({ email: "" }, comoEquipe("gabi@teste.local")));
  T("e sem e-mail não há o que conferir",
    r.status === 400 && r.d.motivo === "sem_email", r);

  console.log("\n— os três estados —");
  montarRede(null);
  r = resposta(await chamar({ email: "bia@teste.local" }, comoEquipe("gabi@teste.local")));
  T("conta que não existe é dita como tal",
    r.status === 200 && r.d.ok === true && r.d.existe === false, r);

  montarRede({ id: "u1", email: "bia@teste.local", invited_at: "2026-10-20T10:00:00Z",
    confirmed_at: "2026-10-21T08:00:00Z", last_sign_in_at: "2026-10-28T19:00:00Z" });
  r = resposta(await chamar({ email: "bia@teste.local" }, comoEquipe("gabi@teste.local")));
  T("conta em uso traz o último acesso",
    r.d.existe === true && r.d.ultimoAcesso === "2026-10-28T19:00:00Z", r.d);

  montarRede({ id: "u2", email: "bia@teste.local", invited_at: "2026-10-20T10:00:00Z",
    confirmed_at: null, last_sign_in_at: null });
  r = resposta(await chamar({ email: "bia@teste.local" }, comoEquipe("gabi@teste.local")));
  T("conta convidada e nunca aberta é dita inteira",
    r.d.existe === true && !r.d.confirmadaEm && !r.d.ultimoAcesso
      && r.d.convidadaEm === "2026-10-20T10:00:00Z", r.d);
  T("e conferir não convida nem apaga nada",
    JSON.stringify(r.d).indexOf("recomecou") < 0, r.d);

  console.log("\n— refazer, só para a conta presa —");
  let rede = montarRede({ id: "u2", email: "bia@teste.local",
    invited_at: "2026-10-20T10:00:00Z", confirmed_at: null, last_sign_in_at: null });
  r = resposta(await chamar({ email: "bia@teste.local", acao: "recomecar" },
    comoEquipe("gabi@teste.local")));
  T("a conta presa é apagada e convidada de novo",
    r.status === 200 && r.d.ok === true && r.d.apagou === true, r);
  T("apagou a conta certa", rede.apagou === "u2", rede);
  T("e o convite saiu para o mesmo e-mail",
    rede.convidou.length === 1 && rede.convidou[0] === "bia@teste.local", rede);

  rede = montarRede({ id: "u3", email: "bia@teste.local",
    invited_at: "2026-10-20T10:00:00Z", confirmed_at: "2026-10-21T08:00:00Z",
    last_sign_in_at: "2026-10-28T19:00:00Z" });
  r = resposta(await chamar({ email: "bia@teste.local", acao: "recomecar" },
    comoEquipe("gabi@teste.local")));
  T("conta em uso NÃO é apagada", r.status === 409 && r.d.motivo === "conta_em_uso", r);
  T("nada foi apagado", rede.apagou === null, rede);
  T("nem convidado", rede.convidou.length === 0, rede);
  T("e a resposta diz por quê", /já foi usada/.test(r.d.erro || ""), r.d);

  rede = montarRede(null);
  r = resposta(await chamar({ email: "nova@teste.local", acao: "recomecar" },
    comoEquipe("gabi@teste.local")));
  T("sem conta para apagar, refazer é só convidar",
    r.status === 200 && r.d.ok === true && r.d.apagou === false, r);
  T("e o convite saiu", rede.convidou.length === 1, rede);

  console.log("\n— a chave do Zapier também abre a porta —");
  montarRede(null);
  // no Netlify o clientContext.identity vem sempre que o Identity
  // está ligado; o que falta, no pedido do Zapier, é o usuário
  r = resposta(await chamar({ email: "bia@teste.local", chave: "chave-de-teste" },
    { clientContext: { identity: IDENT } }));
  T("com a chave certa, a conferência responde",
    r.status === 200 && r.d.ok === true, r);
  r = resposta(await chamar({ email: "bia@teste.local", chave: "chave-errada" },
    { clientContext: { identity: IDENT } }));
  T("com a chave errada, não", r.status === 401 && r.d.motivo === "chave_errada", r);

  console.log("\n— o vocabulário das recusas —");
  const fonte = require("fs").readFileSync(path.join(__dirname, "..", "netlify",
    "functions", "conta-da-aluna.js"), "utf8");
  const decl = (fonte.match(/const MOTIVOS = \[[\s\S]*?\];/) || [""])[0];
  const motivos = [...decl.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const soltos = [...new Set([...fonte.matchAll(/motivo[^\n]*?["']([a-z_]{4,})["']/g)]
    .map((m) => m[1]))].filter((x) => motivos.indexOf(x) < 0 && x !== "motivo");
  T("a função declara os motivos que devolve", motivos.length >= 10, motivos);
  T("e nenhum ficou fora da declaração", soltos.length === 0, soltos);
  const semMotivo = (fonte.match(/\{ ok: false,[^\n]*/g) || [])
    .filter((l) => l.indexOf("motivo") < 0);
  T("toda recusa leva motivo", semMotivo.length === 0, semMotivo);

  fim();
})();
