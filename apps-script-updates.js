// ════════════════════════════════════════════════════════════════
// ISR Apps Script — UPDATED FUNCTIONS  (paste into your script)
//
// KEY INSIGHT: "2. Professores" has TWO tables in one sheet:
//   TOP    (rows 1-8ish)  : professor profiles
//           → Email | Nome | Papel | Turmas (separadas por vírgula) | ...
//   BOTTOM (rows 10+)     : turma schedule details
//           → Turma | Código | Turma[=prof name] | Horário | teacher's guide | school calendar | Meet Link fixo
//
// The functions below detect both sections automatically.
//
// ── FIELD NAMING CONVENTION ─────────────────────────────────────
//   linkAtividades  = student's own caderno from "1. Alunos"     → "My Activities" button
//   linkCaderno     = shared class notebook from "2. Professores" → "Class Notebook" button
//   meetLink        = "Meet Link fixo" from "2. Professores"
//   teacherGuide    = "teacher's guide" link from "2. Professores"
//   schoolCalendar  = "school calendar" link from "2. Professores"
//   nextTopic       = next session topic (read from the school calendar Google Doc)
// ════════════════════════════════════════════════════════════════


// ── HELPER: locate the TURMA SCHEDULE section ────────────────────
// "2. Professores" has two sub-tables. This finds the row where the
// schedule section starts (first column = "Turma") and returns its
// headers and data rows separately from the professor profile section.
function getTurmaSection(ss) {
  var sheet = ss.getSheetByName('2. Professores');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();

  for (var i = 0; i < data.length - 1; i++) {
    var cell = (data[i][0] || '').toString().trim().toLowerCase();
    // Identify the schedule header row: "Turma" in col A, next row has actual data
    if ((cell === 'turma' || cell === 'class' || cell === 'grupo') && data[i + 1] && data[i + 1][0]) {
      // Filter out empty rows in the data section
      var rows = data.slice(i + 1).filter(function (r) { return r[0] && r[0].toString().trim() !== ''; });
      return { headers: data[i], rows: rows };
    }
  }
  return null;
}


// ── HELPER: locate the PROFESSOR PROFILE section ─────────────────
// Returns the professor profile header row and all profile rows.
// Profile section ends when we hit an empty row or the turma schedule header.
function getProfSection(ss) {
  var sheet = ss.getSheetByName('2. Professores');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return null;

  var headers = data[1]; // row 2 = professor profile headers (Email, Nome, Papel, Turmas...)
  var rows = [];
  for (var i = 2; i < data.length; i++) {
    var firstCell = (data[i][0] || '').toString().trim().toLowerCase();
    // Stop at empty rows or when we hit the schedule section header
    if (!data[i][0] && !data[i][1]) continue;    // skip blank rows
    if (firstCell === 'turma' || firstCell === 'class') break; // hit schedule header
    rows.push(data[i]);
  }
  return { headers: headers, rows: rows };
}


// ── HELPER: look up a single turma row by exact code ─────────────
function getTurmaByCode(ss, code) {
  if (!code) return null;
  var section = getTurmaSection(ss);
  if (!section) return null;
  var codeNorm = code.toString().trim().toLowerCase();

  for (var i = 0; i < section.rows.length; i++) {
    var row = section.rows[i];
    var rowCode = col(row, section.headers, ['codigo', 'código', 'code', 'turma_code', 'cod']) || '';
    if (rowCode.toString().trim().toLowerCase() === codeNorm) {
      return { row: row, headers: section.headers };
    }
  }
  return null;
}


// ── HELPER: look up a single turma row by exact name ─────────────
function getTurmaByName(ss, turmaName) {
  if (!turmaName) return null;
  var section = getTurmaSection(ss);
  if (!section) return null;
  var nameLower = turmaName.toString().trim().toLowerCase();

  for (var i = 0; i < section.rows.length; i++) {
    var row = section.rows[i];
    // Column A is the turma name (first "Turma" column)
    var rowName = (row[0] || '').toString().trim().toLowerCase();
    if (rowName === nameLower) {
      return { row: row, headers: section.headers };
    }
  }
  return null;
}


// ── HELPER: extract all fields from a turma schedule row ──────────
function parseTurmaRow(row, headers, tName, ss) {
  var horario       = col(row, headers, ['horario', 'horário', 'schedule', 'dia', 'day', 'hora']) || '';
  var meetLink      = col(row, headers, ['meet link fixo', 'meetlinkfixo', 'meet fixo', 'meet', 'link meet', 'linkmeet', 'linkMeet', 'link_meet']) || '';
  var codigo        = col(row, headers, ['codigo', 'código', 'code', 'turma_code', 'cod']) || '';
  var notebook      = col(row, headers, ['caderno da turma', 'caderno turma', 'class notebook', 'classnotebook', 'caderno', 'notebook', 'link caderno']) || '';
  var teacherGuide  = col(row, headers, ["teacher's guide", 'teacher guide', 'guia professor', 'guia do professor', 'teacherguide', 'teacher_guide', 'guia']) || '';
  var schoolCalendar= col(row, headers, ['school calendar', 'schoolcalendar', 'calendario', 'calendário', 'calendar', 'link calendario', 'linkCalendario']) || '';
  var syllabus      = col(row, headers, ['syllabus', 'silabo', 'ementa', 'plano de aula']) || '';
  var gravacoes     = col(row, headers, ['gravacoes', 'gravações', 'recordings', 'linkGravacoes', 'link gravacoes']) || '';
  // Try to get next topic from the school calendar Google Doc
  var nextTopic     = getNextTopicFromCalendar(schoolCalendar);
  // Students lookup: code-first, then name
  var alunos        = getAlunosByTurma(ss, codigo || tName);

  return {
    turma: tName, horario: horario, meetLink: meetLink, codigo: codigo,
    notebook: notebook, teacherGuide: teacherGuide, schoolCalendar: schoolCalendar,
    syllabus: syllabus, linkGravacoes: gravacoes, nextTopic: nextTopic,
    alunos: alunos,
  };
}


// ── HELPER: read next session topic from the school calendar Doc ──
// The school calendar is a Google Doc. We open it by URL, extract all
// paragraphs, and find the one closest to today's date.
//
// DOCUMENT FORMAT expected (each session is a heading or paragraph like):
//   "Aula 8 — 09 Jun 2026 — The Subtext Game: Reading the Air"
//   OR two separate lines: date line + topic line.
//
// If the document format is different, adjust the parsing below.
function getNextTopicFromCalendar(calendarUrl) {
  if (!calendarUrl) return '';
  try {
    var docId = extractGoogleDocId(calendarUrl);
    if (!docId) return '';
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();
    var text = body.getText();

    // Split into lines, filter empty
    var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var bestLine = '';
    var bestDate = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // Try to parse a date from the line (supports "09 Jun 2026", "Jun 9, 2026", "2026-06-09")
      var parsed = parseDateFromLine(line);
      if (!parsed) continue;
      // We want the NEXT session: closest date >= today
      if (parsed >= today) {
        if (!bestDate || parsed < bestDate) {
          bestDate = parsed;
          // The topic is often on the same line after a dash, or on the next line
          var topic = extractTopicFromLine(line);
          if (!topic && lines[i + 1]) topic = lines[i + 1];
          bestLine = topic || line;
        }
      }
    }

    return bestLine;
  } catch (e) {
    Logger.log('getNextTopicFromCalendar error: ' + e);
    return '';
  }
}

function extractGoogleDocId(url) {
  // Handles: /d/ID/edit, /d/ID/, spreadsheets/d/ID, etc.
  var m = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
  return m ? m[1] : '';
}

function parseDateFromLine(line) {
  // Try ISO: 2026-06-09
  var iso = line.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2]-1, +iso[3]);
  // Try "09 Jun 2026" or "9 Jun 2026"
  var mdy = line.match(/(\d{1,2})\s+(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
  if (mdy) {
    var months = {jan:0,fev:1,feb:1,mar:2,abr:3,apr:3,mai:4,may:4,jun:5,jul:6,ago:7,aug:7,set:8,sep:8,oct:9,out:9,nov:10,dez:11,dec:11};
    var mo = months[(mdy[2]||'').toLowerCase().substring(0,3)];
    if (mo !== undefined) return new Date(+mdy[3], mo, +mdy[1]);
  }
  // Try "Jun 9, 2026"
  var mdy2 = line.match(/(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (mdy2) {
    var months2 = {jan:0,fev:1,feb:1,mar:2,abr:3,apr:3,mai:4,may:4,jun:5,jul:6,ago:7,aug:7,set:8,sep:8,oct:9,out:9,nov:10,dez:11,dec:11};
    var mo2 = months2[(mdy2[1]||'').toLowerCase().substring(0,3)];
    if (mo2 !== undefined) return new Date(+mdy2[3], mo2, +mdy2[2]);
  }
  return null;
}

function extractTopicFromLine(line) {
  // Remove date portion and "Aula N — " prefix, return what's left as the topic
  // E.g. "Aula 8 — 09 Jun 2026 — The Subtext Game" → "The Subtext Game"
  var cleaned = line
    .replace(/Aula\s+\d+\s*[—–-]\s*/gi, '')
    .replace(/\d{1,2}\s+(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*[—–-]?\s*/gi, '')
    .replace(/\d{4}-\d{2}-\d{2}\s*[—–-]?\s*/g, '')
    .trim();
  return cleaned.length > 3 ? cleaned : '';
}


// ── REPLACE the existing getTurmaSchedules function ─────────────
// For professor login — finds all turmas for this professor.
// Step 1: gets their turma list from the PROFESSOR PROFILE section (top of sheet).
// Step 2: looks up each turma in the TURMA SCHEDULE section (bottom of sheet).
function getTurmaSchedules(ss, profName) {
  var profLower = (profName || '').toLowerCase().trim();
  var profFirst = profLower.split(' ')[0];

  // ── Step 1: find professor's turma list from the top section ──
  var profSection = getProfSection(ss);
  var profTurmas = [];

  if (profSection) {
    var ph = profSection.headers;
    for (var i = 0; i < profSection.rows.length; i++) {
      var pRow = profSection.rows[i];
      var rowProf = (col(pRow, ph, ['nome', 'name', 'professor', 'prof']) || '').toLowerCase().trim();
      if (!rowProf) continue;
      var rowFirst = rowProf.split(' ')[0];
      // Flexible name match
      var match = profLower === rowProf
               || profLower.indexOf(rowProf) >= 0
               || rowProf.indexOf(profFirst) >= 0
               || profFirst === rowFirst;
      if (!match) continue;
      // "Turmas (separadas por vírgula)" column
      var turmasStr = col(pRow, ph, ['turmas', 'turma', 'class', 'grupo']) || '';
      turmasStr.split(',').forEach(function (t) {
        var tn = t.trim();
        if (tn && profTurmas.indexOf(tn) < 0) profTurmas.push(tn);
      });
    }
  }

  // ── Step 2: look up each turma in the schedule section ────────
  var section = getTurmaSection(ss);
  var result = [];

  profTurmas.forEach(function (tName) {
    var found = null;
    if (section) {
      var nameLower = tName.toLowerCase().trim();
      for (var j = 0; j < section.rows.length; j++) {
        var rowName = (section.rows[j][0] || '').toString().trim().toLowerCase();
        if (rowName === nameLower) { found = section.rows[j]; break; }
      }
    }
    if (found) {
      result.push(parseTurmaRow(found, section.headers, tName, ss));
    } else {
      // Turma not in schedule section yet — return basic entry
      result.push({ turma: tName, horario: '', meetLink: '', codigo: '',
                    notebook: '', teacherGuide: '', schoolCalendar: '',
                    syllabus: '', nextTopic: '', linkGravacoes: '',
                    alunos: getAlunosByTurma(ss, tName) });
    }
  });

  return result;
}


// ── HELPER: enrich student data with turma schedule details ─────
// Reads the TURMA SCHEDULE section of "2. Professores" by code or name.
// Returns:
//   linkAtividades  = student's own caderno from "1. Alunos" → "My Activities"
//   linkCaderno     = shared class notebook → "Class Notebook"
//   meetLink        = "Meet Link fixo"
//   teacherGuide, schoolCalendar, nextTopic, syllabus, horario, prof, linkGravacoes
function enrichAlunoData(ss, alunoRow, alunoHeaders) {
  // Student's individual caderno from "1. Alunos" → "My Activities"
  var linkAtividades = col(alunoRow, alunoHeaders,
    ['caderno', 'notebook', 'link caderno', 'linkCaderno', 'atividades', 'link atividades', 'linkAtividades']) || '';
  var horario  = col(alunoRow, alunoHeaders, ['horario', 'horário', 'schedule', 'hora']) || '';
  var gravacoes= col(alunoRow, alunoHeaders, ['gravacoes', 'gravações', 'recordings', 'linkGravacoes']) || '';
  var prof     = col(alunoRow, alunoHeaders, ['professor', 'prof', 'teacher', 'nome professor']) || '';

  // Find turma row: priority code → name
  var turmaCode = col(alunoRow, alunoHeaders, ['codigo', 'código', 'code', 'turma_code', 'cod']) || '';
  var firstCode = turmaCode.split(/[,;]/)[0].trim();
  var found = firstCode ? getTurmaByCode(ss, firstCode) : null;

  if (!found) {
    var turmaName = col(alunoRow, alunoHeaders, ['turma', 'turmas', 'class', 'grupo', 'group']) || '';
    found = turmaName ? getTurmaByName(ss, turmaName) : null;
  }

  if (!found) {
    return {
      meetLink: '', horario: horario, linkAtividades: linkAtividades, linkCaderno: '',
      linkGravacoes: gravacoes, prof: prof,
      teacherGuide: '', schoolCalendar: '', nextTopic: '', syllabus: '',
    };
  }

  var row = found.row, h = found.headers;
  var meetLink  = col(row, h, ['meet link fixo', 'meetlinkfixo', 'meet fixo', 'meet', 'link meet', 'linkmeet', 'linkMeet']) || '';
  horario       = horario || col(row, h, ['horario', 'horário', 'schedule', 'dia', 'day', 'hora']) || '';
  var linkCaderno   = col(row, h, ['caderno da turma', 'caderno turma', 'class notebook', 'caderno', 'notebook', 'link caderno']) || '';
  gravacoes         = gravacoes || col(row, h, ['gravacoes', 'gravações', 'recordings', 'linkGravacoes']) || '';
  prof              = prof || col(row, h, ['professor', 'prof', 'teacher', 'nome']) || '';
  var teacherGuide  = col(row, h, ["teacher's guide", 'teacher guide', 'guia professor', 'guia do professor', 'teacherguide', 'teacher_guide', 'guia']) || '';
  var schoolCalendar= col(row, h, ['school calendar', 'schoolcalendar', 'calendario', 'calendário', 'calendar', 'link calendario']) || '';
  var syllabus      = col(row, h, ['syllabus', 'silabo', 'ementa', 'plano de aula']) || '';
  var nextTopic     = getNextTopicFromCalendar(schoolCalendar);

  return {
    meetLink:       meetLink,
    horario:        horario,
    linkAtividades: linkAtividades,   // student's own → "My Activities"
    linkCaderno:    linkCaderno,      // class shared  → "Class Notebook"
    linkGravacoes:  gravacoes,
    prof:           prof,
    teacherGuide:   teacherGuide,
    schoolCalendar: schoolCalendar,
    nextTopic:      nextTopic,
    syllabus:       syllabus,
  };
}


// ── Helper: fetch alunos for a specific turma ────────────────────
// Combines CODE match + NAME match so students without a code still appear.
// Students in 2 turmas: add both codes comma-separated in the Código column.
function getAlunosByTurma(ss, turmaRef) {
  var sheet = ss.getSheetByName('1. Alunos');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return [];
  var headers = data[1];
  var refLower = (turmaRef || '').toString().trim().toLowerCase();
  var seen = {}, alunos = [];

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var nome = col(row, headers, ['nome', 'name', 'aluno', 'student']) || '';
    if (!nome) continue;
    nome = nome.trim();

    // Code match: student may have multiple codes (comma/semicolon separated)
    var cod  = col(row, headers, ['codigo', 'código', 'code', 'cod']) || '';
    var codes = cod.split(/[,;]/).map(function (c) { return c.trim().toLowerCase(); });
    var byCode = codes.indexOf(refLower) >= 0;

    // Name match: for students without code
    var turma = col(row, headers, ['turma', 'turmas', 'class', 'grupo']) || '';
    var byName = turma.trim().toLowerCase() === refLower;

    if ((byCode || byName) && !seen[nome]) {
      seen[nome] = true;
      alunos.push(nome);
    }
  }
  return alunos;
}


// ── HOW TO UPDATE doGet — student login block ────────────────────
// Replace your existing student return with:
//
//   var aluno = findAluno(ss, email);
//   if (!aluno) return json({ error: 'user not found' });
//   var turmaInfo = enrichAlunoData(ss, alunoRow, alunoHeaders);
//   // NOTE: alunoRow and alunoHeaders come from findAluno internals.
//   // If findAluno only returns a plain object, pass it as the row:
//   //   var turmaInfo = enrichAlunoData(ss, /* aluno row array */, /* aluno headers array */);
//
//   return json({
//     ok: true,
//     role:           role,
//     nome:           aluno.nome,
//     email:          aluno.email,
//     turma:          aluno.turma,
//     nivel:          aluno.nivel,
//     professor:      aluno.professor     || turmaInfo.prof,
//     horario:        aluno.horario       || turmaInfo.horario,
//     meetLink:       aluno.meetLink      || turmaInfo.meetLink,
//     linkAtividades: aluno.linkCaderno   || turmaInfo.linkAtividades,  // student's own → "My Activities"
//     linkCaderno:    turmaInfo.linkCaderno,                            // class shared  → "Class Notebook"
//     linkGravacoes:  aluno.linkGravacoes || turmaInfo.linkGravacoes,
//     teacherGuide:   turmaInfo.teacherGuide,
//     schoolCalendar: turmaInfo.schoolCalendar,
//     nextTopic:      turmaInfo.nextTopic,
//     syllabus:       turmaInfo.syllabus,
//     ativa:          aluno.ativa,
//     bookClub:       aluno.bookClub,
//     temParticular:  aluno.temParticular,
//     profParticular: aluno.profParticular,
//     conteudoLiberado: onboarding ? onboarding.liberado : true,
//     onboardingData: onboarding,
//     atividades:     getAtividades(ss),
//     bookClubs:      getBookClubs(ss),
//     ciclo:          getCiclo(ss),
//     recados:        getRecados(ss, role),
//   });
//
// ── HOW TO UPDATE doGet — professor login block ──────────────────
// The professor login already calls getTurmaSchedules(ss, prof.nome).
// No signature change needed — it now reads both sections correctly.


// ── REPLACE the existing findImersao function ────────────────────
function findImersao(ss, email) {
  var rows = getRows(ss, '14. Imersão');
  if (!rows || rows.length < 3) return null;
  var headers = rows[1];

  for (var i = 2; i < rows.length; i++) {
    var row = rows[i];
    var rowEmail = col(row, headers, ['email', 'e-mail', 'mail']) || '';
    if (rowEmail.toLowerCase().trim() !== email.toLowerCase().trim()) continue;

    var nome        = col(row, headers, ['nome', 'name', 'aluno']) || '';
    var edicao      = col(row, headers, ['edicao', 'edição', 'edition', 'ciclo', 'turma']) || '';
    var linkMeet    = col(row, headers, ['meet', 'link meet', 'linkmeet', 'linkMeet']) || '';
    var linkCaderno = col(row, headers, ['caderno', 'notebook', 'link caderno', 'linkCaderno']) || '';
    var orderBump   = col(row, headers, ['order bump', 'orderbump', 'orderBump', 'gravacoes', 'gravaçoes', 'pacote']) || 'nao';
    var linkGravacoes = col(row, headers, ['link gravacoes', 'linkGravacoes', 'gravacoes link', 'recording']) || '';
    var linkStripe  = col(row, headers, ['stripe', 'link stripe', 'linkStripe', 'pagamento']) || '';
    var dia1        = col(row, headers, ['dia1', 'dia 1', 'session1', 'data1', 'data 1']) || '2026-07-06';
    var dia2        = col(row, headers, ['dia2', 'dia 2', 'session2', 'data2', 'data 2']) || '2026-07-08';
    var dia3        = col(row, headers, ['dia3', 'dia 3', 'session3', 'data3', 'data 3']) || '2026-07-09';
    var hora        = col(row, headers, ['hora', 'horario', 'horário', 'time', 'hour']) || '19:30';

    var imersaoData = {
      edicao: edicao, linkMeet: linkMeet, linkCaderno: linkCaderno,
      orderBump: orderBump, linkGravacoes: linkGravacoes, linkStripe: linkStripe,
      dia1: dia1, dia2: dia2, dia3: dia3, hora: hora,
    };

    return {
      ok: true, role: 'imersao', nome: nome, email: email,
      edicao: edicao, linkMeet: linkMeet, linkCaderno: linkCaderno,
      orderBump: orderBump, linkGravacoes: linkGravacoes, linkStripe: linkStripe,
      dia1: dia1, dia2: dia2, dia3: dia3, hora: hora,
      appData: { imersao: imersaoData },
    };
  }
  return null;
}


// ── NEW FUNCTION: saveInterest ───────────────────────────────────
function saveInterest(ss, params) {
  var sheetName = 'Leads';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['Nome', 'Email', 'Nota / Horário', 'Origem', 'Data']);
  }
  var nome      = params.nome      || '';
  var email     = params.email     || '';
  var nota      = params.nota      || '';
  var source    = params.source    || '';
  var createdAt = params.createdAt || new Date().toISOString();

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === email && data[i][3] === source) {
      sheet.getRange(i + 1, 5).setValue(createdAt);
      return { ok: true, updated: true };
    }
  }
  sheet.appendRow([nome, email, nota, source, createdAt]);
  return { ok: true, saved: true };
}


// ── NEW FUNCTION: getPublicData ───────────────────────────────────
function getPublicData(ss) {
  return {
    ok: true,
    atividades: getAtividades(ss),
    bookClubs:  getBookClubs(ss),
    ciclo:      getCiclo(ss),
    recados:    getRecados(ss),
  };
}


// ── ROUTING: add inside doGet's action switch ────────────────────
// else if (action === 'saveInterest') {
//   return json(saveInterest(ss, e.parameter));
// }
// else if (action === 'getPublicData') {
//   return json(getPublicData(ss));
// }
