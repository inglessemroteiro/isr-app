// ── PORTA FECHADA ───────────────────────────────────────────────
// Nenhuma tela do site chama esta função: quem chama é máquina
// (Zapier, o app da aluna, um cron). O endereço é público; o Slack da
// escola não pode ser. Sem a chave certa ela recusa — e sem a variável
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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!isrAutorizado(event)) return ISR_RECUSA;

  const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
  if (!SLACK_WEBHOOK_URL) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }; // fail silently if not configured
  }

  try {
    const { action, nome, email } = JSON.parse(event.body);

    const isConfirmed = action === 'confirmado';
    const emoji = isConfirmed ? '✅' : '🔄';
    const title = isConfirmed ? 'Onboarding confirmado' : 'Pedido de remarcação';
    const msg = isConfirmed
      ? `*${nome}* confirmou presença no onboarding.`
      : `*${nome}* quer remarcar o onboarding. Entre em contato: ${email || 'email não disponível'}`;

    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} ${title}`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `${emoji} *${title}*\n${msg}` }
          }
        ]
      })
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('onboarding-notify error:', err);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }; // fail silently
  }
};
