const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  try {
    const { nome, email, nota, source } = JSON.parse(event.body);
    if (!nome) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing nome' }) };

    const params = new URLSearchParams({
      action: 'saveInterest',
      nome,
      email: email || '',
      nota: nota || '',
      source: source || '',
      createdAt: new Date().toISOString()
    });

    const res = await fetch(`${APPS_SCRIPT_URL}?${params}`, { redirect: 'follow' });
    let result = { ok: true };
    try { result = await res.json(); } catch (e) {}
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('save-interest error:', err);
    // Return ok anyway — don't block the user on a backend error
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};
