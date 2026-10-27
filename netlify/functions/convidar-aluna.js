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
const URL_BASE = process.env.ISR_BASE_URL;
const CHAVE_BASE = process.env.ISR_BASE_CHAVE || "";

// ── A TERCEIRA PORTA: A PRÓPRIA ALUNA ─────────────────────────────
//
// O /recover do Identity só manda e-mail para conta que já existe, e
// responde "ok" de qualquer jeito. Quem nunca foi convidada não tem
// conta: pedia o link de entrada, a tela dizia que o link saiu, e não
// saía nada. Ela não tinha como se resolver, e a escola não ficava
// sabendo.
//
// Agora ela mesma cria o acesso — e quem autoriza não é o navegador,
// é o registro da escola. A função carrega a base pelo servidor e só
// convida quem JÁ É ALUNA com turma ou produto contratado. Criar a
// conta, aliás, não dá acesso a nada por si: o portão continua
// conferindo o e-mail na base antes de abrir o app.
//
// A resposta é a mesma para quem está e para quem não está na base:
// dizer "você não é aluna aqui" numa tela aberta na internet é contar
// quem estuda na escola para quem perguntar.
function liberadaNaBase(pessoa) {
  if (!pessoa) return false;
  var st = String(pessoa.status || "");
  if (["aluna", "mvs"].indexOf(st) < 0) return false;
  if (pessoa.turma) return true;
  // produto contratado, pelas mesmas regras do app
  if (pessoa.particular) return true;
  if (pessoa.assinatura && pessoa.assinatura.ativa) return true;
  return false;
}
async function carregarBase() {
  if (!URL_BASE) throw new Error("sem base");
  const corpo = { action: "sistemaLoad" };
  if (CHAVE_BASE) corpo.chave = CHAVE_BASE;
  const r = await fetch(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(corpo)
  });
  if (!r.ok) throw new Error("base " + r.status);
  const d = await r.json();
  // O Apps Script responde 200 mesmo quando recusa: sem conferir o
  // "ok", uma recusa dele virava uma base vazia aqui, e base vazia
  // lida como "essa pessoa não está na Equipe" — a gestora recebia
  // "o seu e-mail não está em ficha nenhuma" com a ficha na frente
  // dela, preenchida. Não poder ler a base e a pessoa não estar nela
  // são coisas diferentes, e agora são tratadas como tais.
  if (d && d.ok === false) throw new Error("base recusou");
  const dados = (d && d.data) || {};
  if (!dados || typeof dados !== "object") throw new Error("base sem dados");
  return dados;
}
async function ehAlunaDaEscola(email) {
  if (!URL_BASE) return false;
  const base = await carregarBase();
  const pessoas = base.pessoas || [];
  const achada = pessoas.filter((x) =>
    x && !x.apagado && String(x.email || "").trim().toLowerCase() === email)[0];
  return liberadaNaBase(achada);
}

// ── QUEM É DA EQUIPE, SEGUNDO A ESCOLA ────────────────────────────
//
// Havia duas listas de quem pode convidar: a Equipe, na base, e a
// ISR_EQUIPE_EMAILS, escrita à mão nas variáveis do Netlify. Elas
// divergem no primeiro dia — alguém entra na Equipe, ninguém lembra
// da variável, e o convite recusa com "a sua conta não está na lista
// de quem pode convidar", sem dizer que lista é essa nem onde fica.
//
// A lista que vale é a da escola. A variável continua existindo para
// ESTREITAR: com ela preenchida, só os e-mails dela convidam, mesmo
// que a Equipe diga outra coisa.
const PAPEIS_QUE_CONVIDAM = ["gestora", "comercial", "operacao", "professora",
  "extra", "shadow"];
// Devolve POR QUE, e não só sim ou não: sem isso, descobrir o motivo
// de uma recusa vira troca de mensagens.
//   "ok"            está na Equipe com papel que abre o sistema
//   "sem_papel"     está na Equipe, sem papel marcado
//   "fora_da_equipe" o e-mail logado não está em ficha nenhuma
//   "sem_base"      o site não sabe onde fica a base
async function situacaoNaEquipe(email) {
  if (!URL_BASE) return "sem_base";
  const base = await carregarBase();
  const equipe = base.equipe || [];
  // Equipe vazia não é uma escola sem equipe: é uma base que não foi
  // lida. Dizer "você não está na Equipe" a partir disso manda a
  // pessoa arrumar uma ficha que já está certa.
  if (!equipe.length) return "sem_base";
  const m = equipe.filter((x) =>
    x && !x.apagado && String(x.email || "").trim().toLowerCase() === email)[0];
  if (!m) return "fora_da_equipe";
  const temPapel = (m.papeis || []).some((pp) => PAPEIS_QUE_CONVIDAM.indexOf(pp) >= 0);
  return temPapel ? "ok" : "sem_papel";
}
// lida a cada chamada, e não na carga do módulo: assim trocar a
// variável no Netlify vale na chamada seguinte, e a suíte consegue
// conferir os dois casos — com lista e sem lista
function equipeDaVariavel() {
  return String(process.env.ISR_EQUIPE_EMAILS || '')
    .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

exports.handler = async (event, context) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, motivo: 'erro_inesperado', erro: 'use POST' }) };

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
  // A EQUIPE DA ESCOLA MANDA, E A VARIÁVEL SOMA.
  //
  // A ISR_EQUIPE_EMAILS estreitava: preenchida, só os e-mails dela
  // convidavam. Uma variável esquecida nas configurações do site
  // passava então a trancar a gestora para fora do próprio sistema,
  // sem que nada na tela dissesse que ela existia. Agora ela SOMA —
  // serve para dar permissão a uma conta que não está na Equipe, e
  // nunca para tirar de quem está.
  let daEquipe = false;
  let porqueNao = '';
  if (emailDeQuem) {
    if (equipeDaVariavel().indexOf(emailDeQuem) >= 0) daEquipe = true;
    else {
      try {
        const sit = await situacaoNaEquipe(emailDeQuem);
        daEquipe = sit === 'ok';
        if (!daEquipe) porqueNao = sit;
      } catch (err) {
        console.error('convidar-aluna · equipe:', err);
        return { statusCode: 503, headers, body: JSON.stringify({ ok: false, motivo: 'base_fora',
          erro: 'Não foi possível consultar a base agora.' }) };
      }
    }
  }

  // a própria aluna pedindo o acesso dela: a autorização vem da base,
  // e o e-mail do pedido é o único que pode ser convidado
  const emailPedido = String(corpo.email || '').trim().toLowerCase();
  let porSiMesma = false;
  if (!comChave && !daEquipe && corpo.autoacesso === true) {
    if (!emailPedido || emailPedido.indexOf('@') < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, motivo: 'sem_email', erro: 'e-mail ausente' }) };
    }
    try {
      porSiMesma = await ehAlunaDaEscola(emailPedido);
    } catch (err) {
      console.error('convidar-aluna · base:', err);
      return { statusCode: 503, headers, body: JSON.stringify({ ok: false, motivo: 'base_fora',
        erro: 'Não foi possível consultar a base agora.' }) };
    }
    if (!porSiMesma) {
      // mesma resposta de quem está na base: a tela não conta quem
      // estuda aqui, e a aluna é mandada para a escola
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, convidada: false,
        semRegistro: true, email: emailPedido }) };
    }
  }

  if (!comChave && !daEquipe && !porSiMesma) {
    // "erro" diz qual das duas portas falhou, senão depurar isto vira
    // adivinhação — e é texto de quem mexe no servidor, não de quem
    // está olhando a ficha de uma professora. Quem lê essa parte é o
    // log e o Zapier. Para a tela vai o "motivo", que o app traduz.
    const motivo = emailDeQuem
      ? (porqueNao === 'sem_papel' ? 'sem_papel'
        : porqueNao === 'sem_base' ? 'sem_base' : 'fora_da_equipe')
      : (enviada ? 'chave_errada' : 'sem_sessao');
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, motivo: motivo,
      conta: emailDeQuem || undefined,
      erro: emailDeQuem
        ? 'A conta ' + emailDeQuem + ' ' + (porqueNao === 'sem_papel'
            ? 'está na Equipe sem papel que abra o sistema.'
            : porqueNao === 'sem_base'
              ? 'não pôde ser conferida: ISR_BASE_URL não está definida.'
              : 'não foi achada na Equipe por este e-mail.')
        : (enviada
          ? 'A chave enviada não é a mesma que está no Netlify em ISR_CONVITE_CHAVE. '
            + 'No campo "chave" vai o VALOR da senha, não o nome da variável.'
          : 'Sem chave e sem sessão de gestão. Entre no app, ou mande a chave '
            + 'no cabeçalho x-isr-chave.') }) };
  }

  const email = String(corpo.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0)
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, motivo: 'sem_email', erro: 'e-mail ausente' }) };

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
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, motivo: 'erro_inesperado', erro: String(err && err.message || err) }) };
  }
};
