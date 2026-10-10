// ════════════════════════════════════════════════════════════════
// COMPRA NO STRIPE → TAG NO SYSTEME.IO (sem Zapier)
//
// O Stripe chama esta função toda vez que um checkout termina pago.
// A função lê os produtos da compra (produto principal e order bump,
// cada um é uma linha), descobre a tag de cada produto e aplica no
// contato do systeme.io. Quem manda o e-mail é a regra de automação
// do systeme ("tag adicionada → enviar e-mail"), uma por produto.
//
// Não existe lista de produtos aqui dentro. A tag mora no próprio
// produto do Stripe: Catálogo de produtos → produto → Metadados →
// chave "tag", valor com o nome da tag no systeme (ex.: comprou-ebook).
// Produto novo = preencher o metadado + criar a tag e a regra no
// systeme. Nada muda no código.
//
// Um produto pode aplicar mais de uma tag: separe por vírgula.
// Se a tag ainda não existir no systeme, a função cria.
//
// Endereço:  POST /.netlify/functions/stripe-compra
//            (é esse o endereço do webhook no painel do Stripe)
// Eventos:   checkout.session.completed
//            checkout.session.async_payment_succeeded
//
// Variáveis no Netlify (Site configuration → Environment variables):
//   STRIPE_WEBHOOK_SECRET  whsec_... (Stripe → Developers → Webhooks →
//                          o endpoint → Signing secret)
//   STRIPE_API_KEY         a mesma chave já usada pelo extrato; precisa
//                          de leitura em "Checkout Sessions"
//   SYSTEME_API_KEY        chave de API do systeme (Configurações →
//                          Chave de API pública)
//   SLACK_WEBHOOK_URL      opcional; avisa cada compra e cada problema
//
// Se o systeme falhar, a função responde erro e o Stripe tenta de novo
// sozinho (por até 3 dias). Se um produto estiver sem a tag, a função
// aceita a compra, avisa no Slack, e o evento pode ser reenviado no
// painel do Stripe depois de preencher o metadado.
// ════════════════════════════════════════════════════════════════

const crypto = require("crypto");

const STRIPE  = process.env.STRIPE_API_KEY || process.env.API_ISR_SYSTEM;
const SEGREDO = process.env.STRIPE_WEBHOOK_SECRET;
const SYSTEME = process.env.SYSTEME_API_KEY;
const SLACK   = process.env.SLACK_WEBHOOK_URL;

const STRIPE_API  = "https://api.stripe.com/v1";
const SYSTEME_API = "https://api.systeme.io/api";
const TOLERANCIA  = 5 * 60; // segundos entre o envio do Stripe e a chegada aqui

// ── Assinatura do Stripe ──────────────────────────────────────
// O cabeçalho vem como "t=1700000000,v1=abc...,v1=def...". A assinatura é
// o HMAC-SHA256 de "<t>.<corpo cru>" com o segredo do endpoint. Sem isso
// qualquer pessoa que descobrisse o endereço poderia "comprar" de graça.
function assinaturaValida(corpo, cabecalho) {
  if (!cabecalho || !SEGREDO) return false;
  const partes = {};
  String(cabecalho).split(",").forEach((p) => {
    const i = p.indexOf("=");
    if (i < 0) return;
    const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
    (partes[k] = partes[k] || []).push(v);
  });
  const t = partes.t && partes.t[0];
  const v1 = partes.v1 || [];
  if (!t || !v1.length) return false;
  const idade = Math.floor(Date.now() / 1000) - parseInt(t, 10);
  if (!(idade >= -TOLERANCIA && idade <= TOLERANCIA)) return false;
  const esperada = crypto.createHmac("sha256", SEGREDO).update(t + "." + corpo, "utf8").digest("hex");
  return v1.some((s) => s.length === esperada.length
    && crypto.timingSafeEqual(Buffer.from(s, "utf8"), Buffer.from(esperada, "utf8")));
}

// ── Stripe ────────────────────────────────────────────────────
async function itensDaCompra(sessionId) {
  const q = new URLSearchParams({ limit: "100" });
  q.append("expand[]", "data.price.product");
  const r = await fetch(STRIPE_API + "/checkout/sessions/" + sessionId + "/line_items?" + q,
    { headers: { Authorization: "Bearer " + STRIPE } });
  const d = await r.json();
  if (!r.ok) throw new Error("Stripe " + r.status + ": " + ((d.error || {}).message || ""));
  return d.data || [];
}

// A tag vem do metadado "tag" do produto; se o produto não tiver, vale
// o do preço. Vírgula ou ponto e vírgula separam várias tags.
function tagsDoItem(item) {
  const preco = (item && item.price) || {};
  const produto = preco.product && typeof preco.product === "object" ? preco.product : {};
  const bruto = (produto.metadata || {}).tag || (produto.metadata || {}).tags
    || (preco.metadata || {}).tag || (preco.metadata || {}).tags || "";
  return String(bruto).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function nomeDoItem(item) {
  const preco = (item && item.price) || {};
  const produto = preco.product && typeof preco.product === "object" ? preco.product : null;
  return (produto && produto.name) || item.description || (preco.id || "item sem nome");
}

// ── systeme.io ────────────────────────────────────────────────
async function systeme(metodo, caminho, corpo) {
  const r = await fetch(SYSTEME_API + caminho, {
    method: metodo,
    headers: Object.assign({ "X-API-Key": SYSTEME, Accept: "application/json" },
      corpo ? { "Content-Type": "application/json" } : {}),
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const texto = await r.text();
  let d = null;
  try { d = texto ? JSON.parse(texto) : null; } catch (e) { d = null; }
  return { status: r.status, ok: r.ok, data: d, texto };
}

function erroSysteme(r, oQue) {
  const msg = (r.data && (r.data.detail || r.data.message || r.data["hydra:description"]))
    || (r.texto || "").slice(0, 200);
  if (r.status === 401) return new Error("systeme.io: a chave em SYSTEME_API_KEY não foi aceita (401).");
  return new Error("systeme.io " + oQue + " respondeu " + r.status + (msg ? ": " + msg : ""));
}

async function buscarContato(email) {
  const r = await systeme("GET", "/contacts?" + new URLSearchParams({ email, limit: "1" }));
  if (!r.ok) throw erroSysteme(r, "ao buscar o contato");
  const itens = (r.data && r.data.items) || [];
  return itens.find((c) => String(c.email || "").toLowerCase() === email) || itens[0] || null;
}

async function criarContato(email, nome, telefone) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const fields = [];
  if (partes.length) fields.push({ slug: "first_name", value: partes[0] });
  if (partes.length > 1) fields.push({ slug: "surname", value: partes.slice(1).join(" ") });
  if (telefone) fields.push({ slug: "phone_number", value: telefone });
  const r = await systeme("POST", "/contacts", { email, locale: "pt", fields });
  if (r.ok && r.data && r.data.id) return r.data;
  // 422 = o e-mail já existe (duas compras chegando ao mesmo tempo):
  // então o contato está lá, é só buscar de novo
  if (r.status === 422) {
    const c = await buscarContato(email);
    if (c) return c;
  }
  throw erroSysteme(r, "ao criar o contato");
}

async function todasAsTags() {
  const tags = [];
  let startingAfter = null;
  for (let pagina = 0; pagina < 20; pagina++) {
    const q = new URLSearchParams({ limit: "100" });
    if (startingAfter) q.set("startingAfter", String(startingAfter));
    const r = await systeme("GET", "/tags?" + q);
    if (!r.ok) throw erroSysteme(r, "ao listar as tags");
    const itens = (r.data && r.data.items) || [];
    itens.forEach((t) => tags.push(t));
    if (!(r.data && r.data.hasMore) || !itens.length) break;
    startingAfter = itens[itens.length - 1].id;
  }
  return tags;
}

async function idDaTag(nome, cache) {
  const chave = nome.toLowerCase();
  if (cache[chave]) return cache[chave];
  const r = await systeme("POST", "/tags", { name: nome });
  if (r.ok && r.data && r.data.id) { cache[chave] = r.data.id; return r.data.id; }
  // 422 = alguém criou no meio do caminho; a lista nova resolve
  if (r.status === 422) {
    (await todasAsTags()).forEach((t) => { cache[String(t.name || "").toLowerCase()] = t.id; });
    if (cache[chave]) return cache[chave];
  }
  throw erroSysteme(r, "ao criar a tag \"" + nome + "\"");
}

async function aplicarTag(contatoId, tagId) {
  const r = await systeme("POST", "/contacts/" + contatoId + "/tags", { tagId });
  // 422 aqui é "a tag já está nesse contato" (o Stripe reenviou o
  // evento, ou a pessoa comprou de novo): o resultado é o mesmo
  if (r.ok || r.status === 422) return;
  throw erroSysteme(r, "ao aplicar a tag");
}

// ── Slack ─────────────────────────────────────────────────────
async function avisar(texto) {
  if (!SLACK) return;
  try {
    await fetch(SLACK, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto }) });
  } catch (e) { console.error("slack:", e.message); }
}

// ── A compra ──────────────────────────────────────────────────
async function processarCompra(session) {
  const detalhes = session.customer_details || {};
  const email = String(detalhes.email || session.customer_email || "").trim().toLowerCase();
  const nome = String(detalhes.name || "").trim();
  const telefone = String(detalhes.phone || "").trim();
  const valor = (session.amount_total || 0) / 100;
  const moeda = String(session.currency || "").toUpperCase();
  if (!email) throw new Error("a compra " + session.id + " chegou sem e-mail do cliente");

  const itens = await itensDaCompra(session.id);
  const semTag = [];
  const tags = [];
  itens.forEach((it) => {
    const t = tagsDoItem(it);
    if (!t.length) semTag.push(nomeDoItem(it));
    t.forEach((x) => { if (tags.indexOf(x) < 0) tags.push(x); });
  });

  let contatoId = null;
  if (tags.length) {
    const contato = (await buscarContato(email)) || (await criarContato(email, nome, telefone));
    contatoId = contato.id;
    const cache = {};
    (await todasAsTags()).forEach((t) => { cache[String(t.name || "").toLowerCase()] = t.id; });
    for (const t of tags) await aplicarTag(contatoId, await idDaTag(t, cache));
  }

  const quem = (nome ? nome + " · " : "") + email;
  const produtos = itens.map(nomeDoItem).join(" + ") || "sem itens";
  const linhas = ["✅ *Compra no Stripe* — " + quem,
    produtos + " · " + moeda + " " + valor.toFixed(2).replace(".", ","),
    tags.length ? "Tags no systeme: " + tags.join(", ") : "Nenhuma tag aplicada"];
  if (semTag.length)
    linhas.push("⚠️ Sem tag no Stripe (preencha o metadado \"tag\" do produto e reenvie o evento): "
      + semTag.join(", "));
  await avisar(linhas.join("\n"));

  return { email, contatoId, tags, semTag, produtos: itens.map(nomeDoItem) };
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, erro: "use POST" }) };

  const faltando = ["STRIPE_WEBHOOK_SECRET", "SYSTEME_API_KEY"].filter((v) => !process.env[v]);
  if (!STRIPE) faltando.push("STRIPE_API_KEY");
  if (faltando.length)
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false,
      erro: "Falta configurar no Netlify: " + faltando.join(", ") }) };

  // o corpo precisa ser o texto cru, byte a byte, senão a assinatura não bate
  const corpo = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  const h = event.headers || {};
  if (!assinaturaValida(corpo, h["stripe-signature"] || h["Stripe-Signature"]))
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false,
      erro: "assinatura do Stripe inválida: confira STRIPE_WEBHOOK_SECRET" }) };

  let evento = {};
  try { evento = JSON.parse(corpo); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, erro: "corpo não é JSON" }) };
  }

  const tipo = evento.type || "";
  const session = (evento.data && evento.data.object) || {};
  const interessa = tipo === "checkout.session.completed"
    || tipo === "checkout.session.async_payment_succeeded";
  // boleto/Pix: o "completed" chega com pagamento pendente e o
  // "async_payment_succeeded" chega quando o dinheiro cai
  if (!interessa || session.payment_status !== "paid")
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ignorado: tipo }) };

  try {
    const r = await processarCompra(session);
    console.log("compra processada:", JSON.stringify(r));
    return { statusCode: 200, headers, body: JSON.stringify(Object.assign({ ok: true }, r)) };
  } catch (err) {
    console.error("stripe-compra:", err);
    await avisar("❌ *Compra no Stripe não entrou no systeme* — "
      + ((session.customer_details || {}).email || session.id) + "\n" + err.message
      + "\nO Stripe vai tentar de novo sozinho.");
    // erro = o Stripe reenvia; é o que garante que a compra não se perde
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, erro: err.message }) };
  }
};
