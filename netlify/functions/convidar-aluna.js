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
// DUAS PORTAS, porque são dois chamadores diferentes:
//
//   1. a MÁQUINA (Zapier, quando alguém assina no systeme) manda a
//      chave ISR_CONVITE_CHAVE, no corpo ou no cabeçalho x-isr-chave;
//   2. a GESTORA, do próprio app, manda o token do Netlify Identity —
//      ela já está logada, e pedir que o navegador dela guarde a chave
//      seria publicar a chave.
//
// A porta 2 pode ser estreitada com ISR_EQUIPE_EMAILS: a lista, separada
// por vírgula, de quem da equipe pode convidar. Com ela configurada, só
// esses e-mails convidam pelo app. Sem ela, qualquer pessoa com conta no
// Identity convida — o que ainda é bem menos que "qualquer pessoa na
// internet", mas é menos do que você provavelmente quer.
//
// Endereço:  POST /.netlify/functions/convidar-aluna
// Corpo:     { "email": "...", "chave": "..." }
// Chave:     variável de ambiente ISR_CONVITE_CHAVE, no painel do
//            Netlify (Site configuration → Environment variables). A
//            mesma string vai no Zapier. Sem ela e sem sessão de
//            gestão, a função recusa tudo — não existe modo "aberto".
// ════════════════════════════════════════════════════════════════

const CHAVE = process.env.ISR_CONVITE_CHAVE;
const EQUIPE = String(process.env.ISR_EQUIPE_EMAILS || '')
  .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

exports.handler = async (event, context) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, erro: 'use POST' }) };

  let corpo = {};
  try { corpo = JSON.parse(event.body || '{}'); } catch (e) {}
  // o Zapier às vezes envia como formulário em vez de JSON
  if (!corpo.email && event.body && event.body.indexOf('=') > 0) {
    try {
      const p = new URLSearchParams(event.body);
      corpo = { email: p.get('email'), chave: p.get('chave'), nome: p.get('nome') };
    } catch (e) {}
  }

  // espaço sobrando na variável do Netlify ou no que foi colado não pode
  // ser a diferença entre funcionar e não funcionar
  const enviada = String(corpo.chave || (event.headers && event.headers['x-isr-chave']) || '').trim();
  const comChave = !!CHAVE && enviada === String(CHAVE).trim();

  // a gestora logada no app: o Netlify só preenche clientContext.user
  // quando o token do Identity que veio no Authorization é válido
  const quem = context && context.clientContext && context.clientContext.user;
  const emailDeQuem = String((quem && quem.email) || '').trim().toLowerCase();
  const daEquipe = !!emailDeQuem && (!EQUIPE.length || EQUIPE.indexOf(emailDeQuem) >= 0);

  if (!comChave && !daEquipe) {
    // "erro" diz qual das duas portas falhou, senão depurar isto vira
    // adivinhação — e é texto de quem mexe no servidor, não de quem
    // está olhando a ficha de uma professora. Quem lê essa parte é o
    // log e o Zapier. Para a tela vai o "motivo", que o app traduz.
    const motivo = emailDeQuem ? 'fora_da_lista' : (enviada ? 'chave_errada' : 'sem_sessao');
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, motivo: motivo,
      erro: emailDeQuem
        ? 'A conta ' + emailDeQuem + ' não está em ISR_EQUIPE_EMAILS, '
          + 'a lista de quem pode convidar.'
        : (enviada
          ? 'A chave enviada não é a mesma que está no Netlify em ISR_CONVITE_CHAVE. '
            + 'No campo "chave" vai o VALOR da senha, não o nome da variável.'
          : 'Sem chave e sem sessão de gestão. Entre no app, ou mande a chave '
            + 'no cabeçalho x-isr-chave.') }) };
  }

  const email = String(corpo.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0)
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, erro: 'e-mail ausente' }) };

  const ident = context && context.clientContext && context.clientContext.identity;
  if (!ident || !ident.url || !ident.token)
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, motivo: 'identity_desligado',
      erro: 'Identity não está ativo neste site — ative em Site configuration → Identity' }) };

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
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, motivo: 'identity_recusou',
      erro: 'Identity respondeu ' + res.status, detalhe: texto.slice(0, 300) }) };
  } catch (err) {
    console.error('convidar-aluna erro:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, erro: String(err && err.message || err) }) };
  }
};
