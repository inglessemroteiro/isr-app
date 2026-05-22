exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

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
