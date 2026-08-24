// ════════════════════════════════════════════════════════════════
// CONVITE NO NETLIFY IDENTITY — chamado pelo Zapier quando alguém
// assina no systeme.
//
// Por que existe: o convite do Identity NÃO aceita o token pessoal do
// Netlify. Ele só aceita o token de administrador que o próprio Netlify
// entrega dentro de uma função (context.clientContext.identity), com
// validade de minutos. Por isso o Zapier não consegue chamar a API do
// Identity direto — dá "Not Found" — e precisa chamar esta função, que
// está do lado de dentro e tem o token.
//
// Quem já tem conta NÃO é convidada de novo: o Identity responde que o
// e-mail já existe e a função trata isso como sucesso. É o que evita a
// mensagem de acesso chegando toda semana para a mesma pessoa.
//
// Endereço:  POST /.netlify/functions/convidar-aluna
// Corpo:     { "email": "...", "chave": "..." }
// Chave:     variável de ambiente ISR_CONVITE_CHAVE, no painel do
//            Netlify (Site configuration → Environment variables). A
//            mesma string vai no Zapier. Sem ela configurada, a função
//            recusa tudo — não existe modo "aberto".
// ════════════════════════════════════════════════════════════════

const CHAVE = process.env.ISR_CONVITE_CHAVE;

exports.handler = async (event, context) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, erro: 'use POST' }) };

  if (!CHAVE)
    return { statusCode: 500, headers, body: JSON.stringify({
      ok: false, erro: 'ISR_CONVITE_CHAVE não está configurada no Netlify' }) };

  let corpo = {};
  try { corpo = JSON.parse(event.body || '{}'); } catch (e) {}
  // o Zapier às vezes envia como formulário em vez de JSON
  if (!corpo.email && event.body && event.body.indexOf('=') > 0) {
    try {
      const p = new URLSearchParams(event.body);
      corpo = { email: p.get('email'), chave: p.get('chave'), nome: p.get('nome') };
    } catch (e) {}
  }

  const enviada = corpo.chave || (event.headers && event.headers['x-isr-chave']) || '';
  if (enviada !== CHAVE)
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, erro: 'chave inválida' }) };

  const email = String(corpo.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0)
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, erro: 'e-mail ausente' }) };

  const ident = context && context.clientContext && context.clientContext.identity;
  if (!ident || !ident.url || !ident.token)
    return { statusCode: 500, headers, body: JSON.stringify({
      ok: false, erro: 'Identity não está ativo neste site — ative em Site configuration → Identity' }) };

  try {
    const res = await fetch(ident.url + '/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
        Authorization: 'Bearer ' + ident.token },
      body: JSON.stringify({ email: email })
    });
    const texto = await res.text();

    if (res.ok)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, convidada: true, email: email }) };

    // 422 = e-mail já registrado. Não é erro: a pessoa já tem acesso e
    // não deve receber convite de novo.
    if (res.status === 422 || /already (registered|been registered|exists)/i.test(texto))
      return { statusCode: 200, headers, body: JSON.stringify({
        ok: true, convidada: false, jaTinhaConta: true, email: email }) };

    console.error('convidar-aluna · Identity respondeu', res.status, texto.slice(0, 300));
    return { statusCode: 502, headers, body: JSON.stringify({
      ok: false, erro: 'Identity respondeu ' + res.status, detalhe: texto.slice(0, 300) }) };
  } catch (err) {
    console.error('convidar-aluna erro:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, erro: String(err && err.message || err) }) };
  }
};
