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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  if (!isrAutorizado(event)) return ISR_RECUSA;

  try {
    const { email, nome, turma, ciclo, certBase64, sendAll } = JSON.parse(event.body);

    if (sendAll) {
      // Admin: trigger Apps Script to send certificates to all eligible students
      const params = new URLSearchParams({ action: 'sendAllCertificates', ciclo: ciclo || '' });
      const res = await fetch(`${APPS_SCRIPT_URL}?${params}`, { redirect: 'follow' });
      const result = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // Single student: send certificate to their email
    if (!email || !certBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing email or certBase64' }) };
    }

    const params = new URLSearchParams({
      action: 'sendCertificate',
      email,
      nome: nome || '',
      turma: turma || '',
      ciclo: ciclo || '',
    });

    // The base64 image is too large for URL params — POST it
    const res = await fetch(`${APPS_SCRIPT_URL}?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certBase64 }),
      redirect: 'follow'
    });

    // Apps Script POST responses are sometimes opaque — handle gracefully
    let result = { ok: true };
    try { result = await res.json(); } catch (e) { /* apps script may return non-JSON */ }

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('send-certificate error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
