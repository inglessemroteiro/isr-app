// ════════════════════════════════════════════════════════════════
// ISR — PESQUISA DE HORÁRIOS (backend)
//
// Guarda, numa planilha do Google, as pesquisas de disponibilidade e
// as respostas das alunas. A página horarios.html (no site) conversa
// com este script. O e-mail para a turma sai da conta Google de quem
// publicou o script.
//
// COMO INSTALAR (uma vez só):
//   1. Crie uma planilha nova no Drive (ex. "ISR — Pesquisa de horários").
//   2. Extensões → Apps Script → apague o conteúdo e cole este arquivo.
//   3. Troque o valor de PIN_ADMIN abaixo por uma senha sua.
//   4. Implantar → Nova implantação → tipo "App da Web"
//        · Executar como: você
//        · Quem pode acessar: Qualquer pessoa
//   5. Copie a URL (…/exec) e cole em horarios.html, na linha
//      BACKEND_PADRAO. Publique o site.
//
// Para atualizar o script depois: Implantar → Gerenciar implantações →
// editar → versão "Nova" → Implantar. A URL não muda.
// ════════════════════════════════════════════════════════════════

var PIN_ADMIN = "TROQUE-ESTA-SENHA";   // senha da área da professora
var VERSAO = "2026.10.07";
var ABA_PESQ = "Pesquisas";
var ABA_RESP = "Respostas";
var REMETENTE = "Inglês sem Roteiro";

var CAB_PESQ = ["id", "titulo", "modo", "inicio", "fim", "atualizadoEm", "json"];
var CAB_RESP = ["pesquisa", "chave", "nome", "email", "fuso", "atualizadoEm", "json"];

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || "";
  try {
    if (action === "pesquisa") return json_(pesquisa_(p.p));
    if (action === "lista") { exigirPin_(p.pin); return json_({ ok: true, pesquisas: lista_() }); }
    return json_({ ok: true, servico: "ISR Pesquisa de horários", versao: VERSAO,
      pinConfigurado: PIN_ADMIN !== "TROQUE-ESTA-SENHA" });
  } catch (err) { return json_({ ok: false, error: msg_(err) }); }
}

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (x) {}
    var action = body.action || "";
    if (action === "salvarResposta") return json_(salvarResposta_(body));
    if (action === "salvarPesquisa") { exigirPin_(body.pin); return json_(salvarPesquisa_(body.pesquisa || {})); }
    if (action === "removerResposta") { exigirPin_(body.pin); return json_(removerResposta_(body.p, body.chave)); }
    if (action === "removerPesquisa") { exigirPin_(body.pin); return json_(removerPesquisa_(body.p)); }
    if (action === "enviarEmail") { exigirPin_(body.pin); return json_(enviarEmail_(body)); }
    if (action === "conferirPin") { exigirPin_(body.pin); return json_({ ok: true }); }
    return json_({ ok: false, error: "ação desconhecida" });
  } catch (err) { return json_({ ok: false, error: msg_(err) }); }
}

// ── leitura ──────────────────────────────────────────────────────
function pesquisa_(id) {
  id = limparId_(id);
  if (!id) return { ok: false, error: "pesquisa não informada" };
  var pesq = acharPesquisa_(id);
  if (!pesq) return { ok: false, error: "pesquisa não encontrada" };
  return { ok: true, pesquisa: pesq, respostas: respostasDe_(id) };
}

function lista_() {
  var linhas = linhas_(aba_(ABA_PESQ, CAB_PESQ));
  var out = [];
  for (var i = 0; i < linhas.length; i++) {
    var p = parse_(linhas[i][6]);
    if (!p) continue;
    p.respostas = respostasDe_(p.id).length;
    out.push(p);
  }
  out.sort(function (a, b) { return (b.atualizadoEm || "") < (a.atualizadoEm || "") ? -1 : 1; });
  return out;
}

function acharPesquisa_(id) {
  var linhas = linhas_(aba_(ABA_PESQ, CAB_PESQ));
  for (var i = 0; i < linhas.length; i++) if (String(linhas[i][0]) === id) return parse_(linhas[i][6]);
  return null;
}

function respostasDe_(id) {
  var linhas = linhas_(aba_(ABA_RESP, CAB_RESP));
  var out = [];
  for (var i = 0; i < linhas.length; i++) {
    if (String(linhas[i][0]) !== id) continue;
    var r = parse_(linhas[i][6]);
    if (r) out.push(r);
  }
  return out;
}

// ── escrita ──────────────────────────────────────────────────────
function salvarPesquisa_(p) {
  var id = limparId_(p.id) || novoId_();
  var titulo = String(p.titulo || "").trim().slice(0, 200);
  if (!titulo) throw new Error("título obrigatório");
  var modo = p.modo === "semanal" ? "semanal" : "datas";
  if (!data_(p.inicio) || !data_(p.fim)) throw new Error("informe o primeiro e o último dia");
  if (p.fim < p.inicio) throw new Error("o último dia vem antes do primeiro");
  var horaIni = Math.min(23, Math.max(0, parseInt(p.horaIni, 10) || 0));
  var horaFim = Math.min(24, Math.max(horaIni + 1, parseInt(p.horaFim, 10) || 24));
  var bloco = parseInt(p.bloco, 10) === 30 ? 30 : 60;
  var fuso = String(p.fuso || "America/Sao_Paulo").slice(0, 80);
  var pesq = { id: id, titulo: titulo, descricao: String(p.descricao || "").slice(0, 4000), modo: modo,
    inicio: p.inicio, fim: p.fim, horaIni: horaIni, horaFim: horaFim, bloco: bloco, fuso: fuso,
    aberta: p.aberta === false ? false : true, atualizadoEm: new Date().toISOString() };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = aba_(ABA_PESQ, CAB_PESQ);
    var linha = [pesq.id, pesq.titulo, pesq.modo, pesq.inicio, pesq.fim, pesq.atualizadoEm, JSON.stringify(pesq)];
    var idx = acharLinha_(sh, 1, id);
    if (idx) sh.getRange(idx, 1, 1, linha.length).setValues([linha]); else sh.appendRow(linha);
  } finally { lock.releaseLock(); }
  return { ok: true, pesquisa: pesq };
}

function salvarResposta_(b) {
  var id = limparId_(b.p);
  var pesq = id && acharPesquisa_(id);
  if (!pesq) throw new Error("pesquisa não encontrada");
  if (pesq.aberta === false) throw new Error("esta pesquisa está encerrada");
  var nome = String(b.nome || "").trim().slice(0, 120);
  var email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  if (!nome) throw new Error("nome obrigatório");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("e-mail inválido");
  var fuso = String(b.fuso || "").slice(0, 80);
  if (!fuso) throw new Error("fuso horário obrigatório");
  var chave = email.replace(/[^a-z0-9_\-.~:@+]/g, "_");
  var livre = listaCurta_(b.livre), talvez = listaCurta_(b.talvez);
  var r = { chave: chave, nome: nome, email: email, fuso: fuso, modo: pesq.modo,
    livre: livre, talvez: talvez, atualizadoEm: new Date().toISOString() };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = aba_(ABA_RESP, CAB_RESP);
    var linha = [id, chave, nome, email, fuso, r.atualizadoEm, JSON.stringify(r)];
    var idx = acharLinha2_(sh, id, chave);
    if (idx) sh.getRange(idx, 1, 1, linha.length).setValues([linha]); else sh.appendRow(linha);
  } finally { lock.releaseLock(); }
  return { ok: true, resposta: r };
}

function removerResposta_(p, chave) {
  var id = limparId_(p); chave = String(chave || "");
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = aba_(ABA_RESP, CAB_RESP);
    var idx = acharLinha2_(sh, id, chave);
    if (!idx) return { ok: false, error: "resposta não encontrada" };
    sh.deleteRow(idx);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function removerPesquisa_(p) {
  var id = limparId_(p);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = aba_(ABA_PESQ, CAB_PESQ);
    var idx = acharLinha_(sh, 1, id);
    if (!idx) return { ok: false, error: "pesquisa não encontrada" };
    sh.deleteRow(idx);
    var sr = aba_(ABA_RESP, CAB_RESP);
    var vals = sr.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) if (String(vals[i][0]) === id) sr.deleteRow(i + 1);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function enviarEmail_(b) {
  var id = limparId_(b.p);
  var pesq = id && acharPesquisa_(id);
  if (!pesq) throw new Error("pesquisa não encontrada");
  var assunto = String(b.assunto || "").trim();
  var corpo = String(b.corpo || "");
  if (!assunto) throw new Error("assunto obrigatório");
  var resp = respostasDe_(id), emails = [], visto = {};
  for (var i = 0; i < resp.length; i++) {
    var em = String(resp[i].email || "").toLowerCase();
    if (em && !visto[em]) { visto[em] = 1; emails.push(em); }
  }
  if (!emails.length) throw new Error("nenhuma participante com e-mail");
  var cota = MailApp.getRemainingDailyQuota();
  if (cota < 1) throw new Error("a cota diária de e-mails da conta acabou; tente amanhã");
  var proprio = Session.getEffectiveUser().getEmail();
  var opts = { subject: assunto, body: corpo, name: REMETENTE };
  if (b.cco === false) { opts.to = emails.join(","); }
  else { opts.to = String(b.para || proprio || emails[0]); opts.bcc = emails.join(","); }
  MailApp.sendEmail(opts);
  return { ok: true, enviados: emails.length, de: proprio };
}

// ── apoio ────────────────────────────────────────────────────────
function exigirPin_(pin) {
  if (PIN_ADMIN === "TROQUE-ESTA-SENHA") throw new Error("defina PIN_ADMIN no script antes de usar a administração");
  if (String(pin || "") !== PIN_ADMIN) throw new Error("senha incorreta");
}
function aba_(nome, cab) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nome);
  if (!sh) { sh = ss.insertSheet(nome); sh.appendRow(cab); sh.setFrozenRows(1); }
  return sh;
}
function linhas_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}
function acharLinha_(sh, col, valor) {
  var vals = linhas_(sh);
  for (var i = 0; i < vals.length; i++) if (String(vals[i][col - 1]) === String(valor)) return i + 2;
  return 0;
}
function acharLinha2_(sh, a, b) {
  var vals = linhas_(sh);
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(a) && String(vals[i][1]) === String(b)) return i + 2;
  return 0;
}
function parse_(s) { try { var o = JSON.parse(s); return o && typeof o === "object" ? o : null; } catch (e) { return null; } }
function limparId_(id) { return String(id || "").replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase(); }
function novoId_() {
  var s = "", a = "abcdefghjkmnpqrstuvwxyz23456789";
  for (var i = 0; i < 7; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}
function data_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function listaCurta_(a) {
  if (!Array.isArray(a)) return [];
  var out = [];
  for (var i = 0; i < a.length && out.length < 5000; i++) {
    var v = a[i];
    if (typeof v === "number" && isFinite(v)) out.push(v);
    else if (typeof v === "string" && /^[0-9-]{1,12}$/.test(v)) out.push(v);
  }
  return out;
}
function msg_(err) { return String(err && err.message || err); }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
