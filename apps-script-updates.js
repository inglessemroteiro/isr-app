// ════════════════════════════════════════════════════════════════
// ISR Apps Script — UPDATED FUNCTIONS (paste into your script)
// Changes vs previous version:
//   1. getTurmaSchedules — bidirectional professor name match + returns alunos[]
//   2. doGet (aluno section) — meet link fallback from professor turma schedule
//   3. saveInterest — new function for cycle lead capture
//   4. saveInterest wired into doGet action routing
// ════════════════════════════════════════════════════════════════

// ── REPLACE the existing getTurmaSchedules function ─────────────
function getTurmaSchedules(ss, profName) {
  var sheet = ss.getSheetByName('2. Professores');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 3) return [];

  var headers = data[1]; // row index 1 = header row
  var profLower = profName.toLowerCase();
  var profFirst = profLower.split(' ')[0]; // "gabriela" or "gabi" etc.

  var result = [];

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var rowProf = col(row, headers, ['professor', 'prof', 'teacher', 'nome', 'name']) || '';
    var rowProfLower = rowProf.toLowerCase().trim();
    if (!rowProfLower) continue;

    // Bidirectional fuzzy match:
    //   "gabriela souza" contains "gabi" → match
    //   "gabi" contains first token of "gabriela souza" → match
    //   exact match → match
    var rowFirst = rowProfLower.split(' ')[0];
    var match = profLower === rowProfLower
             || profLower.indexOf(rowProfLower) >= 0
             || rowProfLower.indexOf(profFirst) >= 0
             || profFirst.indexOf(rowFirst) >= 0;

    if (!match) continue;

    var turma   = col(row, headers, ['turma', 'class', 'grupo', 'group', 'turmas']) || '';
    if (!turma) continue;
    var horario = col(row, headers, ['horario', 'horário', 'schedule', 'dia', 'day', 'hora']) || '';
    var meetLink = col(row, headers, ['meet', 'link meet', 'meet link', 'linkmeet', 'linkMeet', 'link_meet']) || '';

    // Fetch students for this turma from "1. Alunos"
    var alunos = getAlunosByTurma(ss, turma);

    result.push({
      turma:    turma,
      horario:  horario,
      meetLink: meetLink,
      alunos:   alunos
    });
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

// ── REPLACE the aluno section inside doGet ───────────────────────
// Find the block that handles `action === 'aluno'` (or the aluno
// branch inside findAluno) and replace the meet link section with:
//
//   var linkMeet = col(alunoRow, headers, ['meet','link meet','linkmeet','linkMeet']) || '';
//   // Fallback: look up meet link from professor's turma schedule
//   if (!linkMeet) {
//     var alTurma = col(alunoRow, headers, ['turma','turmas','class','grupo']) || '';
//     if (alTurma) {
//       var profSheet = ss.getSheetByName('2. Professores');
//       if (profSheet) {
//         var pd = profSheet.getDataRange().getValues();
//         var ph = pd[1];
//         for (var pi = 2; pi < pd.length; pi++) {
//           var pTurma = col(pd[pi], ph, ['turma','class','grupo','turmas']) || '';
//           if (pTurma.trim() === alTurma.trim()) {
//             linkMeet = col(pd[pi], ph, ['meet','link meet','linkmeet','linkMeet']) || '';
//             if (linkMeet) break;
//           }
//         }
//       }
//     }
//   }
//
// (The exact variable names depend on what your current findAluno returns;
//  the key is: after resolving the aluno row, check linkMeet and fall back to prof sheet)

// ── NEW FUNCTION: saveInterest ───────────────────────────────────
// Add this function to your Apps Script, then add the routing line
// inside doGet: else if (action === 'saveInterest') { return json(saveInterest(ss, e.parameter)); }
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

  // Deduplicate: if same email + source already exists, just update timestamp
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === email && data[i][3] === source) {
      sheet.getRange(i + 1, 5).setValue(createdAt); // update date
      return { ok: true, updated: true };
    }
  }

  sheet.appendRow([nome, email, nota, source, createdAt]);
  return { ok: true, saved: true };
}

// ── ROUTING: add inside doGet's action switch ────────────────────
// Find the section in doGet that routes by `action` and add:
//
//   else if (action === 'saveInterest') {
//     return json(saveInterest(ss, e.parameter));
//   }
//   else if (action === 'getPublicData') {
//     return json(getPublicData(ss));
//   }

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
      ok: true,
      role: 'imersao',
      nome: nome,
      email: email,
      // Flat (top-level) — consumed by frontend fallback u.* path
      edicao: edicao, linkMeet: linkMeet, linkCaderno: linkCaderno,
      orderBump: orderBump, linkGravacoes: linkGravacoes, linkStripe: linkStripe,
      dia1: dia1, dia2: dia2, dia3: dia3, hora: hora,
      // Nested — consumed by u.appData.imersao path
      appData: { imersao: imersaoData },
    };
  }
  return null; // not found
}

// ── NEW FUNCTION: getPublicData ───────────────────────────────────
// Returns public-facing data (activities, events, book clubs, cycle info)
// without requiring login — used by the frontend for the public landing.
function getPublicData(ss) {
  return {
    ok: true,
    atividades: getAtividades(ss),
    bookClubs:  getBookClubs(ss),
    ciclo:      getCiclo(ss),
    recados:    getRecados(ss),
  };
}
