// ════════════════════════════════════════════════════════════════
// ISR — BANCO CENTRAL DO SISTEMA (aposentando as planilhas · fase 1)
//
// "O sistema faz, a planilha carimba." — Gabi
//
// Este script transforma uma planilha do Google em banco de dados
// invisível + backup legível do Sistema da Escola:
//
//   • O sistema salva TUDO aqui (pessoas, custos, modelos) — a mesma
//     base para Gabi, Érika e Carla, em qualquer aparelho.
//   • A cada salvamento, além do dado bruto, o script CARIMBA abas
//     legíveis ("Backup · Pessoas", "Backup · Custos") — se o app
//     der pau, a informação está lá, aberta e organizada.
//
// COMO INSTALAR (5 minutos, uma vez só):
//   1. Crie uma planilha nova no Drive (ex. "ISR — Banco do Sistema").
//   2. Extensões → Apps Script → cole este arquivo inteiro.
//   3. Implantar → Nova implantação → tipo "App da Web"
//        · Executar como: você
//        · Quem pode acessar: Qualquer pessoa
//   4. Copie a URL (…/exec) e cole no sistema:
//        site → gestao.html → "⚙ configurar banco central".
// ════════════════════════════════════════════════════════════════

var DB_SHEET = "_SistemaDB";      // dado bruto (não mexer)
var CHUNK = 45000;                // limite seguro por célula

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  if (action === "sistemaLoad") return json_(sistemaLoad_());
  if (action === "cadastrosPendentes") return json_(cadastrosPendentes_());
  return json_({ ok: true, servico: "ISR Banco Central", acoes: ["sistemaLoad", "cadastrosPendentes", "POST sistemaSave", "POST novoCadastro", "POST cadastroProcessado"] });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.action === "sistemaSave") return json_(sistemaSave_(body.data || {}));
    if (body.action === "novoCadastro") return json_(novoCadastro_(body.data || {}));
    if (body.action === "cadastroProcessado") return json_(cadastroProcessado_(body.id));
    return json_({ ok: false, error: "ação desconhecida" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ── CADASTRO ONLINE (link público → CRM) ─────────────────────────
// A pessoa preenche cadastro.html no celular dela; cai na aba
// "Cadastros recebidos" e o sistema puxa e cria o lead sozinho.
var CAD_SHEET = "Cadastros recebidos";
var CAD_HEAD = ["ID", "Recebido em", "Nome", "WhatsApp", "E-mail", "Turma de interesse", "Sinal", "Comprovante", "Processado"];

function cadSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CAD_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CAD_SHEET);
    sh.getRange(1, 1, 1, CAD_HEAD.length).setValues([CAD_HEAD]).setFontWeight("bold");
  }
  return sh;
}

function novoCadastro_(d) {
  if (!d.nome || !d.whatsapp) return { ok: false, error: "nome e WhatsApp são obrigatórios" };
  var sh = cadSheet_();
  var id = "cad" + new Date().getTime();
  sh.appendRow([id, new Date().toISOString(), String(d.nome), String(d.whatsapp),
    String(d.email || ""), String(d.turmaInteresse || ""), String(d.sinal || ""),
    String(d.comprovante || ""), ""]);
  return { ok: true, id: id };
}

function cadastrosPendentes_() {
  var sh = cadSheet_();
  var vals = sh.getDataRange().getValues();
  var itens = [];
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][8]) === "sim") continue;
    itens.push({ id: vals[i][0], nome: vals[i][2], whatsapp: String(vals[i][3]),
      email: vals[i][4], turmaInteresse: vals[i][5], sinal: vals[i][6], comprovante: vals[i][7] });
  }
  return { ok: true, itens: itens };
}

function cadastroProcessado_(id) {
  var sh = cadSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === id) { sh.getRange(i + 1, 9).setValue("sim"); return { ok: true }; }
  }
  return { ok: false, error: "cadastro não encontrado" };
}

// ── SALVAR: dado bruto + carimbo legível ─────────────────────────
function sistemaSave_(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var texto = JSON.stringify(data);

  // 1) dado bruto em pedaços (célula tem limite de 50k caracteres)
  var db = ss.getSheetByName(DB_SHEET) || ss.insertSheet(DB_SHEET);
  db.clearContents();
  db.getRange(1, 1).setValue("NÃO EDITAR — banco do Sistema da Escola ISR. Backup legível nas abas 'Backup · …'");
  var linha = 2;
  for (var i = 0; i < texto.length; i += CHUNK) {
    db.getRange(linha++, 1).setValue(texto.substring(i, i + CHUNK));
  }

  // 2) carimbo legível
  carimboPessoas_(ss, data.pessoas || []);
  carimboCustos_(ss, data.custos || []);
  var meta = ss.getSheetByName("Backup · Info") || ss.insertSheet("Backup · Info");
  meta.clearContents();
  meta.getRange(1, 1, 3, 2).setValues([
    ["Último salvamento", data.atualizadoEm || new Date().toISOString()],
    ["Salvo por", data.por || "—"],
    ["Pessoas no sistema", (data.pessoas || []).length]
  ]);

  return { ok: true, salvoEm: new Date().toISOString() };
}

function carimboPessoas_(ss, pessoas) {
  var sh = ss.getSheetByName("Backup · Pessoas") || ss.insertSheet("Backup · Pessoas");
  sh.clearContents();
  var head = ["Nome", "Status", "Estágio", "WhatsApp", "E-mail", "Turma", "Professora", "Nível",
    "Canal de origem", "Entrou em", "Aluna desde", "Contrato", "Parcela", "Venc.", "Parcelas pagas",
    "Motivo de perda", "Última atividade"];
  var rows = [head];
  pessoas.forEach(function (p) {
    var c = (p.contratos && p.contratos[0]) || {};
    var pagas = (c.meses || []).filter(function (m) { return m.pago; }).length;
    var ult = (p.historico && p.historico.length) ? p.historico[p.historico.length - 1] : null;
    rows.push([
      p.nome || "", p.status || "", p.estagio || "", p.whatsapp || "", p.email || "",
      p.turma || "", p.professora || "", p.nivel || "",
      (p.origem && p.origem.canal) || "", p.entrouEm || "", p.desde || "",
      c.tipo ? (c.tipo + " · " + (c.ciclos || "")) : "", c.parcelaValor || "",
      c.vencDia !== undefined ? String(c.vencDia) : "",
      (c.meses && c.meses.length) ? (pagas + "/" + c.meses.length) : "",
      p.motivoPerda || "",
      ult ? (ult.data + " · " + ult.texto) : ""
    ]);
  });
  sh.getRange(1, 1, rows.length, head.length).setValues(rows);
  sh.getRange(1, 1, 1, head.length).setFontWeight("bold");
}

function carimboCustos_(ss, custos) {
  var sh = ss.getSheetByName("Backup · Custos") || ss.insertSheet("Backup · Custos");
  sh.clearContents();
  var rows = [["Custo", "Moeda", "Valor mensal"]];
  custos.forEach(function (c) { rows.push([c.nome || "", c.moeda || "", c.valor || 0]); });
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1, 1, 3).setFontWeight("bold");
}

// ── CARREGAR ─────────────────────────────────────────────────────
function sistemaLoad_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var db = ss.getSheetByName(DB_SHEET);
  if (!db) return { ok: true, data: null };
  var vals = db.getDataRange().getValues();
  var texto = "";
  for (var i = 1; i < vals.length; i++) texto += (vals[i][0] || "");
  if (!texto) return { ok: true, data: null };
  try { return { ok: true, data: JSON.parse(texto) }; }
  catch (e) { return { ok: false, error: "banco corrompido: " + e }; }
}

// ── HELPER ───────────────────────────────────────────────────────
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
