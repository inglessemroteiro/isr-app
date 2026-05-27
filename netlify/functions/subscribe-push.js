const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  try {
    const { email, subscription } = JSON.parse(event.body);
    if (!email || !subscription) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing fields' }) };

    const params = new URLSearchParams({
      action: 'saveSubscription',
      email: email,
      subscription: JSON.stringify(subscription)
    });

    const res = await fetch(`${APPS_SCRIPT_URL}?${params}`, { redirect: 'follow' });
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
