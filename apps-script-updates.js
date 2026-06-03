// ════════════════════════════════════════════════════════════════
// ISR Apps Script — UPDATED FUNCTIONS  (paste into your script)
// Changes in this version:
//   1. getTurmaByCode  — look up turma by exact code (RECOMMENDED approach)
//   2. enrichAlunoData — adds meetLink/horario/caderno to student login response
//      by looking up their turma in "2. Professores"
//   3. getTurmaSchedules — kept for professor login (bidirectional name match)
//   4. findImersao — returns flat + nested appData.imersao
//   5. saveInterest — saves leads to "Leads" sheet
//   6. getPublicData — public data without login
//
// ── HOW TO ADOPT TURMA CODES ────────────────────────────────────
//   1. Add a column "Código" (or "codigo", "code", "turma_code") to
//      BOTH "1. Alunos" AND "2. Professores" sheets.
//   2. Give each group a short code (e.g. B1-SEG, A2-QUA, A1-TER).
//   3. The student row has the code of THEIR group.
//   4. The professor row has the code of THEIR group.
//   5. enrichAlunoData() will match them by code (exact, reliable).
//   Until you add codes the function falls back to turma-name matching.
// ════════════════════════════════════════════════════════════════


// ── HELPER: look up a turma row by exact code ────────────────────
// Returns the professor sheet row (as an array) and the header row,
// or null if not found.
function getTurmaByCode(ss, code) {
  if (!code) return null;
  var sheet = ss.getSheetByName('2. Professores');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return null;
  var headers = data[1];

  var codeNorm = code.toString().trim().toLowerCase();
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var rowCode = col(row, headers, ['codigo', 'código', 'code', 'turma_code', 'cod']) || '';
    if (rowCode.toString().trim().toLowerCase() === codeNorm) {
      return { row: row, headers: headers };
    }
  }
  return null;
}


// ── HELPER: enrich student data with turma schedule details ─────
// Call this after resolving the aluno row. Pass the student row,
// its headers, and the spreadsheet. Returns an object with
// meetLink, horario, linkCaderno, prof, etc.
//
// Matching priority:
//   1. "codigo"/"code" column in "1. Alunos" → exact match in "2. Professores"
//   2. "turma" column in "1. Alunos"         → name match in "2. Professores"
//   3. Fields already in the aluno row       → used directly
function enrichAlunoData(ss, alunoRow, alunoHeaders) {
  // Fields that might already exist directly on the aluno row
  var meetLink  = col(alunoRow, alunoHeaders, ['meet', 'link meet', 'linkmeet', 'linkMeet', 'link_meet']) || '';
  var horario   = col(alunoRow, alunoHeaders, ['horario', 'horário', 'schedule', 'hora']) || '';
  var caderno   = col(alunoRow, alunoHeaders, ['caderno', 'notebook', 'link caderno', 'linkCaderno']) || '';
  var cadernoInd= col(alunoRow, alunoHeaders, ['caderno individual', 'meu caderno', 'linkCadernoIndividual', 'individual_notebook']) || '';
  var gravacoes = col(alunoRow, alunoHeaders, ['gravacoes', 'gravações', 'recordings', 'linkGravacoes']) || '';
  var prof      = col(alunoRow, alunoHeaders, ['professor', 'prof', 'teacher', 'nome professor']) || '';

  // Already have everything? Return early
  if (meetLink && horario) {
    return { meetLink: meetLink, horario: horario, linkCaderno: caderno,
             linkCadernoIndividual: cadernoInd, linkGravacoes: gravacoes, prof: prof };
  }

  // Try to find the turma row in "2. Professores"
  var turmaRow    = null;
  var turmaHeaders= null;

  // Priority 1: look up by turma code
  var turmaCode = col(alunoRow, alunoHeaders, ['codigo', 'código', 'code', 'turma_code', 'cod']) || '';
  if (turmaCode) {
    var found = getTurmaByCode(ss, turmaCode);
    if (found) { turmaRow = found.row; turmaHeaders = found.headers; }
  }

  // Priority 2: look up by turma name
  if (!turmaRow) {
    var turmaName = col(alunoRow, alunoHeaders, ['turma', 'turmas', 'class', 'grupo', 'group']) || '';
    if (turmaName) {
      var sheet = ss.getSheetByName('2. Professores');
      if (sheet) {
        var data = sheet.getDataRange().getValues();
        if (data.length >= 3) {
          turmaHeaders = data[1];
          var nameLower = turmaName.toLowerCase().trim();
          for (var i = 2; i < data.length; i++) {
            var rName = col(data[i], turmaHeaders, ['turma', 'class', 'grupo', 'group', 'turmas']) || '';
            if (rName.toLowerCase().trim() === nameLower) {
              turmaRow = data[i]; break;
            }
          }
        }
      }
    }
  }

  // Merge fields from turma row (only fill blanks)
  if (turmaRow && turmaHeaders) {
    meetLink  = meetLink  || col(turmaRow, turmaHeaders, ['meet', 'link meet', 'linkmeet', 'linkMeet']) || '';
    horario   = horario   || col(turmaRow, turmaHeaders, ['horario', 'horário', 'schedule', 'dia', 'day', 'hora']) || '';
    caderno   = caderno   || col(turmaRow, turmaHeaders, ['caderno', 'notebook', 'link caderno']) || '';
    gravacoes = gravacoes || col(turmaRow, turmaHeaders, ['gravacoes', 'gravações', 'recordings', 'linkGravacoes']) || '';
    prof      = prof      || col(turmaRow, turmaHeaders, ['professor', 'prof', 'teacher', 'nome']) || '';
  }

  return {
    meetLink:              meetLink,
    horario:               horario,
    linkCaderno:           caderno,
    linkCadernoIndividual: cadernoInd,
    linkGravacoes:         gravacoes,
    prof:                  prof,
  };
}


// ── REPLACE the existing getTurmaSchedules function ─────────────
// (used for professor login — finds ALL turmas for a given professor)
function getTurmaSchedules(ss, profName) {
  var sheet = ss.getSheetByName('2. Professores');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return [];

  var headers = data[1];
  var profLower = profName.toLowerCase();
  var profFirst = profLower.split(' ')[0];

  var result = [];

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var rowProf = col(row, headers, ['professor', 'prof', 'teacher', 'nome', 'name']) || '';
    var rowProfLower = rowProf.toLowerCase().trim();
    if (!rowProfLower) continue;

    var rowFirst = rowProfLower.split(' ')[0];
    var match = profLower === rowProfLower
             || profLower.indexOf(rowProfLower) >= 0
             || rowProfLower.indexOf(profFirst) >= 0
             || profFirst.indexOf(rowFirst) >= 0;
    if (!match) continue;

    var turma   = col(row, headers, ['turma', 'class', 'grupo', 'group', 'turmas']) || '';
    if (!turma) continue;
    var horario  = col(row, headers, ['horario', 'horário', 'schedule', 'dia', 'day', 'hora']) || '';
    var meetLink = col(row, headers, ['meet', 'link meet', 'linkmeet', 'linkMeet', 'link_meet']) || '';
    var codigo   = col(row, headers, ['codigo', 'código', 'code', 'turma_code', 'cod']) || '';
    var alunos   = getAlunosByTurma(ss, turma);

    result.push({ turma: turma, horario: horario, meetLink: meetLink, codigo: codigo, alunos: alunos });
  }

  return result;
}


// ── Helper: fetch alunos for a specific turma ────────────────────
function getAlunosByTurma(ss, turma) {
  var sheet = ss.getSheetByName('1. Alunos');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return [];
  var headers = data[1];
  var alunos = [];
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var t = col(row, headers, ['turma', 'turmas', 'class', 'grupo']) || '';
    if (t.trim() === turma.trim()) {
      var nome = col(row, headers, ['nome', 'name', 'aluno', 'student']) || '';
      if (nome) alunos.push(nome.trim());
    }
  }
  return alunos;
}


// ── HOW TO USE enrichAlunoData in doGet ──────────────────────────
// After you resolve the aluno row (findAluno or equivalent), call:
//
//   var turmaInfo = enrichAlunoData(ss, alunoRow, headers);
//
// Then include turmaInfo fields in the returned JSON:
//
//   return json({
//     ok: true,
//     role: 'student',
//     nome: nome,
//     email: email,
//     turma: turma,
//     nivel: nivel,
//     // schedule details ↓
//     meetLink:              turmaInfo.meetLink,
//     horario:               turmaInfo.horario,
//     linkCaderno:           turmaInfo.linkCaderno,
//     linkCadernoIndividual: turmaInfo.linkCadernoIndividual,
//     linkGravacoes:         turmaInfo.linkGravacoes,
//     prof:                  turmaInfo.prof,
//   });


// ── REPLACE the existing findImersao function ────────────────────
// Returns imersão user data with ALL fields the frontend expects,
// both at the top level AND inside appData.imersao so both code paths work.
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
