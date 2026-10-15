const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// ── PORTA FECHADA ───────────────────────────────────────────────
// Nenhuma tela do site chama esta função: quem chama é máquina
// (Zapier, o app da aluna, um cron). O endereço é público; a resposta
// não pode ser. Sem a chave certa ela recusa — e sem a variável
// configurada recusa também, porque não existe modo aberto.
//
// A chave é a ISR_FUNCOES_CHAVE, no painel do Netlify
// (Site configuration → Environment variables). A mesma string vai em
// quem chama, no cabeçalho x-isr-chave ou no campo "chave".
const ISR_CHAVE = process.env.ISR_FUNCOES_CHAVE;
function isrAutorizado(event) {
  if (!ISR_CHAVE) return false;
  const h = event.headers || {};
  const q = event.queryStringParameters || {};
  let corpo = {};
  try { corpo = JSON.parse(event.body || "{}"); } catch (e) {}
  return (h["x-isr-chave"] || h["X-Isr-Chave"] || corpo.chave || q.chave) === ISR_CHAVE;
}
const ISR_RECUSA = {
  statusCode: 401,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ok: false, erro: "chave ausente ou inválida" })
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (!isrAutorizado(event)) return ISR_RECUSA;

  const email = event.queryStringParameters && event.queryStringParameters.email;
  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email required' }) };
  }

  if (!APPS_SCRIPT_URL) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'APPS_SCRIPT_URL not configured' }) };
  }

  try {
    const url = `${APPS_SCRIPT_URL}?email=${encodeURIComponent(email.toLowerCase().trim())}`;
    const response = await fetch(url, { redirect: 'follow' });
    const data = await response.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('data function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
