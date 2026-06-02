const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  try {
    const body = JSON.parse(event.body);
    // body: { savedBy, data: [{turma, semana, date, aluno, status}] }
    const params = new URLSearchParams({
      action: 'saveChamada',
      savedBy: body.savedBy || 'app',
      savedAt: new Date().toISOString(),
      data: JSON.stringify(body.data || [])
    });

    const res = await fetch(`${APPS_SCRIPT_URL}?${params}`, { redirect: 'follow' });
    const result = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('save-chamada error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
