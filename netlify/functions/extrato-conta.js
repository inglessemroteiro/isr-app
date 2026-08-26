// ════════════════════════════════════════════════════════════════
// EXTRATO DO STRIPE E DO ASAAS, SEM BAIXAR ARQUIVO
//
// O Caixa pede o período; esta função busca no gateway e devolve as
// linhas no mesmo formato que a conciliação já entende — data,
// descrição, valor, moeda e o id da transação. O id é o que impede
// contar duas vezes: a conciliação guarda o que já processou.
//
// As chaves ficam no Netlify (Site configuration → Environment
// variables), nunca no navegador nem no repositório:
//
//   STRIPE_API_KEY      chave restrita, SÓ LEITURA (rk_live_...)
//   ASAAS_API_KEY       chave da conta Asaas
//   ISR_EXTRATO_CHAVE   senha que autoriza a chamada
//
// A ISR_EXTRATO_CHAVE é digitada uma vez no Caixa e fica guardada só
// no aparelho da gestora. Sem ela, a função recusa — o endereço é
// público, a resposta não.
//
// Endereço:  POST /.netlify/functions/extrato-conta
// Corpo:     { "conta": "stripe" | "asaas", "de": "2026-08-01",
//              "ate": "2026-08-31", "chave": "..." }
// ════════════════════════════════════════════════════════════════

const CHAVE = process.env.ISR_EXTRATO_CHAVE;
const STRIPE = process.env.STRIPE_API_KEY;
const ASAAS = process.env.ASAAS_API_KEY;

const MOEDA = { brl: "R$", eur: "€", usd: "US$" };
const ddmmaaaa = (iso) => {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "";
};

// ── Stripe ────────────────────────────────────────────────────
// balance_transactions traz o que de fato entrou e saiu do saldo:
// cobrança, taxa, estorno e o repasse para o banco. É o extrato, não a
// lista de vendas.
async function stripe(de, ate) {
  if (!STRIPE) throw new Error("STRIPE_API_KEY não está configurada no Netlify");
  const linhas = [];
  let starting_after = null;
  for (let pagina = 0; pagina < 10; pagina++) {
    const q = new URLSearchParams({ limit: "100" });
    if (de) q.set("created[gte]", String(Math.floor(new Date(de + "T00:00:00Z") / 1000)));
    if (ate) q.set("created[lte]", String(Math.floor(new Date(ate + "T23:59:59Z") / 1000)));
    if (starting_after) q.set("starting_after", starting_after);
    q.set("expand[]", "data.source");

    const res = await fetch("https://api.stripe.com/v1/balance_transactions?" + q, {
      headers: { Authorization: "Bearer " + STRIPE }
    });
    const corpo = await res.json();
    if (!res.ok) throw new Error("Stripe " + res.status + ": " + ((corpo.error || {}).message || ""));

    (corpo.data || []).forEach(function (t) {
      const fonte = t.source && typeof t.source === "object" ? t.source : null;
      const quem = (fonte && (fonte.billing_details && fonte.billing_details.name))
        || (fonte && fonte.description) || t.description || t.type;
      // o e-mail é o que casa a cobrança com a aluna: o nome no cartão
      // vem abreviado, o e-mail é o mesmo do cadastro
      const doCartao = fonte && fonte.billing_details && fonte.billing_details.email;
      const doRecibo = fonte && (fonte.receipt_email || fonte.customer_email);
      const naDescricao = (String((fonte && fonte.description) || t.description || "")
        .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [])[0];
      linhas.push({
        data: ddmmaaaa(new Date(t.created * 1000).toISOString()),
        descricao: String(quem || t.type).slice(0, 120),
        email: String(doCartao || doRecibo || naDescricao || "").toLowerCase(),
        // o valor líquido é o que mexeu no saldo; a taxa vem na própria
        // linha para a conciliação lançar como despesa
        valor: t.amount / 100,
        taxa: (t.fee || 0) / 100,
        moeda: MOEDA[(t.currency || "").toLowerCase()] || (t.currency || "").toUpperCase(),
        idExterno: t.id,
        tipo: t.type
      });
    });
    if (!corpo.has_more) break;
    starting_after = (corpo.data[corpo.data.length - 1] || {}).id;
    if (!starting_after) break;
  }
  return linhas;
}

// ── Asaas ─────────────────────────────────────────────────────
// os pagamentos recebidos no período, com o nome de quem pagou
async function asaas(de, ate) {
  if (!ASAAS) throw new Error("ASAAS_API_KEY não está configurada no Netlify");
  const linhas = [];
  const clientes = {};
  for (let pagina = 0; pagina < 10; pagina++) {
    const q = new URLSearchParams({ limit: "100", offset: String(pagina * 100), status: "RECEIVED" });
    if (de) q.set("paymentDate[ge]", de);
    if (ate) q.set("paymentDate[le]", ate);

    const res = await fetch("https://api.asaas.com/v3/payments?" + q, {
      headers: { access_token: ASAAS, "Content-Type": "application/json" }
    });
    const corpo = await res.json();
    if (!res.ok) throw new Error("Asaas " + res.status + ": " + ((corpo.errors && corpo.errors[0] && corpo.errors[0].description) || ""));

    for (const pg of (corpo.data || [])) {
      // nome e e-mail de quem pagou: o e-mail é o que casa com a ficha
      let nome = pg.customerName || "";
      let email = pg.customerEmail || "";
      if ((!nome || !email) && pg.customer) {
        if (clientes[pg.customer] === undefined) {
          try {
            const rc = await fetch("https://api.asaas.com/v3/customers/" + pg.customer,
              { headers: { access_token: ASAAS } });
            const c = await rc.json();
            clientes[pg.customer] = { nome: (c && c.name) || "", email: (c && c.email) || "" };
          } catch (e) { clientes[pg.customer] = { nome: "", email: "" }; }
        }
        nome = nome || clientes[pg.customer].nome;
        email = email || clientes[pg.customer].email;
      }
      linhas.push({
        data: ddmmaaaa(pg.paymentDate || pg.confirmedDate || pg.dueDate),
        descricao: (nome || pg.description || "Recebimento").slice(0, 120),
        email: String(email || "").toLowerCase(),
        valor: typeof pg.netValue === "number" ? pg.netValue : pg.value,
        taxa: (typeof pg.netValue === "number" && typeof pg.value === "number")
          ? Math.round((pg.value - pg.netValue) * 100) / 100 : 0,
        moeda: "R$",
        idExterno: pg.id,
        tipo: pg.billingType || "payment"
      });
    }
    if (!corpo.hasMore) break;
  }
  return linhas;
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, erro: "use POST" }) };

  if (!CHAVE)
    return { statusCode: 500, headers, body: JSON.stringify({
      ok: false, erro: "ISR_EXTRATO_CHAVE não está configurada no Netlify" }) };

  let corpo = {};
  try { corpo = JSON.parse(event.body || "{}"); } catch (e) {}
  if (corpo.chave !== CHAVE)
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, erro: "chave inválida" }) };

  const conta = String(corpo.conta || "").toLowerCase();
  const de = String(corpo.de || "").slice(0, 10);
  const ate = String(corpo.ate || "").slice(0, 10);

  try {
    let linhas;
    if (conta === "stripe") linhas = await stripe(de, ate);
    else if (conta === "asaas") linhas = await asaas(de, ate);
    else return { statusCode: 400, headers, body: JSON.stringify({
      ok: false, erro: "conta deve ser stripe ou asaas" }) };

    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, conta: conta, de: de, ate: ate, total: linhas.length, linhas: linhas }) };
  } catch (err) {
    console.error("extrato-conta " + conta + ":", err);
    return { statusCode: 502, headers, body: JSON.stringify({
      ok: false, erro: String((err && err.message) || err) }) };
  }
};
