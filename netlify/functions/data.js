const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

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
