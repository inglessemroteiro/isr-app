const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

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
