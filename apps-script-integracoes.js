// ════════════════════════════════════════════════════════════════
// ISR — INTEGRAÇÕES COM AS PLANILHAS REAIS DO GOOGLE DRIVE
// (cole no MESMO projeto Apps Script do app; depois "Nova implantação")
//
// Este arquivo liga o Sistema da Escola às planilhas que a Gabi já usa:
//
//   1. [ISR] Planilha Renovações  → tela Cobrança
//   2. [ISR] MKT - Leads_e_Alunos → tela CRM / Marketing
//   3. [ISR] Units of study       → tela Turmas & Projetos
//
// Como são arquivos SEPARADOS da planilha mestra, usamos
// SpreadsheetApp.openById(). A conta do Apps Script precisa ter
// acesso de leitura a cada planilha (todas já são suas/compartilhadas).
// ════════════════════════════════════════════════════════════════

var ID_RENOVACOES = '1idijwzmI2mJScii2Wt0RFmhqVImFQkq0X9aEU1oS-ec'; // [ISR] Planilha Renovações
var ID_MKT_LEADS  = '1-6fPqzwD3EKMLFXL8y3H2_nQ7-hWGtsUccVJP7UMyHU'; // [ISR] MKT - Leads_e_Alunos
var ID_UNITS      = '1oTQqNtNMYySBNR5hkh2bHli-ahfUV_qYUaHhSWg-EO8'; // [ISR] Units of study


// ════════════════════════════════════════════════════════════════
// 1. COBRANÇA — [ISR] Planilha Renovações
//    Aba 2 (parcelas): Nome | Tipo | Quantos ciclos | Valor Total Real |
//    Valor Total Euro | Qtd parcelas | Data de Vencimento | Valor da
//    parcela | 1° Pag/Julho | 2° Agosto | ... | 8° Pagamento
//    ("quitou" numa coluna de mês = tudo pago dali em diante)
// ════════════════════════════════════════════════════════════════
function getCobrancaReal() {
  var ss = SpreadsheetApp.openById(ID_RENOVACOES);
  var sheets = ss.getSheets();
  // A aba de parcelas é a que tem "Valor da parcela" no cabeçalho
  var sheet = null, headerRow = -1, headers = null;
  for (var s = 0; s < sheets.length; s++) {
    var data = sheets[s].getDataRange().getValues();
    for (var i = 0; i < Math.min(data.length, 5); i++) {
      var joined = data[i].join('|').toLowerCase();
      if (joined.indexOf('valor da parcela') >= 0) { sheet = sheets[s]; headerRow = i; headers = data[i]; break; }
    }
    if (sheet) break;
  }
  if (!sheet) return { ok: false, error: 'aba de parcelas não encontrada' };

  var data = sheet.getDataRange().getValues();
  var mesesIdx = []; // colunas "1° Pag / Julho", "2° Agosto", ...
  var mesesLabel = ['Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', 'Janeiro', 'Extra'];
  for (var c = 0; c < headers.length; c++) {
    var h = (headers[c] || '').toString().toLowerCase();
    if (/^\d+°/.test(h.trim()) || h.indexOf('pag') === 0) mesesIdx.push(c);
  }

  function idxOf(names) {
    for (var c = 0; c < headers.length; c++) {
      var h = (headers[c] || '').toString().trim().toLowerCase();
      for (var n = 0; n < names.length; n++) if (h.indexOf(names[n]) >= 0) return c;
    }
    return -1;
  }
  var iNome = idxOf(['nome']);
  var iTipo = idxOf(['tipo']);
  var iCiclos = idxOf(['quantos ciclos', 'ciclos']);
  var iTotReal = idxOf(['valor total - real', 'total - real']);
  var iTotEuro = idxOf(['valor total - euro', 'total - euro']);
  var iNParc = idxOf(['quantidade de parcelas']);
  var iVenc = idxOf(['data de vencimento', 'vencimento']);
  var iVParc = idxOf(['valor da parcela']);

  var out = [];
  for (var r = headerRow + 1; r < data.length; r++) {
    var row = data[r];
    var nome = (row[iNome] || '').toString().trim();
    if (!nome) continue;
    var totReal = (row[iTotReal] || '').toString().trim();
    var totEuro = (row[iTotEuro] || '').toString().trim();
    var moeda = totEuro ? '€' : 'R$';
    var venc = (row[iVenc] || '').toString().trim();
    var vencDia = /auto/i.test(venc) ? 'auto' : (parseInt(venc, 10) || '');
    var quitou = false;
    var meses = [];
    for (var m = 0; m < mesesIdx.length; m++) {
      var cell = (row[mesesIdx[m]] || '').toString().trim();
      if (/quitou/i.test(cell)) { quitou = true; continue; }
      if (!cell) continue;
      meses.push({
        key: '2026-' + ('0' + (7 + m)).slice(-2), // Julho = 2026-07
        label: mesesLabel[m] || ('Mês ' + (m + 1)),
        valor: cell,
        // heurística: célula com data (dd/mm) = registrada como paga/agendada;
        // ajuste manual fica na tela de Cobrança
        pago: /\d{2}\/\d{2}/.test(cell) || quitou
      });
    }
    out.push({
      id: 'r' + r, nome: nome,
      telefone: '', // preencher via ISR_Planilha_Mestra (matchAlunoTelefone abaixo)
      tipo: (row[iTipo] || '').toString().trim() || 'Renovação',
      ciclos: (row[iCiclos] || '').toString().trim(),
      moeda: moeda,
      valorTotal: totEuro || totReal,
      parcelaValor: (row[iVParc] || '').toString().trim(),
      parcelas: parseInt(row[iNParc], 10) || meses.length,
      vencDia: vencDia,
      meses: meses,
      obs: quitou ? 'Quitou' : ''
    });
  }
  // completa telefones a partir da planilha mestra (aba "1. Alunos")
  try {
    var mestre = SpreadsheetApp.getActiveSpreadsheet();
    out.forEach(function (c) { c.telefone = matchAlunoTelefone(mestre, c.nome) || ''; });
  } catch (e) {}
  return { ok: true, cobranca: out };
}

// procura o telefone de uma aluna na "1. Alunos" pelo nome (match flexível)
function matchAlunoTelefone(ss, nome) {
  var sheet = ss.getSheetByName('1. Alunos');
  if (!sheet) return '';
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return '';
  var headers = data[1];
  var alvo = nome.toLowerCase().trim();
  var alvoFirst = alvo.split(' ')[0];
  for (var i = 2; i < data.length; i++) {
    var n = (col(data[i], headers, ['nome', 'name', 'aluno']) || '').toLowerCase().trim();
    if (!n) continue;
    if (n === alvo || n.indexOf(alvoFirst) === 0 || alvo.indexOf(n.split(' ')[0]) === 0) {
      return col(data[i], headers, ['telefone', 'whatsapp', 'celular', 'fone', 'phone']) || '';
    }
  }
  return '';
}


// ════════════════════════════════════════════════════════════════
// 2. CRM / MARKETING — [ISR] MKT - Leads_e_Alunos
//    Aba "Entrada de Leads": Data de Entrada | Nome | Telefone | E-mail |
//    Cidade/país | Objetivo | Funil | Status | Data do contato/call |
//    Data do contrato | valor do contrato | Objeção principal |
//    Objeção secundária | Frase real | Follow-up feito? | Pretensão de
//    dia | Pretensão de horário | Modalidade | Local | Reunião | Nível |
//    Observações
//
//    Mapeamento Status (planilha) → estágio (CRM):
//      Ganho             → matriculado
//      Perdido           → perdido
//      Acompanhar        → em_conversa
//      Contato Realizado → a_contatar
//      Inativo           → perdido
//      (vazio)           → a_contatar
// ════════════════════════════════════════════════════════════════
function getLeadsMKT() {
  var ss = SpreadsheetApp.openById(ID_MKT_LEADS);
  var sheet = ss.getSheetByName('Entrada de Leads') || ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, leads: [] };
  var headers = data[0];

  var mapStatus = {
    'ganho': 'matriculado', 'perdido': 'perdido', 'acompanhar': 'em_conversa',
    'contato realizado': 'a_contatar', 'inativo': 'perdido'
  };

  var leads = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var nome = (col(row, headers, ['nome']) || '').toString().trim();
    if (!nome) continue;
    var status = (col(row, headers, ['status']) || '').toString().trim().toLowerCase();
    var funil = (col(row, headers, ['funil']) || '').toString().trim();
    var historico = [];
    var frase = (col(row, headers, ['frase real']) || '').toString().trim();
    var obj1 = (col(row, headers, ['objeção principal', 'objecao principal']) || '').toString().trim();
    var objetivo = (col(row, headers, ['objetivo']) || '').toString().trim();
    if (objetivo) historico.push({ data: '', tipo: 'criado', texto: 'Objetivo: ' + objetivo });
    if (obj1) historico.push({ data: '', tipo: 'nota', texto: 'Objeção: ' + obj1 });
    if (frase) historico.push({ data: '', tipo: 'nota', texto: 'Frase real: "' + frase + '"' });

    leads.push({
      id: 'mkt' + i,
      nome: nome,
      telefone: (col(row, headers, ['telefone']) || '').toString().trim(),
      email: (col(row, headers, ['e-mail', 'email']) || '').toString().trim(),
      canal: funil || 'Outro', // Social Selling / Aplicação / Indicação / Site / Sessão Premium
      origemDetalhe: funil,
      veioDe: (col(row, headers, ['cidade', 'local']) || '').toString().trim(),
      entrouPor: (col(row, headers, ['modalidade']) || '').toString().trim(),
      entrouEm: fmtDateISO(col(row, headers, ['data de entrada'])),
      turma: '',
      nivel: (col(row, headers, ['nível', 'nivel']) || '').toString().trim(),
      horarios: ((col(row, headers, ['pretensão de dia', 'pretensao de dia']) || '') + ' ' +
                 (col(row, headers, ['pretensão de horário', 'pretensao de horario']) || '')).trim(),
      querComecar: objetivo,
      estagio: mapStatus[status] || 'a_contatar',
      badge: (col(row, headers, ['reunião', 'reuniao']) || '').toString().trim(),
      proximoFollowup: '',
      historico: historico
    });
  }
  return { ok: true, leads: leads };
}


// ════════════════════════════════════════════════════════════════
// 3. PEDAGÓGICO — [ISR] Units of study
//    Estrutura com células mescladas: nível na col A, depois por linha
//    Time | Código | Teacher e blocos por CYCLE (Project title, Teacher's
//    Guide, Student's notebook, Syllabus, Group Calendar).
//    Lemos a 1ª aba e devolvemos por turma o projeto/links do ciclo atual.
// ════════════════════════════════════════════════════════════════
function getUnitsOfStudy() {
  var ss = SpreadsheetApp.openById(ID_UNITS);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();

  // localizar a linha de cabeçalho (a que tem "Time" e "Teacher")
  var headerRow = -1;
  for (var i = 0; i < Math.min(data.length, 6); i++) {
    var j = data[i].join('|').toLowerCase();
    if (j.indexOf('time') >= 0 && j.indexOf('teacher') >= 0) { headerRow = i; break; }
  }
  if (headerRow < 0) return { ok: false, error: 'cabeçalho não encontrado' };
  var headers = data[headerRow];

  // colunas "project title" (uma por ciclo) — usamos a última com conteúdo
  var projCols = [];
  for (var c = 0; c < headers.length; c++) {
    var h = (headers[c] || '').toString().toLowerCase();
    if (h.indexOf('project t') >= 0) projCols.push(c);
  }
  function idxOf(names, from) {
    for (var c = from || 0; c < headers.length; c++) {
      var h = (headers[c] || '').toString().trim().toLowerCase();
      for (var n = 0; n < names.length; n++) if (h.indexOf(names[n]) >= 0) return c;
    }
    return -1;
  }
  var iTime = idxOf(['time']);
  var iTeacher = idxOf(['teacher']);

  var units = [];
  var nivelAtual = '';
  for (var r = headerRow + 1; r < data.length; r++) {
    var row = data[r];
    // célula mesclada: col A traz o nível quando muda
    var a = (row[0] || '').toString().trim();
    if (a) nivelAtual = a;
    var time = (row[iTime] || '').toString().trim();
    if (!time) continue;
    // projeto: última coluna de project title preenchida (ciclo mais recente)
    var projeto = '';
    for (var p = projCols.length - 1; p >= 0; p--) {
      var v = (row[projCols[p]] || '').toString().trim();
      if (v) { projeto = v; break; }
    }
    // notebook: primeira coluna com "notebook" após o Time
    var iNb = idxOf(['notebook'], iTime);
    units.push({
      nivel: nivelAtual,
      turma: time,
      teacher: shortTeacher((row[iTeacher] || '').toString()),
      cycle: 'atual',
      projeto: projeto,
      notebook: iNb >= 0 ? (row[iNb] || '').toString().trim() : '',
      syllabus: '', guide: '', calendar: ''
    });
  }
  return { ok: true, units: units };
}

function shortTeacher(email) {
  var e = (email || '').toLowerCase();
  if (e.indexOf('gabriela') >= 0 || e.indexOf('gabi') >= 0) return 'Gabi';
  if (e.indexOf('carla') >= 0) return 'Carla';
  if (e.indexOf('adrielly') >= 0) return 'Adrielly';
  if (e.indexOf('ryousuf') >= 0 || e.indexOf('ricky') >= 0) return 'Ricky';
  return (email || '').split('@')[0] || '';
}


// ── HELPER ────────────────────────────────────────────────────────
function fmtDateISO(v) {
  if (!v) return '';
  if (v instanceof Date) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
  }
  var s = v.toString().trim();
  // "05/02" ou "05/02/2026" → ISO (ano corrente se faltar)
  var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (m) {
    var y = m[3] || new Date().getFullYear();
    return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  return s.slice(0, 10);
}


// ── ROTEAMENTO: adicione dentro do seu doGet(e), no switch de action ──
//
//   else if (action === 'getCobrancaReal')  { return json(getCobrancaReal()); }
//   else if (action === 'getLeadsMKT')      { return json(getLeadsMKT()); }
//   else if (action === 'getUnitsOfStudy')  { return json(getUnitsOfStudy()); }
//
// ── NO FRONT (crm-data.js), para trocar demo → real: ─────────────
//
//   fetch(EXEC + '?action=getLeadsMKT').then(r => r.json())
//     .then(d => { if (d.ok) localStorage.setItem('isr_crm_leads', JSON.stringify(d.leads)); });
//   fetch(EXEC + '?action=getCobrancaReal').then(r => r.json())
//     .then(d => { if (d.ok) localStorage.setItem('isr_crm_cobranca', JSON.stringify(d.cobranca)); });
//
// ════════════════════════════════════════════════════════════════
