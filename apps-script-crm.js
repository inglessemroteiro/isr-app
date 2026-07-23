// ════════════════════════════════════════════════════════════════
// ISR CRM — Apps Script (cole no MESMO projeto do seu Apps Script atual)
//
// Liga o CRM (telas "Funil de Leads" e "Mensagens WhatsApp") à sua
// planilha do Google, na aba "Leads". Enquanto você não colar isto,
// o CRM funciona 100% no navegador (localStorage) com dados de demo.
//
// PASSO A PASSO PRA CONECTAR DE VERDADE:
//   1. Cole as funções abaixo no seu projeto do Apps Script.
//   2. Adicione as rotas indicadas em "ROTEAMENTO" dentro do seu doGet.
//   3. Faça um novo "Implantar → Nova implantação" (Web app).
//   4. Em crm-data.js, troque loadLeads()/saveLeads() pelas versões
//      "►► BACKEND" comentadas no fim deste arquivo.
//
// ESTRUTURA DA ABA "Leads"  (linha 1 = título, linha 2 = cabeçalhos):
//   ID | Nome | Telefone | Email | Canal | Origem detalhada | Veio de |
//   Entrou por | Entrou em | Turma | Nível | Horários | Quer começar |
//   Estágio | Badge | Próximo follow-up | Histórico (JSON)
//
//   • Estágio: incompleta | a_contatar | em_conversa | reuniao |
//              contrato | matriculado | perdido
//   • Datas no formato AAAA-MM-DD.
//   • Histórico: JSON array [{data,tipo,texto}] — o app cuida disso.
// ════════════════════════════════════════════════════════════════

var LEADS_SHEET = 'Leads';

// Cabeçalhos canônicos (col() já aceita variações/acentos).
var LEAD_COLS = {
  id:            ['id', 'lead id', 'leadid'],
  nome:          ['nome', 'name', 'lead'],
  telefone:      ['telefone', 'phone', 'whatsapp', 'celular', 'fone'],
  email:         ['email', 'e-mail', 'mail'],
  canal:         ['canal', 'origem', 'source', 'channel'],
  origemDetalhe: ['origem detalhada', 'origemdetalhe', 'detalhe origem', 'utm', 'origem detalhe'],
  veioDe:        ['veio de', 'veiode', 'referrer', 'referer'],
  entrouPor:     ['entrou por', 'entroupor', 'landing', 'path'],
  entrouEm:      ['entrou em', 'entrouem', 'data', 'created', 'criado em'],
  turma:         ['turma', 'turmas', 'class', 'grupo'],
  nivel:         ['nivel', 'nível', 'level'],
  horarios:      ['horarios', 'horários', 'horario', 'horário', 'disponibilidade'],
  querComecar:   ['quer começar', 'quer comecar', 'quercomecar', 'início', 'inicio'],
  estagio:       ['estagio', 'estágio', 'stage', 'etapa'],
  badge:         ['badge', 'selo', 'tag'],
  followup:      ['próximo follow-up', 'proximo follow-up', 'followup', 'follow-up', 'proximo followup'],
  historico:     ['histórico', 'historico', 'history', 'log']
};

// ── ensure a aba Leads existe com cabeçalhos ──────────────────────
function ensureLeadsSheet(ss) {
  var sheet = ss.getSheetByName(LEADS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LEADS_SHEET);
    sheet.appendRow(['Leads — CRM']);
    sheet.appendRow(['ID', 'Nome', 'Telefone', 'Email', 'Canal', 'Origem detalhada',
      'Veio de', 'Entrou por', 'Entrou em', 'Turma', 'Nível', 'Horários',
      'Quer começar', 'Estágio', 'Badge', 'Próximo follow-up', 'Histórico (JSON)']);
  }
  return sheet;
}

// ── GET: todos os leads como objetos ──────────────────────────────
function getLeads(ss) {
  var sheet = ss.getSheetByName(LEADS_SHEET);
  if (!sheet) return { ok: true, leads: [] };
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return { ok: true, leads: [] };
  var headers = data[1];
  var leads = [];
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !col(row, headers, LEAD_COLS.nome)) continue; // linha vazia
    var hist = col(row, headers, LEAD_COLS.historico) || '';
    var parsedHist = [];
    try { parsedHist = hist ? JSON.parse(hist) : []; } catch (e) { parsedHist = []; }
    leads.push({
      id:            (col(row, headers, LEAD_COLS.id) || ('l' + i)).toString(),
      nome:          col(row, headers, LEAD_COLS.nome) || '',
      telefone:      col(row, headers, LEAD_COLS.telefone) || '',
      email:         col(row, headers, LEAD_COLS.email) || '',
      canal:         col(row, headers, LEAD_COLS.canal) || '',
      origemDetalhe: col(row, headers, LEAD_COLS.origemDetalhe) || '',
      veioDe:        col(row, headers, LEAD_COLS.veioDe) || '',
      entrouPor:     col(row, headers, LEAD_COLS.entrouPor) || '',
      entrouEm:      fmtDate(col(row, headers, LEAD_COLS.entrouEm)),
      turma:         col(row, headers, LEAD_COLS.turma) || '',
      nivel:         col(row, headers, LEAD_COLS.nivel) || '',
      horarios:      col(row, headers, LEAD_COLS.horarios) || '',
      querComecar:   col(row, headers, LEAD_COLS.querComecar) || '',
      estagio:       (col(row, headers, LEAD_COLS.estagio) || 'a_contatar').toString().trim(),
      badge:         col(row, headers, LEAD_COLS.badge) || '',
      proximoFollowup: fmtDate(col(row, headers, LEAD_COLS.followup)),
      historico:     parsedHist
    });
  }
  return { ok: true, leads: leads };
}

// ── UPSERT: cria ou atualiza um lead (recebe JSON no parâmetro "lead") ─
function saveLead(ss, params) {
  var sheet = ensureLeadsSheet(ss);
  var lead;
  try { lead = JSON.parse(params.lead || '{}'); } catch (e) { return { ok: false, error: 'lead JSON inválido' }; }
  if (!lead.id) lead.id = 'l' + new Date().getTime();

  var data = sheet.getDataRange().getValues();
  var headers = data[1];
  var idIdx = colIndex(headers, LEAD_COLS.id);

  var rowValues = [
    lead.id, lead.nome || '', lead.telefone || '', lead.email || '', lead.canal || '',
    lead.origemDetalhe || '', lead.veioDe || '', lead.entrouPor || '',
    lead.entrouEm || fmtDate(new Date()), lead.turma || '', lead.nivel || '',
    lead.horarios || '', lead.querComecar || '', lead.estagio || 'a_contatar',
    lead.badge || '', lead.proximoFollowup || '', JSON.stringify(lead.historico || [])
  ];

  // procura linha existente pelo ID
  for (var i = 2; i < data.length; i++) {
    if ((data[i][idIdx] || '').toString() === lead.id.toString()) {
      sheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return { ok: true, updated: true, id: lead.id };
    }
  }
  sheet.appendRow(rowValues);
  return { ok: true, saved: true, id: lead.id };
}

// ── DELETE ────────────────────────────────────────────────────────
function deleteLead(ss, params) {
  var sheet = ss.getSheetByName(LEADS_SHEET);
  if (!sheet) return { ok: false, error: 'sem aba Leads' };
  var data = sheet.getDataRange().getValues();
  var idIdx = colIndex(data[1], LEAD_COLS.id);
  for (var i = 2; i < data.length; i++) {
    if ((data[i][idIdx] || '').toString() === (params.id || '').toString()) {
      sheet.deleteRow(i + 1);
      return { ok: true, deleted: true };
    }
  }
  return { ok: false, error: 'lead não encontrado' };
}

// ── PAGAMENTOS: dados da aluna pra preencher as mensagens ─────────
// Lê da aba "1. Alunos" os campos usados nas mensagens de cobrança.
function getAlunosCobranca(ss) {
  var sheet = ss.getSheetByName('1. Alunos');
  if (!sheet) return { ok: true, alunos: [] };
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return { ok: true, alunos: [] };
  var headers = data[1];
  var alunos = [];
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var nome = col(row, headers, ['nome', 'name', 'aluno']) || '';
    if (!nome) continue;
    alunos.push({
      id: 'aluno:' + i,
      nome: nome,
      telefone:   col(row, headers, ['telefone', 'whatsapp', 'celular', 'fone', 'phone']) || '',
      turma:      col(row, headers, ['turma', 'turmas', 'class', 'grupo']) || '',
      nivel:      col(row, headers, ['nivel', 'nível', 'level']) || '',
      horarios:   col(row, headers, ['horario', 'horário', 'horarios', 'schedule']) || '',
      valor:      col(row, headers, ['valor', 'mensalidade', 'valor mensalidade', 'preço', 'preco']) || '',
      vencimento: fmtDate(col(row, headers, ['vencimento', 'vence em', 'due', 'data pagamento'])),
      link:       col(row, headers, ['link pagamento', 'link stripe', 'stripe', 'linkpagamento', 'pagamento']) || ''
    });
  }
  return { ok: true, alunos: alunos };
}

// ── HELPERS ───────────────────────────────────────────────────────
function colIndex(headers, names) {
  for (var i = 0; i < headers.length; i++) {
    var h = (headers[i] || '').toString().trim().toLowerCase();
    for (var j = 0; j < names.length; j++) {
      if (h === names[j].toLowerCase()) return i;
    }
  }
  return 0;
}
function fmtDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
  }
  return v.toString().slice(0, 10);
}

// ── ROTEAMENTO: adicione dentro do seu doGet(e), no switch de action ──
//
//   else if (action === 'getLeads')        { return json(getLeads(ss)); }
//   else if (action === 'saveLead')        { return json(saveLead(ss, e.parameter)); }
//   else if (action === 'deleteLead')      { return json(deleteLead(ss, e.parameter)); }
//   else if (action === 'getAlunosCobranca') { return json(getAlunosCobranca(ss)); }
//
// ════════════════════════════════════════════════════════════════
//  ►► BACKEND — cole isto no lugar de loadLeads()/saveLeads() em
//     crm-data.js quando quiser usar a planilha compartilhada.
//     (deixe a versão localStorage como fallback offline)
// ────────────────────────────────────────────────────────────────
//
//   var EXEC = "https://script.google.com/macros/s/SEU_ID/exec";
//
//   // carga (síncrona não dá em JS de navegador; use cache + refresh):
//   function loadLeads() {
//     ensureSeed();
//     try { return JSON.parse(localStorage.getItem(LEADS_KEY)) || []; }
//     catch (e) { return []; }
//   }
//   // sincroniza com a planilha em segundo plano:
//   function refreshFromSheet() {
//     return fetch(EXEC + "?action=getLeads")
//       .then(function (r) { return r.json(); })
//       .then(function (d) { if (d && d.ok) { localStorage.setItem(LEADS_KEY, JSON.stringify(d.leads)); } });
//   }
//   function saveLeads(leads) {
//     localStorage.setItem(LEADS_KEY, JSON.stringify(leads)); // cache local imediato
//   }
//   // ao editar um lead, além de saveLeads(), empurre pra planilha:
//   function pushLead(lead) {
//     return fetch(EXEC + "?action=saveLead&lead=" + encodeURIComponent(JSON.stringify(lead)));
//   }
//
// ════════════════════════════════════════════════════════════════
