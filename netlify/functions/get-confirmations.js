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
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (!isrAutorizado(event)) return ISR_RECUSA;

  try {
    const activityIds = event.queryStringParameters && event.queryStringParameters.activityIds
      ? event.queryStringParameters.activityIds
      : '';

    const params = new URLSearchParams({ action: 'getConfirmations', activityIds });
    const res = await fetch(`${APPS_SCRIPT_URL}?${params}`, { redirect: 'follow' });
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('get-confirmations error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ confirmations: {} }) };
  }
};
