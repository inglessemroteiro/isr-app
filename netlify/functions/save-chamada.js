// ── PORTA FECHADA ───────────────────────────────────────────────
// Esta função grava CHAMADA, que é o registro que valida a aula para a
// folha de pagamento e que decide a presença da aluna no ciclo. O
// endereço é público; escrever nele não pode ser.
//
// Ela ficou aberta porque nasceu antes da regra. A escola confirmou que
// nenhuma automação a chama hoje, então fechá-la não quebra nada — e
// deixá-la aberta deixava qualquer pessoa na internet lançar presença.
//
// A chave é a ISR_FUNCOES_CHAVE, no painel do Netlify (Site
// configuration → Environment variables). A mesma string vai em quem
// chamar, no cabeçalho x-isr-chave ou no campo "chave".
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
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
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  if (!isrAutorizado(event)) return ISR_RECUSA;

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
