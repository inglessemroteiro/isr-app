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

// Carimbo da versão publicada. Abrir o endereço da Conexão sem nenhum
// ?action= devolve este número: é assim que se sabe, olhando, se a
// versão que está no ar é a mesma do arquivo — sem isso, uma publicação
// esquecida parece funcionar até a hora errada.
var VERSAO_SCRIPT = "2026.08.21-p";

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  if (action === "sistemaLoad") return json_(sistemaLoad_());
  if (action === "cadastrosPendentes") return json_(cadastrosPendentes_());
  if (action === "systemeContacts") return json_(systemeContacts_(e.parameter.key, e.parameter.limit));
  if (action === "jotform") return json_(jotformProxy_(e.parameter.path, e.parameter.key, e.parameter.base));
  if (action === "atividadesPendentes") return json_(atividadesPendentes_());
  if (action === "assinaturasPendentes") return json_(assinaturasPendentes_());
  return json_({ ok: true, servico: "ISR Banco Central", versao: VERSAO_SCRIPT,
    leituras: ["sistemaLoad", "cadastrosPendentes", "atividadesPendentes",
      "assinaturasPendentes", "systemeContacts", "jotform"],
    escritas: ["sistemaSave", "novoCadastro", "cadastroProcessado",
      "novaAtividade", "atividadeProcessada", "assinaturaEvento", "assinaturaProcessada"],
    eventosDeAssinatura: ["assinou", "cancelou", "falhou", "pagou"] });
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
    if (action === "assinaturaEvento") {
      // O systeme manda o corpo DELE, sem os nossos campos: o que a
      // escola controla é a URL. Então o que vier na URL manda, o corpo
      // completa, e o e-mail é procurado no corpo se não vier nomeado.
      var dados = {};
      if (e && e.parameter) for (var kp in e.parameter) dados[kp] = e.parameter[kp];
      for (var kb in body) if (dados[kb] === undefined) dados[kb] = body[kb];
      if (!dados.email) dados.email = acharEmail_(body);
      if (!dados.nome) dados.nome = acharNome_(body);
      return json_(assinaturaEvento_(dados));
    }
    if (action === "assinaturaProcessada")
      return json_(assinaturaProcessada_(body.id || (e.parameter && e.parameter.id)));
    return json_({ ok: false, error: "ação desconhecida" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ── ASSINATURAS (systeme → Zapier → sistema) ─────────────────────
// O Zapier faz um POST quando alguém assina ou cancela no systeme. A
// linha fica guardada aqui e o sistema aplica no próximo puxe: ativa a
// assinatura, ou encerra. Nada é decidido nesta planilha — ela é a
// caixa de entrada, e o sistema é quem sabe o que fazer com o evento.
var ASSIN_SHEET = "Assinaturas recebidas";
var ASSIN_HEAD = ["ID", "Recebido em", "Evento", "Nome", "E-mail", "Valor", "Moeda", "Acesso até", "Processado"];

function assinSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ASSIN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ASSIN_SHEET);
    sh.getRange(1, 1, 1, ASSIN_HEAD.length).setValues([ASSIN_HEAD]).setFontWeight("bold");
    return sh;
  }
  // aba criada antes da coluna "Acesso até": abre espaço para ela sem
  // embaralhar o que já foi gravado
  var cab = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (cab.length < ASSIN_HEAD.length && String(cab[7] || "") === "Processado") {
    sh.insertColumnBefore(8);
    sh.getRange(1, 1, 1, ASSIN_HEAD.length).setValues([ASSIN_HEAD]).setFontWeight("bold");
  }
  return sh;
}

// O corpo do webhook muda de plataforma para plataforma e de versão
// para versão. Em vez de exigir um formato, o e-mail é procurado onde
// ele estiver: primeiro nas chaves óbvias, depois no que houver dentro.
function acharEmail_(o, prof) {
  prof = prof || 0;
  if (!o || prof > 6) return "";
  if (typeof o === "string") {
    var m = o.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return m ? m[0].toLowerCase() : "";
  }
  if (typeof o !== "object") return "";
  var obvias = ["email", "e-mail", "mail", "customer_email", "contact_email",
    "customerEmail", "contactEmail"];
  for (var i = 0; i < obvias.length; i++) {
    var v = o[obvias[i]];
    if (typeof v === "string") {
      var mm = v.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (mm) return mm[0].toLowerCase();
    }
  }
  for (var k in o) {
    if (!o.hasOwnProperty(k)) continue;
    var r = acharEmail_(o[k], prof + 1);
    if (r) return r;
  }
  return "";
}
function acharNome_(o, prof) {
  prof = prof || 0;
  if (!o || typeof o !== "object" || prof > 4) return "";
  var inteiro = o.name || o.nome || o.full_name || o.fullName || o.customer_name;
  if (typeof inteiro === "string" && inteiro.trim()) return inteiro.trim();
  var pri = o.first_name || o.firstName || o.primeiro_nome;
  var ult = o.last_name || o.lastName || o.sobrenome;
  if (typeof pri === "string" && pri.trim()) {
    return (pri + " " + (typeof ult === "string" ? ult : "")).trim();
  }
  for (var k in o) {
    if (!o.hasOwnProperty(k)) continue;
    var r = acharNome_(o[k], prof + 1);
    if (r) return r;
  }
  return "";
}

function assinaturaEvento_(p) {
  p = p || {};
  var email = String(p.email || "").trim().toLowerCase();
  if (!email) return { ok: false, error: "sem e-mail" };
  // "assinou" é o padrão: um Zap mal configurado não deve cancelar
  // ninguém por omissão do campo
  var ev = String(p.evento || "assinou").toLowerCase();
  // quatro notícias possíveis. "assinou" é o padrão: um Zap mal
  // configurado não deve cancelar ninguém por omissão do campo.
  if (ev.indexOf("cancel") >= 0 || ev.indexOf("encerr") >= 0) ev = "cancelou";
  else if (ev.indexOf("falh") >= 0 || ev.indexOf("venc") >= 0
    || ev.indexOf("fail") >= 0 || ev.indexOf("past_due") >= 0) ev = "falhou";
  else if (ev.indexOf("pagou") >= 0 || ev.indexOf("paid") >= 0
    || ev.indexOf("recuper") >= 0) ev = "pagou";
  else ev = "assinou";
  var id = "asn" + new Date().getTime() + Math.floor(Math.random() * 1000);
  assinSheet_().appendRow([id, new Date().toISOString(), ev,
    String(p.nome || ""), email, String(p.valor || ""), String(p.moeda || ""),
    String(p.ate || ""), ""]);
  return { ok: true, id: id, evento: ev };
}

function assinaturasPendentes_() {
  var sh = assinSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, itens: [] };
  var rows = sh.getRange(2, 1, last - 1, ASSIN_HEAD.length).getValues();
  var itens = [];
  rows.forEach(function (r) {
    if (r[8]) return; // já processado
    itens.push({ id: r[0], recebidoEm: r[1], evento: String(r[2] || ""),
      nome: String(r[3] || ""), email: String(r[4] || ""),
      valor: String(r[5] || ""), moeda: String(r[6] || ""),
      // fim do período já pago, quando o Zap souber dizer: é até quando
      // o acesso dela continua valendo
      ate: r[7] instanceof Date ? Utilities.formatDate(r[7], "UTC", "yyyy-MM-dd") : String(r[7] || "") });
  });
  return { ok: true, itens: itens };
}

function assinaturaProcessada_(id) {
  var sh = assinSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: false, error: "fila vazia" };
  var rows = sh.getRange(2, 1, last - 1, ASSIN_HEAD.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sh.getRange(i + 2, ASSIN_HEAD.length).setValue(new Date().toISOString());
      return { ok: true };
    }
  }
  return { ok: false, error: "evento não encontrado" };
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
