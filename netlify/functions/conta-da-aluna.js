// O ESTADO DA CONTA DE UMA ALUNA, DITO PELO IDENTITY.
//
// A escola enxergava só o que ela própria registrou: "convidada em
// tal dia", "nunca abriu o app". O que o Identity sabe — se a conta
// existe, se foi confirmada, se alguém já entrou nela — ficava do
// outro lado do muro. Quando uma aluna não entra e todas as outras
// entram, é exatamente essa diferença que explica o caso, e não
// havia como olhar.
//
// Duas ações:
//
//   conferir   leitura pura. Diz se a conta existe, quando foi
//              convidada, se foi confirmada e quando foi o último
//              acesso.
//
//   recomecar  para a conta que existe e nunca foi usada: apaga e
//              convida de novo. É o caso da aluna que ficou presa
//              entre o convite e a primeira entrada — o convite dela
//              não pode ser reenviado, porque o Identity recusa
//              convidar quem já está registrado, e o link de entrada
//              não sai, porque a conta nunca foi confirmada.
//
//              A trava é dura: conta com qualquer acesso registrado
//              não é apagada em hipótese nenhuma. Apagar a conta de
//              quem usa o app seria destruir o caderno dela.
//
// Quem pode: a mesma porta do convite — sessão da gestão com papel
// na Equipe, ou a chave do Zapier.

const CHAVE = process.env.ISR_CONVITE_CHAVE;
const URL_BASE = process.env.ISR_BASE_URL;
const CHAVE_BASE = process.env.ISR_BASE_CHAVE || "";

const MOTIVOS = ["sem_sessao", "fora_da_equipe", "sem_papel", "sem_base",
  "chave_errada", "base_fora", "base_recusou", "sem_email",
  "identity_desligado", "identity_recusou", "conta_em_uso", "erro_inesperado"];

const PAPEIS_QUE_CONVIDAM = ["gestora", "comercial", "operacao", "professora",
  "extra", "shadow"];

function motivado(err, motivo) { err.motivo = motivo; return err; }

function equipeDaVariavel() {
  return String(process.env.ISR_EQUIPE_EMAILS || "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}

async function pedirBase(corpo) {
  if (!URL_BASE) throw motivado(new Error("sem base"), "sem_base");
  if (CHAVE_BASE) corpo.chave = CHAVE_BASE;
  const relogio = AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined;
  let r;
  try {
    r = await fetch(URL_BASE, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(corpo),
      signal: relogio
    });
  } catch (e) {
    throw motivado(new Error("base sem resposta"), "base_fora");
  }
  if (!r.ok) throw motivado(new Error("base " + r.status), "base_fora");
  return await r.json();
}

// a pergunta curta, com o caminho antigo atrás — igual ao convite
async function equipeDaEscola() {
  let d = null;
  try {
    d = await pedirBase({ action: "acessoConfere", email: "" });
  } catch (e) {
    if ((e && e.motivo) === "base_fora" || (e && e.motivo) === "sem_base") throw e;
    d = null;
  }
  if (d && d.ok && d.data && Array.isArray(d.data.equipe)
      && Object.prototype.hasOwnProperty.call(d.data, "pessoa")) {
    return d.data.equipe;
  }
  const velha = await pedirBase({ action: "sistemaLoad" });
  if (velha && velha.ok === false) throw motivado(new Error("base recusou"), "base_recusou");
  const dados = (velha && velha.data) || null;
  if (!dados || typeof dados !== "object") {
    throw motivado(new Error("base sem dados"), "base_recusou");
  }
  return dados.equipe || [];
}

async function situacaoNaEquipe(email) {
  if (!URL_BASE) return "sem_base";
  const equipe = await equipeDaEscola();
  if (!equipe.length) return "sem_base";
  const m = equipe.filter((x) =>
    x && !x.apagado && String(x.email || "").trim().toLowerCase() === email)[0];
  if (!m) return "fora_da_equipe";
  const temPapel = (m.papeis || []).some((pp) => PAPEIS_QUE_CONVIDAM.indexOf(pp) >= 0);
  return temPapel ? "ok" : "sem_papel";
}

// ── ACHAR A CONTA ─────────────────────────────────────────────────
//
// O filtro por e-mail nem sempre existe na versão que o site roda.
// Então: tenta o filtro e, se ele não trouxer a conta, percorre as
// páginas. São centenas de contas, não milhões, e isto roda quando
// alguém aperta um botão.
async function acharConta(ident, email) {
  const cabecalho = { Authorization: "Bearer " + ident.token };
  const ler = async (url) => {
    const r = await fetch(url, { headers: cabecalho });
    if (!r.ok) throw motivado(new Error("identity " + r.status), "identity_recusou");
    return await r.json();
  };
  const bate = (u) => u && String(u.email || "").trim().toLowerCase() === email;
  try {
    const d = await ler(ident.url + "/admin/users?filter=" + encodeURIComponent(email));
    const achada = ((d && d.users) || []).filter(bate)[0];
    if (achada) return achada;
  } catch (e) {
    if ((e && e.motivo) !== "identity_recusou") throw e;
  }
  for (let pagina = 1; pagina <= 20; pagina++) {
    const d = await ler(ident.url + "/admin/users?per_page=100&page=" + pagina);
    const lista = (d && d.users) || [];
    const achada = lista.filter(bate)[0];
    if (achada) return achada;
    if (lista.length < 100) break;
  }
  return null;
}

function retrato(u) {
  if (!u) return { existe: false };
  return {
    existe: true,
    id: u.id || "",
    convidadaEm: u.invited_at || "",
    confirmadaEm: u.confirmed_at || u.email_confirmed_at || "",
    criadaEm: u.created_at || "",
    ultimoAcesso: u.last_sign_in_at || ""
  };
}

exports.handler = async (event, context) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers,
      body: JSON.stringify({ ok: false, motivo: "erro_inesperado", erro: "use POST" }) };
  }

  let corpo = {};
  try { corpo = JSON.parse(event.body || "{}"); } catch (e) {}

  const enviada = String(corpo.chave
    || (event.headers && event.headers["x-isr-chave"]) || "").trim();
  const comChave = !!CHAVE && enviada === String(CHAVE).trim();

  const quem = context && context.clientContext && context.clientContext.user;
  const emailDeQuem = String((quem && quem.email) || "").trim().toLowerCase();
  let daEquipe = false;
  let porqueNao = "";
  if (emailDeQuem) {
    if (equipeDaVariavel().indexOf(emailDeQuem) >= 0) daEquipe = true;
    else {
      try {
        const sit = await situacaoNaEquipe(emailDeQuem);
        daEquipe = sit === "ok";
        if (!daEquipe) porqueNao = sit;
      } catch (err) {
        console.error("conta-da-aluna · equipe:", err);
        const motivo = (err && err.motivo) || "base_fora";
        return { statusCode: motivo === "base_fora" ? 503 : 502, headers,
          body: JSON.stringify({ ok: false, motivo: motivo,
            erro: motivo === "base_recusou"
              ? "A base da escola respondeu, mas recusou o pedido do site."
              : "A base da escola não respondeu agora." }) };
      }
    }
  }
  if (!comChave && !daEquipe) {
    const motivo = emailDeQuem
      ? (porqueNao === "sem_papel" ? "sem_papel"
        : porqueNao === "sem_base" ? "sem_base" : "fora_da_equipe")
      : (enviada ? "chave_errada" : "sem_sessao");
    return { statusCode: 401, headers,
      body: JSON.stringify({ ok: false, motivo: motivo, conta: emailDeQuem || undefined,
        erro: "Sem permissão para conferir contas." }) };
  }

  const email = String(corpo.email || "").trim().toLowerCase();
  if (!email || email.indexOf("@") < 1) {
    return { statusCode: 400, headers,
      body: JSON.stringify({ ok: false, motivo: "sem_email", erro: "e-mail ausente" }) };
  }

  const ident = context && context.clientContext && context.clientContext.identity;
  if (!ident || !ident.url || !ident.token) {
    return { statusCode: 500, headers,
      body: JSON.stringify({ ok: false, motivo: "identity_desligado",
        erro: "Identity não está ativo neste site." }) };
  }

  try {
    const u = await acharConta(ident, email);
    const estado = retrato(u);
    if (corpo.acao !== "recomecar") {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email, ...estado }) };
    }

    // ── RECOMEÇAR ──
    if (!u) {
      // nada a apagar: é só convidar
      const r = await fetch(ident.url + "/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json",
          Authorization: "Bearer " + ident.token },
        body: JSON.stringify({ email: email })
      });
      if (!r.ok) {
        const t = await r.text();
        console.error("conta-da-aluna · invite", r.status, t.slice(0, 300));
        return { statusCode: 502, headers,
          body: JSON.stringify({ ok: false, motivo: "identity_recusou",
            erro: "O convite não saiu agora." }) };
      }
      return { statusCode: 200, headers,
        body: JSON.stringify({ ok: true, email, recomecou: true, apagou: false }) };
    }
    if (estado.ultimoAcesso) {
      // conta em uso: não se apaga, nem por engano
      return { statusCode: 409, headers,
        body: JSON.stringify({ ok: false, motivo: "conta_em_uso", email, ...estado,
          erro: "Esta conta já foi usada para entrar." }) };
    }
    const apagou = await fetch(ident.url + "/admin/users/" + encodeURIComponent(u.id), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + ident.token }
    });
    if (!apagou.ok) {
      const t = await apagou.text();
      console.error("conta-da-aluna · delete", apagou.status, t.slice(0, 300));
      return { statusCode: 502, headers,
        body: JSON.stringify({ ok: false, motivo: "identity_recusou",
          erro: "Não foi possível refazer a conta agora." }) };
    }
    const novo = await fetch(ident.url + "/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json",
        Authorization: "Bearer " + ident.token },
      body: JSON.stringify({ email: email })
    });
    if (!novo.ok) {
      const t = await novo.text();
      console.error("conta-da-aluna · reinvite", novo.status, t.slice(0, 300));
      return { statusCode: 502, headers,
        body: JSON.stringify({ ok: false, motivo: "identity_recusou",
          erro: "A conta foi apagada, mas o convite novo não saiu. Convide de novo pela ficha." }) };
    }
    return { statusCode: 200, headers,
      body: JSON.stringify({ ok: true, email, recomecou: true, apagou: true }) };
  } catch (err) {
    console.error("conta-da-aluna erro:", err);
    const motivo = (err && err.motivo) || "erro_inesperado";
    return { statusCode: 500, headers,
      body: JSON.stringify({ ok: false, motivo: motivo,
        erro: String((err && err.message) || err) }) };
  }
};

exports.MOTIVOS = MOTIVOS;
