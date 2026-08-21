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
  if (action === "systemeContacts") return json_(systemeContacts_(e.parameter.key, e.parameter.limit));
  if (action === "jotform") return json_(jotformProxy_(e.parameter.path, e.parameter.key, e.parameter.base));
  if (action === "atividadesPendentes") return json_(atividadesPendentes_());
  return json_({ ok: true, servico: "ISR Banco Central", acoes: ["sistemaLoad", "cadastrosPendentes", "systemeContacts", "POST sistemaSave", "POST novoCadastro", "POST cadastroProcessado"] });
}

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err2) {}
    // O Zapier envia formulário (form-encoded), não JSON: os campos chegam
    // em e.parameter. A ação vale dos dois jeitos.
    var action = body.action || (e && e.parameter && e.parameter.action) || "";
    if (action === "sistemaSave") return json_(sistemaSave_(body.data || {}));
    if (action === "novoCadastro") return json_(novoCadastro_(body.data || {}));
    if (action === "cadastroProcessado") return json_(cadastroProcessado_(body.id));
    if (action === "novaAtividade")
      return json_(novaAtividade_(body.action ? body : (e.parameter || {})));
    if (action === "atividadeProcessada")
      return json_(atividadeProcessada_(body.id || (e.parameter && e.parameter.id)));
    return json_({ ok: false, error: "ação desconhecida" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ── ATIVIDADES DAS ALUNAS (Zapier → sistema) ─────────────────────
// O Zapier faz um POST por resposta do desafio; a linha fica guardada
// aqui e o sistema puxa, casa com a aluna e registra no programa.
var ATIV_SHEET = "Atividades recebidas";
var ATIV_HEAD = ["ID", "Recebido em", "Semana", "Nome", "Campos (JSON)", "Processado"];

function ativSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ATIV_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ATIV_SHEET);
    sh.getRange(1, 1, 1, ATIV_HEAD.length).setValues([ATIV_HEAD]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function novaAtividade_(p) {
  p = p || {};
  var campos = {};
  Object.keys(p).forEach(function (k) { if (k !== "action") campos[k] = p[k]; });
  if (!campos.nome && !campos.semana) return { ok: false, error: "sem nome e sem semana" };
  var id = "atv" + new Date().getTime() + Math.floor(Math.random() * 1000);
  ativSheet_().appendRow([id, new Date().toISOString(),
    String(campos.semana || ""), String(campos.nome || ""), JSON.stringify(campos), ""]);
  return { ok: true, id: id };
}

function atividadesPendentes_() {
  var sh = ativSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, itens: [] };
  var rows = sh.getRange(2, 1, last - 1, ATIV_HEAD.length).getValues();
  var itens = [];
  rows.forEach(function (r) {
    if (r[5]) return; // já processada
    var campos = {};
    try { campos = JSON.parse(r[4] || "{}"); } catch (e2) {}
    itens.push({ id: r[0], recebidoEm: r[1], semana: String(r[2] || ""),
      nome: String(r[3] || ""), campos: campos });
  });
  return { ok: true, itens: itens.slice(0, 50) };
}

function atividadeProcessada_(id) {
  if (!id) return { ok: false, error: "sem id" };
  var sh = ativSheet_();
  var last = sh.getLastRow();
  for (var i = 2; i <= last; i++) {
    if (String(sh.getRange(i, 1).getValue()) === String(id)) {
      sh.getRange(i, 6).setValue(new Date().toISOString());
      return { ok: true };
    }
  }
  return { ok: false, error: "não achei a atividade" };
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
  carimboLancamentos_(ss, data.lancamentos || []);
  carimboFinanceiro_(ss, data);
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
  var rows = [["Custo", "Categoria", "Moeda", "Valor mensal"]];
  custos.forEach(function (c) {
    rows.push([c.nome || "", c.categoria || "outros", c.moeda || "", c.valor || 0]);
  });
  sh.getRange(1, 1, rows.length, 4).setValues(rows);
  sh.getRange(1, 1, 1, 4).setFontWeight("bold");
}

// Lançamentos avulsos: o que foi específico de cada mês (o notebook novo,
// a contadora, um workshop). É o histórico que o extrato do banco alimenta.
function carimboLancamentos_(ss, lancamentos) {
  var sh = ss.getSheetByName("Backup · Lançamentos") || ss.insertSheet("Backup · Lançamentos");
  sh.clearContents();
  var rows = [["Data", "Mês", "Tipo", "Categoria", "Descrição", "Moeda", "Valor"]];
  lancamentos.slice().sort(function (a, b) { return (a.data || "") < (b.data || "") ? 1 : -1; })
    .forEach(function (l) {
      rows.push([l.data || "", (l.data || "").slice(0, 7), l.tipo || "", l.categoria || "",
        l.descricao || "", l.moeda || "", l.valor || 0]);
    });
  sh.getRange(1, 1, rows.length, 7).setValues(rows);
  sh.getRange(1, 1, 1, 7).setFontWeight("bold");
}

// Fechamento mês a mês: entrou, saiu, sobrou e meta — por moeda, sem somar
// R$ com €. É o que a contadora e a reunião de terça leem.
function carimboFinanceiro_(ss, data) {
  var sh = ss.getSheetByName("Backup · Financeiro") || ss.insertSheet("Backup · Financeiro");
  sh.clearContents();

  var metas = data.metas || {};
  var metaBase = metas.faturamento || {};
  var metaMes = metas.faturamentoMes || {};
  var fixos = { "R$": 0, "€": 0 };
  (data.custos || []).forEach(function (c) { fixos[c.moeda] = (fixos[c.moeda] || 0) + (c.valor || 0); });
  (data.equipe || []).forEach(function (e) {
    if (e.valorTipo === "mensal" && e.valor > 0)
      fixos[e.moeda || "R$"] = (fixos[e.moeda || "R$"] || 0) + e.valor;
  });

  var meses = {};
  var toca = function (key) {
    if (!meses[key]) meses[key] = { rec: { "R$": 0, "€": 0 }, abr: { "R$": 0, "€": 0 },
      sai: { "R$": 0, "€": 0 } };
    return meses[key];
  };
  (data.pessoas || []).forEach(function (p) {
    (p.contratos || []).forEach(function (c) {
      var moeda = c.moeda || p.moeda || "R$";
      (c.meses || []).forEach(function (m) {
        if (!m.key || !m.valor) return;
        var v = Number(String(m.valor).replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
        var alvo = toca(m.key);
        if (m.pago) alvo.rec[moeda] += v; else alvo.abr[moeda] += v;
      });
    });
  });
  (data.lancamentos || []).forEach(function (l) {
    var key = (l.data || "").slice(0, 7);
    if (!key) return;
    var alvo = toca(key);
    if (l.tipo === "entrada") alvo.rec[l.moeda] += (l.valor || 0);
    else alvo.sai[l.moeda] += (l.valor || 0);
  });

  var keys = Object.keys(meses).sort().reverse();
  var rows = [["Mês", "Entrou R$", "Entrou €", "A receber R$", "A receber €",
    "Saiu R$", "Saiu €", "Sobrou R$", "Sobrou €", "Meta R$", "Meta €"]];
  keys.forEach(function (k) {
    var m = meses[k];
    var saiBRL = m.sai["R$"] + fixos["R$"], saiEUR = m.sai["€"] + fixos["€"];
    var ov = metaMes[k] || {};
    rows.push([k,
      m.rec["R$"], m.rec["€"], m.abr["R$"], m.abr["€"],
      saiBRL, saiEUR, m.rec["R$"] - saiBRL, m.rec["€"] - saiEUR,
      ov["R$"] != null ? ov["R$"] : (metaBase["R$"] || 0),
      ov["€"] != null ? ov["€"] : (metaBase["€"] || 0)]);
  });
  sh.getRange(1, 1, rows.length, 11).setValues(rows);
  sh.getRange(1, 1, 1, 11).setFontWeight("bold");
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

// ── SYSTEME.IO (leads dos funis → CRM) ───────────────────────────
// O navegador não consegue falar direto com a API do systeme (CORS);
// este script busca os contatos e devolve para o app. A chave de API
// vem do app a cada chamada e NÃO fica gravada aqui.
// ── JOTFORM (inscrições dos funis → CRM) ─────────────────────────
// Alguns navegadores bloqueiam a chamada direta do app à API do
// Jotform (CORS). Este script busca no lugar do navegador e devolve a
// mesma resposta. A chave vem do app a cada chamada e NÃO fica aqui.
function jotformProxy_(path, key, base) {
  if (!key) return { ok: false, error: "sem chave de API" };
  if (!path || path.charAt(0) !== "/") return { ok: false, error: "caminho inválido" };
  var b = base === "eu" ? "https://eu-api.jotform.com" : "https://api.jotform.com";
  try {
    var sep = path.indexOf("?") >= 0 ? "&" : "?";
    var r = UrlFetchApp.fetch(b + path + sep + "apiKey=" + encodeURIComponent(key),
      { muteHttpExceptions: true });
    var d = JSON.parse(r.getContentText());
    if (!d || d.responseCode !== 200)
      return { ok: false, error: (d && d.message) || ("o Jotform respondeu " + r.getResponseCode()) };
    return { ok: true, data: d };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function systemeContacts_(key, limit) {
  if (!key) return { ok: false, error: "sem chave de API" };
  try {
    var n = parseInt(limit, 10) || 100;
    var r = UrlFetchApp.fetch("https://api.systeme.io/api/contacts?limit=" + n,
      { headers: { "X-API-Key": key }, muteHttpExceptions: true });
    if (r.getResponseCode() === 401) return { ok: false, error: "chave de API inválida" };
    if (r.getResponseCode() !== 200)
      return { ok: false, error: "o systeme respondeu " + r.getResponseCode() };
    var d = JSON.parse(r.getContentText());
    return { ok: true, items: d.items || [] };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
