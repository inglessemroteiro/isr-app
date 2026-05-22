const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!APPS_SCRIPT_URL) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'APPS_SCRIPT_URL not configured' }) };
  }

  try {
    const { turma, data, topico, bem, atencao, proximosPassos, profNome, profEmail } = JSON.parse(event.body);

    const params = new URLSearchParams({
      action: 'saveFeedback',
      turma: turma || '',
      data: data || '',
      topico: topico || '',
      bem: bem || '',
      atencao: atencao || '',
      proximosPassos: proximosPassos || '',
      profNome: profNome || '',
      profEmail: profEmail || ''
    });

    const url = `${APPS_SCRIPT_URL}?${params.toString()}`;
    const response = await fetch(url, { redirect: 'follow' });
    const result = await response.json();
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('save-feedback error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
