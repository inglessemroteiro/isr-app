const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

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
