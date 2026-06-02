const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  try {
    const { activityId, activityTitle, nome, email } = JSON.parse(event.body);
    if (!activityId || !nome) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing fields' }) };

    const params = new URLSearchParams({
      action: 'saveConfirmation',
      activityId,
      activityTitle: activityTitle || '',
      nome,
      email: email || '',
      confirmedAt: new Date().toISOString()
    });

    const res = await fetch(`${APPS_SCRIPT_URL}?${params}`, { redirect: 'follow' });
    const result = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('save-confirmation error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
