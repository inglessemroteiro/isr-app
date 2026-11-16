// Os 13 blocos do trabalho da professora, desenhados uma vez e usados
// pelos três modelos.
//
// Por que compartilhados: a escolha entre A, B e C é sobre ARRUMAÇÃO —
// onde cada coisa mora e quantos passos custa chegar nela. Se cada
// modelo desenhasse os blocos de novo, a comparação viraria uma
// comparação de desenho, e não de arquitetura.
//
// A lista dos 13 está em O-QUE-A-PROFESSORA-PRECISA.md, seção 9.
//
// Cada bloco é uma função que recebe o estado e devolve HTML. A
// interação é declarada em atributos (data-ir, data-pres, data-vivo…)
// e tratada por um ouvinte só, em professora-modelo-shell.js.
//
// Este arquivo não entra no sistema. Só os três rascunhos o carregam.
window.ISR_BLOCOS = (function () {
  "use strict";
  var D = window.ISR_MODELO;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function ir(o) { return "data-ir='" + JSON.stringify(o).replace(/'/g, "&#39;") + "'"; }
  function cab(titulo, passo, direita) {
    return '<div class="cab"><div>'
      + (passo ? '<div class="passo">' + esc(passo) + "</div>" : "")
      + "<h2>" + esc(titulo) + "</h2></div>"
      + (direita || "") + "</div>";
  }
  var FASE_COR = { abrir: "#e5f2f6", ouvir: "#fdf3d6", praticar: "#e9f3e4",
    produzir: "#c9e265", corrigir: "#fde4df", fechar: "#f2ebe3" };

  var B = {};

  // ══ 1 · HOJE ══════════════════════════════════════════════════
  // A próxima ação, a agenda do dia e a fila. Um estado por vez no
  // topo: é a aula de hoje que manda.
  B.hoje = function (est) {
    var h = [], t = D.turma("basics"), a = D.aula("basics", "2026-11-16");
    var viva = D.VIVO.aberta;

    h.push('<section class="hero">');
    h.push('<div class="heroQuando">segunda, 16 de novembro · 07h</div>');
    h.push("<h2>" + esc(t.nivel) + " · sessão " + a.s + "</h2>");
    h.push('<div class="heroSub">' + esc(a.titulo) + " · " + t.alunas.length + " alunas · online</div>");
    h.push('<div class="heroBtns">');
    h.push('<button class="btn lima" data-aula="' + (viva ? "encerrar" : "abrir") + '">'
      + (viva ? "Encerrar a aula" : "Começar a aula") + "</button>");
    h.push('<button class="btn fosca" ' + ir({ tela: "chamada", turma: "basics", data: "2026-11-16" }) + ">Chamada</button>");
    h.push('<button class="btn fosca" ' + ir({ tela: "plano", turma: "basics", data: "2026-11-16" }) + ">O plano da sessão</button>");
    h.push("</div></section>");

    // os avisos, contados do que existe
    var semGrav = D.semGravacao(), corrigir = D.porCorrigir(), semData = D.clubesSemData();
    if (semGrav.length || corrigir.length || semData.length) {
      h.push('<div class="aviso"><b>Pendências</b><ul style="margin:6px 0 0;padding-left:18px">');
      if (corrigir.length) h.push("<li>" + corrigir.length + " tarefa"
        + (corrigir.length === 1 ? "" : "s") + ' de casa entregue'
        + (corrigir.length === 1 ? "" : "s") + ' e sem correção. <a href="#" '
        + ir({ tela: "cadernos" }) + ">abrir os cadernos</a></li>");
      if (semGrav.length) h.push("<li>" + semGrav.length + " aula"
        + (semGrav.length === 1 ? "" : "s") + ' sem gravação publicada. <a href="#" '
        + ir({ tela: "gravacoes" }) + ">ver as gravações</a></li>");
      if (semData.length) h.push("<li>" + semData.length + " clube"
        + (semData.length === 1 ? "" : "s") + ' com encontro sem tema. <a href="#" '
        + ir({ tela: "clube", clube: semData[0].clube.id, abaClube: "encontros" }) + ">marcar os temas</a></li>");
      h.push("</ul></div>");
    }

    h.push('<div class="grade2">');
    // agenda
    h.push('<div class="bloco"><h3>a agenda de hoje</h3>');
    D.AGENDA_HOJE.forEach(function (g) {
      var destino = g.turma ? { tela: "chamada", turma: g.turma, data: g.data }
        : g.clube ? { tela: "clube", clube: g.clube, abaClube: "encontros" }
        : { tela: "particular", particular: g.particular };
      h.push('<button class="linhaBtn" ' + ir(destino) + ">"
        + '<span class="data">' + esc(g.hora) + "</span>"
        + '<span class="tit">' + esc(g.texto) + "</span>"
        + '<span class="selo ' + (g.estado === "agora" ? "ok" : "neutro") + '">' + esc(g.estado) + "</span></button>");
    });
    h.push("</div>");
    // fila
    h.push('<div class="bloco"><h3>a fila · ' + D.FILA.length + "</h3>");
    D.FILA.forEach(function (f) {
      h.push('<div style="padding:9px 0;border-bottom:1px solid var(--papel)">'
        + '<div style="font-size:13.5px;font-weight:700">' + esc(f.nome) + "</div>"
        + '<div class="nota" style="margin-top:2px">' + esc(f.motivo) + "</div>"
        + '<button class="btn claro pq" style="margin-top:6px" ' + ir({ tela: "pulso", aluna: f.nome })
        + ">Registrar o pulso</button></div>");
    });
    h.push("</div></div>");

    // o mês
    h.push('<div class="grade2" style="margin-top:13px">');
    h.push('<div class="bloco"><h3>entregas do mês</h3>'
      + '<div style="display:flex;gap:16px;flex-wrap:wrap">'
      + B.numero("9", "aulas com chamada") + B.numero("2", "sem chamada no mês", "erro")
      + B.numero("18", "alunas") + B.numero("2", "clubes") + "</div>"
      + '<button class="btn claro pq" style="margin-top:10px" ' + ir({ tela: "horas" })
      + ">Ver as aulas do mês</button></div>");
    h.push('<div class="bloco"><h3>substituições</h3>');
    D.SUBSTITUICOES.forEach(function (s) {
      h.push('<div style="display:flex;gap:10px;justify-content:space-between;padding:7px 0">'
        + "<span>" + esc(s.curto) + " · " + esc(s.turma) + "</span>"
        + '<span class="selo ok">' + esc(s.estado) + "</span></div>");
    });
    h.push('<button class="btn claro pq" style="margin-top:8px" ' + ir({ tela: "substituir" })
      + ">Pedir substituição</button></div>");
    h.push("</div>");
    return h.join("");
  };

  // A anotação que diz em que pé o bloco está no sistema de hoje.
  // Fica marcada como anotação, e não como texto da tela, para que
  // quem navega o protótipo não a confunda com a interface.
  B.marca = function (estado, texto) {
    return '<div class="intro"><span class="marcador">' + esc(estado) + "</span>"
      + esc(texto) + "</div>";
  };

  B.numero = function (v, k, tipo) {
    var cor = tipo === "erro" ? "var(--erro)" : "var(--tinta)";
    return '<div style="min-width:92px"><div style="font-size:24px;font-weight:800;letter-spacing:-.03em;color:'
      + cor + '">' + esc(v) + '</div><div class="nota" style="font-weight:700;margin-top:0">' + esc(k) + "</div></div>";
  };

  // ══ 2 · A AULA AO VIVO ════════════════════════════════════════
  // O caderno em que a professora vê as alunas escrevendo. Quatro
  // estados por aluna, filtro, e o comentário preso à tarefa.
  B.aulaViva = function (est) {
    var t = D.turma(est.turma || "basics");
    var a = D.aula(est.turma || "basics", est.data || "2026-11-16");
    var V = D.VIVO, h = [];
    var tarefas = (a.roteiro || []).filter(function (e) { return e.pergunta; });

    h.push('<section class="barraViva ' + (V.aberta ? "on" : "") + '">');
    h.push('<button class="btn lima" data-aula="' + (V.aberta ? "encerrar" : "abrir") + '">'
      + (V.aberta ? "Encerrar a aula" : "Abrir o caderno") + "</button>");
    h.push("<span>" + (V.aberta
      ? "Aula aberta há " + V.minutos + " min. O que elas escrevem aparece aqui."
      : "O caderno está fechado. Abra para elas responderem as tarefas.") + "</span>");
    if (a.slides) h.push('<a class="btn fosca" href="#" onclick="return false">Slides</a>');
    h.push("</section>");

    if (!tarefas.length) {
      h.push('<div class="aviso">Não há tarefa com pergunta no plano publicado desta aula — elas ainda não têm o que responder. '
        + '<a href="#" ' + ir({ tela: "plano", turma: est.turma, data: est.data })
        + ">escrever as perguntas no plano</a></div>");
      return h.join("");
    }

    // filtros por estado
    var contas = { todas: V.alunas.length };
    Object.keys(D.ESTADO_VIVO).forEach(function (k) {
      contas[k] = V.alunas.filter(function (x) { return x.estado === k; }).length;
    });
    var filtro = est.vivoFiltro || "todas";
    h.push('<div class="tira">');
    h.push('<button class="chip' + (filtro === "todas" ? " on" : "") + '" data-filtro="todas">todas · ' + contas.todas + "</button>");
    Object.keys(D.ESTADO_VIVO).forEach(function (k) {
      var e = D.ESTADO_VIVO[k];
      h.push('<button class="chip' + (filtro === k ? " on" : "") + '" data-filtro="' + k + '">'
        + '<span class="ponto" style="background:' + e.cor + '"></span>'
        + esc(e.label) + " · " + contas[k] + "</button>");
    });
    h.push("</div>");

    var sel = est.vivoAluna
      ? V.alunas.filter(function (x) { return x.nome === est.vivoAluna; })[0] : null;

    if (!sel) {
      // a grade
      var vis = filtro === "todas" ? V.alunas
        : V.alunas.filter(function (x) { return x.estado === filtro; });
      if (!vis.length) h.push('<div class="cartao">Nenhuma aluna neste estado agora.</div>');
      h.push('<div class="gradeViva">');
      vis.forEach(function (al) {
        var e = D.ESTADO_VIVO[al.estado];
        var escrito = al.respostas.filter(function (r) { return r && r.trim(); });
        var previa = escrito.length ? escrito[escrito.length - 1] : "Ainda sem nada escrito.";
        if (previa.length > 120) previa = previa.slice(0, 120) + "…";
        h.push('<button class="cartaoViva" data-vivo="' + esc(al.nome) + '">'
          + '<span class="cvTopo"><b>' + esc(al.nome) + "</b>"
          + '<span class="cvEstado"><span class="ponto" style="background:' + e.cor + '"></span>'
          + esc(e.label) + "</span></span>"
          + '<span class="cvPrevia">' + esc(previa) + "</span>"
          + '<span class="nota">' + escrito.length + " de " + tarefas.length + " tarefas</span></button>");
      });
      h.push("</div>");
      return h.join("");
    }

    // uma aluna
    var e2 = D.ESTADO_VIVO[sel.estado];
    h.push('<section class="cartao">');
    h.push('<div class="cab"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'
      + '<button class="btn claro pq" data-vivo="">← todas</button>'
      + "<h2>" + esc(sel.nome) + "</h2>"
      + '<span class="cvEstado"><span class="ponto" style="background:' + e2.cor + '"></span>'
      + esc(e2.label) + "</span></div>"
      + '<button class="btn claro pq" ' + ir({ tela: "pulso", aluna: sel.nome }) + ">Pulso dela</button></div>");
    tarefas.forEach(function (tf, i) {
      var r = sel.respostas[i] || "";
      h.push('<div style="margin-top:13px">'
        + '<div class="rotulo">tarefa ' + (i + 1) + " · " + esc(tf.fase) + "</div>"
        + '<div style="font-size:14.5px;font-weight:700;line-height:1.4">' + esc(tf.pergunta) + "</div>"
        + '<div class="resposta' + (r.trim() ? "" : " vazia") + '">'
        + esc(r.trim() ? r : "Ainda sem nada escrito.") + "</div>");
      (sel.comentarios[i] || []).forEach(function (c) {
        h.push('<div class="correcao">' + esc(c.texto) + ' <span class="nota">· ' + esc(c.quem) + "</span></div>");
      });
      h.push('<div class="formLinha">'
        + '<input class="campo" id="cm' + i + '" placeholder="Comentar esta resposta. Aparece no caderno dela, presa à tarefa." />'
        + '<button class="btn pq" data-com="' + esc(sel.nome) + "|" + i + '">Comentar</button></div>');
      h.push("</div>");
    });
    h.push("</section>");
    return h.join("");
  };

  // ══ 3 · SLIDES E O CONTEÚDO DA AULA ═══════════════════════════
  // O editor de blocos e o guia do professor existem no sistema
  // (ISR - Tela de Aula) e hoje nenhum link leva a eles.
  B.conteudo = function (est) {
    var a = D.aula(est.turma || "basics", est.data || "2026-11-16");
    var h = [];
    h.push('<section class="cartao">' + cab("Slides desta sessão", "antes da aula",
      a.slides ? '<span class="selo ok">link salvo</span>' : '<span class="selo alerta">sem link</span>'));
    h.push('<div class="formLinha"><input class="campo" value="' + esc(a.slides)
      + '" placeholder="https://docs.google.com/presentation/d/…" />'
      + '<button class="btn pq">Salvar</button></div>');
    h.push('<div class="nota">Com link, o botão de apresentar aparece na aula e a aluna vê o mesmo deck no caderno. Sem link, a prévia é o roteiro.</div>');
    if (a.slides) h.push('<div style="display:flex;gap:8px;margin-top:11px;flex-wrap:wrap">'
      + '<button class="btn pq">▶ Apresentar</button><button class="btn claro pq">Abrir para editar</button></div>');
    h.push("</section>");

    h.push('<section class="cartao">' + cab("O caderno da aula", "antes da aula",
      '<span class="selo neutro">editor de blocos</span>'));
    h.push('<div class="nota">É a tela que a aluna abre na aula. Os blocos vêm de um menu: parágrafo, título, lista, tabela, imagem, vídeo, duas ou três colunas, separador e tarefa.</div>');
    h.push('<div class="telaFalsa"><div class="tfAbas"><span class="on">Aula</span><span>Tarefas</span><span>Guia do Prof</span></div>'
      + '<div class="tfFolha"><h3 style="margin:0 0 8px;font-size:20px">' + esc(a.titulo) + "</h3>"
      + "<p style=\"margin:0 0 8px;font-size:13px;line-height:1.55\">" + esc(a.objetivo || "") + "</p>"
      + '<div style="margin-top:10px">' + (a.palavras || []).map(function (p) {
        return '<span class="pal">' + esc(p) + "</span>"; }).join("") + "</div>"
      + '<div class="tfBloco">+ bloco: parágrafo · título · lista · tabela · imagem · vídeo · colunas · tarefa</div>'
      + "</div></div>");
    h.push('<div style="display:flex;gap:8px;margin-top:11px;flex-wrap:wrap">'
      + '<button class="btn pq">Abrir o editor</button>'
      + '<button class="btn claro pq">Ler o guia do professor</button>'
      + '<button class="btn claro pq">Baixar em PDF</button>'
      + '<button class="btn claro pq">Tela cheia</button></div>');
    h.push("</section>");
    return h.join("");
  };

  // ══ 4 · CHAMADA ═══════════════════════════════════════════════
  B.chamada = function (est) {
    var t = D.turma(est.turma || "basics");
    var a = D.aula(est.turma || "basics", est.data || "2026-11-16");
    var h = [], salva = a.estado === "dada";
    var presentes = t.alunas.filter(function (n) {
      return (a.presencas[n] || "P") === "P" || a.presencas[n] === "A"; }).length;

    h.push('<section class="cartao">' + cab(esc(t.nivel) + " · " + esc(a.curto), "durante a aula",
      '<span style="font-size:12.5px;color:var(--tinta-fraca)">' + presentes + " de " + t.alunas.length + " presentes</span>"));

    if (salva) {
      h.push('<div class="caixaFolha"><b>Salva e contando na folha.</b>'
        + '<span>Para corrigir uma presença, é preciso dizer que quer mexer.</span>'
        + '<button class="btn claro pq">✎ Corrigir esta chamada</button></div>');
    } else if (!a.topico) {
      h.push('<div class="caixaFolha alerta"><b>Falta o tópico da aula.</b>'
        + "<span>Sem tópico, a aula não entra na folha.</span></div>");
    }

    h.push('<div class="formLinha" style="justify-content:flex-end">'
      + '<span class="nota" style="flex:1;margin:0">Toque na letra de cada aluna. P presente · A atraso · F falta · J justificada.</span>'
      + '<button class="btn claro pq">Todas presentes</button>'
      + '<button class="btn claro pq">Todas faltas</button></div>');

    t.alunas.forEach(function (n) {
      var atual = a.presencas[n] || "P";
      var ent = (a.entregues || []).indexOf(n) >= 0;
      h.push('<div class="linha"><a class="nome" href="#" ' + ir({ tela: "pulso", aluna: n }) + ">" + esc(n) + "</a>");
      h.push('<button class="tar' + (ent ? " ok" : "") + '" data-tar="' + esc(n) + '">'
        + (ent ? "entregou" : "sem entrega") + "</button>");
      h.push('<span class="pres">');
      ["P", "A", "F", "J"].forEach(function (l) {
        var on = atual === l ? (l === "P" || l === "A" ? " p" : " f") : "";
        h.push('<button class="b' + on + '" data-pres="' + esc(n) + "|" + l + '">' + l + "</button>");
      });
      h.push("</span></div>");
    });

    h.push('<div class="grade2" style="margin-top:14px">');
    h.push('<div><div class="rotulo">sessão dada</div>'
      + '<select class="campo"><option>Sessão ' + a.s + " · " + esc(a.titulo) + "</option>"
      + '<option>Sessão ' + (a.s + 1) + " · outra</option></select></div>");
    h.push('<div><div class="rotulo">tópico da aula</div>'
      + '<input class="campo" value="' + esc(a.topico) + '" placeholder="O que foi dado nesta aula" /></div>');
    h.push("</div>");
    h.push('<div class="nota">Escolher a sessão preenche o tópico com o título dela. O tópico é o que valida a aula para a folha.</div>');

    h.push('<div class="formLinha" style="margin-top:13px">'
      + '<button class="btn">Salvar a chamada</button>'
      + '<input class="campo" style="flex:1" value="' + esc(a.gravacao)
      + '" placeholder="Link da gravação desta aula" />'
      + '<button class="btn claro pq" data-grav="1">Salvar a gravação</button></div>');
    h.push('<div class="nota">A gravação fica visível só para as alunas desta turma.</div>');

    if (salva) {
      h.push('<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--papel)">'
        + '<div class="rotulo">quem mexeu nesta chamada</div>'
        + '<div class="nota" style="margin-top:5px"><b>Bárbara</b> · 9 nov 08h12 · salvou com 5 presenças<br>'
        + "<b>Érika</b> · 11 nov 15h40 · corrigiu Rafael Teste de F para J</div></div>");
    }
    h.push("</section>");

    // o diário
    h.push('<section class="cartao">' + cab("Diário da turma", "", '<span class="nota" style="margin:0">frequência do ciclo</span>'));
    h.push('<div style="overflow-x:auto"><table class="diario"><tr><th>aluna</th>');
    (t.aulas || []).slice().reverse().forEach(function (x) {
      h.push("<th>" + esc(x.curto === "hoje" ? "16" : x.curto.split(" ")[0]) + "</th>");
    });
    h.push("<th>freq</th><th>tarefa</th></tr>");
    t.alunas.forEach(function (n) {
      var faltas = 0, dadas = 0;
      var cel = (t.aulas || []).slice().reverse().map(function (x) {
        if (x.estado === "agendada") return '<td class="cel vazia">·</td>';
        dadas++;
        var l = x.presencas[n] || "P";
        if (l === "F") faltas++;
        return '<td class="cel ' + (l === "F" ? "f" : l === "J" ? "j" : "p") + '">' + l + "</td>";
      }).join("");
      var pct = dadas ? Math.round((dadas - faltas) / dadas * 100) : 100;
      var ent = (t.aulas || []).filter(function (x) {
        return (x.entregues || []).indexOf(n) >= 0; }).length;
      h.push("<tr><td>" + esc(n) + "</td>" + cel
        + '<td style="font-weight:700;color:' + (pct < 75 ? "var(--erro)" : "var(--ok)") + '">' + pct + "%</td>"
        + "<td>" + ent + "/" + dadas + "</td></tr>");
    });
    h.push("</table></div></section>");
    return h.join("");
  };

  // ══ 5 · O PLANO DA SESSÃO ═════════════════════════════════════
  B.plano = function (est) {
    var t = D.turma(est.turma || "basics");
    var a = D.aula(est.turma || "basics", est.data || "2026-11-16");
    var h = [], total = (a.roteiro || []).reduce(function (s, e) { return s + e.min; }, 0);
    var comPergunta = (a.roteiro || []).filter(function (e) { return e.pergunta; }).length;

    // a faixa de sessões
    h.push('<div class="tira">');
    (t.aulas || []).slice().reverse().forEach(function (x) {
      var on = x.data === a.data;
      h.push('<button class="dia' + (on ? " on" : "") + '" ' + ir({ tela: est.tela, turma: t.id, data: x.data })
        + "><b>s" + x.s + "</b><span>" + esc(x.curto) + "</span></button>");
    });
    h.push("</div>");

    h.push('<section class="cartao">' + cab("Sessão " + a.s + " · " + esc(a.titulo), "antes da aula",
      '<span style="font-size:12.5px;color:var(--tinta-fraca)">' + total + " min · "
      + comPergunta + " tarefa" + (comPergunta === 1 ? "" : "s") + "</span>"));
    h.push('<div class="nota" style="font-size:12.5px"><b>programa:</b> ' + esc(t.programa)
      + " · sessão " + a.s + " de " + t.sessoes + "</div>");
    if (a.objetivo) h.push('<div style="font-size:13.5px;line-height:1.6;margin-top:9px">' + esc(a.objetivo) + "</div>");

    if (!(a.roteiro || []).length) {
      h.push('<div class="aviso" style="margin-top:11px">Esta sessão ainda não tem roteiro. '
        + "O roteiro vem do programa da escola: enquanto você não o edita, correções do programa chegam à turma.</div>");
    } else {
      h.push('<div class="rotulo" style="margin-top:14px">o roteiro</div>');
      (a.roteiro || []).forEach(function (e, i) {
        h.push('<div class="etapa">'
          + '<span class="min">' + e.min + " min</span>"
          + '<span class="corpoEtapa">'
          + '<span class="selo neutro" style="background:' + (FASE_COR[e.fase] || "#f2ebe3") + '">' + esc(e.fase) + "</span> "
          + '<span style="font-size:14px;font-weight:600">' + esc(e.titulo) + "</span>"
          + (e.pergunta ? '<span class="pergunta"><b>elas respondem no caderno:</b> ' + esc(e.pergunta) + "</span>" : "")
          + "</span>"
          + '<span class="setas"><button class="b">↑</button><button class="b">↓</button><button class="b">×</button></span>'
          + "</div>");
      });
      h.push('<div class="addEtapa"><div class="rotulo">acrescentar uma atividade sua</div>'
        + '<div class="tira" style="margin:7px 0">'
        + Object.keys(FASE_COR).map(function (f) {
          return '<button class="chip" style="background:' + FASE_COR[f] + '">' + f + "</button>"; }).join("")
        + "</div>"
        + '<div class="formLinha"><input class="campo" style="flex:2" placeholder="Ex.: pares trocam a receita e anotam uma palavra nova" />'
        + '<input class="campo" style="width:60px;text-align:center" value="10" /><span class="nota" style="margin:0">min</span></div>'
        + '<input class="campo" style="margin-top:7px" placeholder="Pergunta que vira tarefa no caderno (deixe vazio se a etapa não gera tarefa)" />'
        + '<button class="btn pq" style="margin-top:9px">Acrescentar ao roteiro</button></div>');
    }

    h.push('<div class="grade3" style="margin-top:14px">');
    h.push('<div class="bloco"><h3>palavras da sessão</h3>'
      + ((a.palavras || []).length ? (a.palavras || []).map(function (p) {
        return '<span class="pal">' + esc(p) + "</span>"; }).join("")
        : '<div class="nota">Nenhuma ainda.</div>')
      + '<textarea class="campo" style="margin-top:8px" rows="2" placeholder="Separe por vírgula">'
      + esc((a.palavras || []).join(", ")) + "</textarea></div>");
    h.push('<div class="bloco"><h3>começos de frase</h3>'
      + ((a.starters || []).length ? (a.starters || []).map(function (p) {
        return '<span class="pal">' + esc(p) + "</span>"; }).join("")
        : '<div class="nota">Nenhum ainda.</div>')
      + '<textarea class="campo" style="margin-top:8px" rows="2" placeholder="Um por linha">'
      + esc((a.starters || []).join("\n")) + "</textarea></div>");
    h.push('<div class="bloco"><h3>tarefa de casa</h3>'
      + (a.tarefa ? '<div style="font-size:13px;line-height:1.55">' + esc(a.tarefa) + "</div>"
        : '<div class="aviso" style="margin:0">Esta sessão está sem tarefa de casa.</div>')
      + '<textarea class="campo" style="margin-top:8px" rows="3">' + esc(a.tarefa) + "</textarea></div>");
    h.push("</div>");

    h.push('<div class="formLinha" style="margin-top:13px">'
      + '<button class="btn">Salvar o plano</button>'
      + '<button class="btn claro pq">Ver como a aluna vê</button>'
      + '<button class="btn claro pq" ' + ir({ tela: "conteudo", turma: t.id, data: a.data })
      + ">Slides e caderno da aula</button></div>");
    h.push("</section>");
    return h.join("");
  };

  // ══ 6 · CADERNOS E TAREFAS DE CASA ════════════════════════════
  // Hoje não existe: a professora só lê respostas enquanto a aula
  // está aberta. Aqui elas ficam depois.
  B.cadernos = function (est) {
    var h = [], filtro = est.cadFiltro || "por_corrigir";
    var todas = D.CADERNO;
    var lista = filtro === "por_corrigir"
      ? todas.filter(function (c) { return !c.corrigido; })
      : filtro === "corrigidas" ? todas.filter(function (c) { return c.corrigido; }) : todas;

    h.push(B.marca("não existe hoje",
      "As respostas ficam guardadas, mas só são legíveis enquanto a aula está aberta. "
      + "Fechada a aula, a chamada registra \"entregou\" e o texto fica sem leitora."));

    h.push('<div class="tira">');
    [["por_corrigir", "por corrigir · " + todas.filter(function (c) { return !c.corrigido; }).length],
     ["corrigidas", "corrigidas · " + todas.filter(function (c) { return c.corrigido; }).length],
     ["todas", "todas · " + todas.length]].forEach(function (f) {
      h.push('<button class="chip' + (filtro === f[0] ? " on" : "") + '" '
        + ir({ cadFiltro: f[0] }) + ">" + esc(f[1]) + "</button>");
    });
    h.push("</div>");

    if (!lista.length) h.push('<div class="cartao">Nada aqui agora.</div>');
    lista.forEach(function (c, idx) {
      var t = D.turma(c.turma);
      h.push('<section class="cartao">' + cab(esc(c.aluna), esc(t.nivel) + " · sessão " + c.sessao + " · " + esc(c.titulo),
        c.corrigido ? '<span class="selo ok">corrigida</span>' : '<span class="selo alerta">por corrigir</span>'));
      h.push('<div class="nota" style="margin-top:-6px">' + esc(c.quando) + "</div>");
      c.respostas.forEach(function (r, i) {
        h.push('<div style="margin-top:12px">'
          + '<div style="font-size:14px;font-weight:700;line-height:1.4">' + esc(r.pergunta) + "</div>"
          + '<div class="resposta">' + esc(r.texto) + "</div>");
        if (r.comentario) {
          h.push('<div class="correcao">' + esc(r.comentario) + ' <span class="nota">· Bárbara</span></div>');
        } else {
          h.push('<div class="formLinha"><input class="campo" placeholder="Correção. Aparece no caderno dela, presa à tarefa." />'
            + '<button class="btn pq" data-corrigir="' + idx + "|" + i + '">Corrigir</button></div>');
        }
        h.push("</div>");
      });
      h.push('<div class="formLinha" style="margin-top:11px">'
        + '<button class="btn claro pq" ' + ir({ tela: "pulso", aluna: c.aluna }) + ">Pulso dela</button>"
        + '<button class="btn claro pq" ' + ir({ tela: "chamada", turma: c.turma, data: D.turma(c.turma).aulas.filter(function (x) { return x.curto === c.aulaCurto; }).map(function (x) { return x.data; })[0] || "2026-11-16" })
        + ">Abrir a chamada desta aula</button></div>");
      h.push("</section>");
    });
    return h.join("");
  };

  // ══ 7 · A TURMA ═══════════════════════════════════════════════
  B.turmas = function (est) {
    var h = [];
    h.push('<div class="gradeCartoes">');
    D.TURMAS.forEach(function (t) {
      var prox = (t.aulas || []).filter(function (a) {
        return a.estado !== "dada"; }).slice(-1)[0] || t.aulas[0];
      h.push('<button class="cartaoTurma" ' + ir({ tela: "turma", turma: t.id, abaTurma: "geral" }) + ">"
        + '<span class="ctFaixa">' + esc(t.nivel) + "<span>" + esc(t.projeto) + "</span></span>"
        + '<span class="ctCorpo"><b>' + esc(t.quando) + "</b>"
        + '<span class="nota">' + t.alunas.length + " alunas · " + esc(t.modalidade) + "</span>"
        + '<span class="ctSessao">sessão ' + t.sessao + " de " + t.sessoes + " · " + esc(prox.titulo) + "</span>"
        + "</span></button>");
    });
    h.push("</div>");
    return h.join("");
  };

  B.turma = function (est) {
    var t = D.turma(est.turma || "basics");
    var aba = est.abaTurma || "geral";
    var ABAS = [["geral", "Visão geral"], ["alunas", "Alunas"], ["plano", "Plano das aulas"],
      ["chamadas", "Chamadas"], ["projeto", "Projeto"], ["materiais", "Materiais"],
      ["renovacao", "Renovação"]];
    var h = [];

    h.push('<div class="abas">');
    ABAS.forEach(function (x) {
      h.push('<button class="aba' + (aba === x[0] ? " on" : "") + '" '
        + ir({ tela: "turma", turma: t.id, abaTurma: x[0] }) + ">" + esc(x[1]) + "</button>");
    });
    h.push("</div>");

    if (aba === "geral") {
      h.push('<section class="cartao">' + cab(esc(t.nivel) + " · " + esc(t.quando), "", ""));
      h.push('<div class="grade3">'
        + B.numero(String(t.alunas.length), "alunas")
        + B.numero(t.sessao + "/" + t.sessoes, "sessões do ciclo")
        + B.numero(t.modalidade === "online" ? "online" : "presencial", t.local ? esc(t.local) : "onde acontece")
        + "</div>");
      h.push('<div class="nota" style="margin-top:10px"><b>projeto do ciclo:</b> ' + esc(t.projeto)
        + " · " + (D.PROJETO[t.id].entregues.length) + " de " + t.alunas.length + " entregaram</div>");
      h.push('<div class="formLinha" style="margin-top:11px">'
        + '<button class="btn pq" ' + ir({ tela: "chamada", turma: t.id, data: "2026-11-16" }) + ">Chamada de hoje</button>"
        + '<button class="btn claro pq" ' + ir({ tela: "plano", turma: t.id, data: "2026-11-16" }) + ">O plano da sessão</button>"
        + "</div></section>");
    }

    if (aba === "alunas") {
      h.push('<section class="cartao">' + cab("Alunas da turma", "", ""));
      t.alunas.forEach(function (n) {
        var p = D.PULSOS[n];
        var faltas = (t.aulas || []).filter(function (x) { return x.presencas[n] === "F"; }).length;
        h.push('<div class="linha"><span class="nome">' + esc(n) + "</span>"
          + '<span class="nota" style="margin:0;flex:none">' + (faltas ? faltas + " falta" + (faltas === 1 ? "" : "s") : "sem falta") + "</span>"
          + (p ? '<span class="selo ' + (p.nota >= 4 ? "ok" : p.nota >= 3 ? "alerta" : "erro") + '">pulso ' + p.nota + "/5</span>" : '<span class="selo neutro">sem pulso</span>')
          + '<button class="btn claro pq" ' + ir({ tela: "pulso", aluna: n }) + ">Abrir</button></div>");
      });
      h.push("</section>");
    }

    if (aba === "plano") h.push(B.plano({ tela: "turma", turma: t.id, data: "2026-11-16" }));

    if (aba === "chamadas") {
      h.push('<section class="cartao">' + cab("Chamadas desta turma", "", ""));
      (t.aulas || []).slice().reverse().forEach(function (a) {
        var faltas = Object.keys(a.presencas || {}).length;
        h.push('<div class="linha"><span class="data">' + esc(a.curto) + "</span>"
          + '<span class="tit">sessão ' + a.s + " · " + esc(a.titulo)
          + "<span>" + (a.estado === "dada" ? "salva · " + (t.alunas.length - faltas) + " presentes"
            : a.estado === "hoje" ? "é hoje" : "agendada") + "</span></span>"
          + '<button class="btn claro pq" ' + ir({ tela: "chamada", turma: t.id, data: a.data }) + ">Abrir</button></div>");
      });
      h.push("</section>");
    }

    if (aba === "projeto") {
      var pj = D.PROJETO[t.id];
      var pct = Math.round(pj.entregues.length / t.alunas.length * 100);
      h.push('<section class="cartao">' + cab(esc(pj.nome), "projeto do ciclo",
        '<span style="font-size:16px;font-weight:800">' + pj.entregues.length + "/" + t.alunas.length + "</span>"));
      h.push('<div class="barra"><span style="width:' + pct + '%"></span></div>');
      h.push('<div class="nota">Você marca a entrega ao receber o trabalho.</div>');
      t.alunas.forEach(function (n) {
        var ok = pj.entregues.indexOf(n) >= 0;
        h.push('<div class="linha"><span class="nome">' + esc(n) + "</span>"
          + '<button class="tar' + (ok ? " ok" : "") + '" data-proj="' + esc(t.id) + "|" + esc(n) + '">'
          + (ok ? "entregou" : "sem entrega") + "</button></div>");
      });
      h.push("</section>");
    }

    if (aba === "materiais") {
      h.push('<section class="cartao">' + cab("Links da turma", "", ""));
      t.links.forEach(function (m) {
        h.push('<div class="linha"><span class="nome">' + esc(m.label) + "</span>"
          + (m.link ? '<a class="btn claro pq" href="#" onclick="return false">Abrir</a>'
            : '<span class="nota" style="margin:0">sem link</span>') + "</div>");
      });
      h.push('<button class="btn claro pq" style="margin-top:10px">Editar os links</button></section>');

      h.push('<section class="cartao">' + cab("Apoio pedagógico", "", ""));
      h.push('<div class="formLinha"><select class="campo" style="flex:0 1 180px">'
        + "<option>Revisar aula</option><option>Planejar aula</option><option>Revisar material</option></select>"
        + '<input class="campo" style="flex:1" placeholder="Qual aula" />'
        + '<button class="btn pq">Solicitar</button></div>');
      D.APOIO.forEach(function (p) {
        h.push('<div class="linha"><span class="nome">' + esc(p.texto) + "</span>"
          + '<span class="selo neutro" style="color:' + p.cor + '">' + esc(p.estado) + "</span></div>");
      });
      h.push("</section>");
    }

    if (aba === "renovacao") {
      var r = t.renovacao;
      h.push('<section class="cartao">' + cab("Renovação do ciclo", "", ""));
      h.push('<div class="grade3">' + B.numero(String(r.sim), "continuam")
        + B.numero(String(r.nao), "não continuam", "erro")
        + B.numero(String(r.semResposta), "ainda não responderam") + "</div>");
      h.push('<div class="nota" style="margin-top:9px">É desta conta que sai a vaga do ciclo seguinte.</div>');
      h.push("</section>");
    }
    return h.join("");
  };

  // ══ 8 · CLUBES ════════════════════════════════════════════════
  B.clubes = function (est) {
    var h = [];
    h.push('<div class="gradeCartoes">');
    D.CLUBES.forEach(function (c) {
      var semTema = (c.encontros || []).filter(function (e) { return !e.tema; }).length;
      h.push('<button class="cartaoTurma" ' + ir({ tela: "clube", clube: c.id, abaClube: "pagina" }) + ">"
        + '<span class="ctFaixa">' + esc(c.emoji + " " + c.nome) + "<span>" + esc(c.preco) + "</span></span>"
        + '<span class="ctCorpo"><b>' + esc(c.quando) + "</b>"
        + '<span class="nota">' + c.inscritas + " de " + c.vagas + " vagas · " + esc(c.nivel) + "</span>"
        + '<span class="ctSessao">' + (semTema ? semTema + " encontro" + (semTema === 1 ? "" : "s") + " sem tema" : "encontros marcados")
        + "</span></span></button>");
    });
    h.push("</div>");
    return h.join("");
  };

  B.clube = function (est) {
    var c = D.clube(est.clube || "movie");
    var aba = est.abaClube || "pagina";
    var ABAS = [["pagina", "Página"], ["inscritas", "Inscritas e espera"],
      ["encontros", "Encontros"], ["forum", "Fórum"], ["material", "Material"]];
    var h = [];
    h.push('<div class="abas">');
    ABAS.forEach(function (x) {
      h.push('<button class="aba' + (aba === x[0] ? " on" : "") + '" '
        + ir({ tela: "clube", clube: c.id, abaClube: x[0] }) + ">" + esc(x[1]) + "</button>");
    });
    h.push("</div>");

    if (aba === "pagina") {
      h.push('<section class="cartao">' + cab(esc(c.emoji + " " + c.nome), "o que o site mostra",
        '<span class="selo ok">publicado</span>'));
      h.push('<div class="grade2">');
      h.push('<div><div class="rotulo">nível</div><input class="campo" value="' + esc(c.nivel) + '" />'
        + '<div class="rotulo" style="margin-top:10px">dia e hora</div><input class="campo" value="' + esc(c.quando) + '" />'
        + '<div class="rotulo" style="margin-top:10px">fuso de quem conduz</div><input class="campo" value="' + esc(c.fuso) + '" />'
        + '<div class="rotulo" style="margin-top:10px">preço no site</div><input class="campo" value="' + esc(c.preco) + '" />'
        + '<div class="rotulo" style="margin-top:10px">como você apresenta o clube</div>'
        + '<textarea class="campo" rows="3">' + esc(c.bio) + "</textarea></div>");
      h.push('<div><div class="rotulo">o cartão que a aluna vê</div>'
        + '<div class="previa"><b>' + esc(c.nome) + "</b>"
        + "<div>" + esc(c.bio) + "</div><div>" + esc(c.quando) + " · " + esc(c.fuso) + "</div>"
        + "<div>" + esc(c.preco) + "</div>"
        + '<div class="nota">' + (c.inscritas >= c.vagas ? "LOTADO" : (c.vagas - c.inscritas) + " vagas") + "</div></div></div>");
      h.push("</div>");
      h.push('<button class="btn pq" style="margin-top:12px">Salvar a página</button></section>');
    }

    if (aba === "inscritas") {
      h.push('<section class="cartao">' + cab("Inscritas · " + c.inscritas, "", ""));
      c.membros.forEach(function (n) {
        h.push('<div class="linha"><span class="nome">' + esc(n) + "</span>"
          + '<button class="btn claro pq">Tirar</button></div>');
      });
      h.push('<div class="rotulo" style="margin-top:14px">lista de espera</div>');
      if (!c.espera.length) h.push('<div class="nota">Ninguém esperando.</div>');
      c.espera.forEach(function (n) {
        h.push('<div class="linha"><span class="nome">' + esc(n) + "</span>"
          + '<button class="btn claro pq">Pôr no clube</button></div>');
      });
      h.push("</section>");
    }

    if (aba === "encontros") {
      h.push('<section class="cartao">' + cab("Encontros", "", ""));
      (c.encontros || []).forEach(function (e) {
        h.push('<div class="linha"><span class="data">' + esc(e.curto) + "</span>"
          + '<span class="tit">' + esc(e.tema || "— sem tema —") + "</span>"
          + '<span class="selo ' + (e.estado.indexOf("presentes") >= 0 ? "ok" : "alerta") + '">' + esc(e.estado) + "</span>"
          + '<button class="btn claro pq">Chamada</button></div>');
      });
      h.push('<div class="nota" style="margin-top:9px">A data e o tema de cada encontro se escrevem aqui. '
        + "Sem todas as datas, a página pública não publica.</div>");
      h.push("</section>");
    }

    if (aba === "forum") {
      h.push('<section class="cartao">' + cab("Fórum do clube", "", ""));
      h.push('<div class="formLinha"><input class="campo" style="flex:2" placeholder="Título da pergunta" />'
        + '<input class="campo" style="flex:3" placeholder="O que você quer perguntar ao grupo" />'
        + '<button class="btn pq">Publicar</button></div>');
      h.push('<div class="nota">O fórum é das alunas. A pergunta entre um encontro e outro parte de você.</div>');
      if (!c.forum.length) h.push('<div class="nota" style="margin-top:10px">Nada escrito ainda.</div>');
      c.forum.forEach(function (f) {
        h.push('<div class="topico"><div class="nota" style="margin:0"><b>' + esc(f.quem) + "</b> · " + esc(f.quando) + "</div>"
          + '<div style="font-size:14px;margin-top:3px">' + esc(f.texto) + "</div>");
        (f.respostas || []).forEach(function (r) {
          h.push('<div class="correcao"><b>' + esc(r.quem) + "</b> · " + esc(r.quando) + "<br>" + esc(r.texto) + "</div>");
        });
        h.push('<div class="formLinha"><input class="campo" placeholder="Responder" />'
          + '<button class="btn pq">Responder</button></div></div>');
      });
      h.push("</section>");
    }

    if (aba === "material") {
      h.push('<section class="cartao">' + cab("Material do clube", "", ""));
      if (!c.materiais.length) h.push('<div class="nota">Nenhum material ainda.</div>');
      c.materiais.forEach(function (m) {
        h.push('<div class="linha"><span class="nome">' + esc(m.titulo) + "</span>"
          + '<a class="btn claro pq" href="#" onclick="return false">Abrir</a></div>');
      });
      h.push('<div class="formLinha" style="margin-top:10px">'
        + '<input class="campo" style="flex:2" placeholder="Título" />'
        + '<input class="campo" style="flex:2" placeholder="Link" />'
        + '<button class="btn pq">Acrescentar</button></div></section>');
    }
    return h.join("");
  };

  // ══ 9 · PARTICULARES ══════════════════════════════════════════
  B.particulares = function (est) {
    var h = [];
    h.push('<div class="gradeCartoes">');
    D.PARTICULARES.forEach(function (p) {
      h.push('<button class="cartaoTurma" ' + ir({ tela: "particular", particular: p.nome }) + ">"
        + '<span class="ctFaixa">' + esc(p.nome) + "<span>" + esc(p.quando) + "</span></span>"
        + '<span class="ctCorpo"><b>' + esc(p.programa) + "</b>"
        + '<span class="nota">sessão ' + p.sessao + " de " + p.sessoes + " · próxima " + esc(p.proxima) + "</span>"
        + '<span class="ctSessao">' + esc(p.titulo) + "</span></span></button>");
    });
    h.push("</div>");
    return h.join("");
  };

  B.particular = function (est) {
    var p = D.particular(est.particular || D.PARTICULARES[0].nome);
    var h = [], pct = Math.round(p.sessao / p.sessoes * 100);
    h.push('<section class="cartao">' + cab(esc(p.nome), "aula particular · " + esc(p.quando),
      '<span style="font-size:12.5px;color:var(--tinta-fraca)">próxima: ' + esc(p.proxima) + "</span>"));
    h.push('<div class="nota"><b>programa:</b> ' + esc(p.programa) + "</div>");
    h.push('<div class="barra" style="margin-top:9px"><span style="width:' + pct + '%"></span></div>');
    h.push('<div class="nota">sessão ' + p.sessao + " de " + p.sessoes + "</div>");
    h.push('<div class="rotulo" style="margin-top:14px">a sessão desta aula</div>');
    h.push('<div style="font-size:16px;font-weight:700">' + esc(p.titulo) + "</div>");
    h.push('<div style="font-size:13.5px;line-height:1.6;margin-top:5px">' + esc(p.objetivo) + "</div>");
    h.push('<div style="margin-top:10px">' + p.palavras.map(function (w) {
      return '<span class="pal">' + esc(w) + "</span>"; }).join("") + "</div>");
    h.push('<div class="rotulo" style="margin-top:12px">tarefa de casa</div>');
    if (p.tarefa) h.push('<div style="font-size:13.5px;line-height:1.55">' + esc(p.tarefa) + "</div>");
    else h.push('<div class="aviso" style="margin:0">Esta sessão está sem tarefa de casa.</div>');
    h.push('<textarea class="campo" style="margin-top:8px" rows="2">' + esc(p.tarefa) + "</textarea>");
    h.push('<div class="formLinha" style="margin-top:11px">'
      + '<button class="btn pq">Salvar</button>'
      + '<button class="btn claro pq">Marcar a aula como dada</button>'
      + '<button class="btn claro pq">Remarcar</button></div>');
    h.push("</section>");
    return h.join("");
  };

  // ══ 10 · GRAVAÇÕES ════════════════════════════════════════════
  B.gravacoes = function (est) {
    var h = [], semLink = D.GRAVACOES.filter(function (g) { return !g.link; });
    h.push(B.marca("existe, fora do alcance",
      "A tela de gravações é de gestão: quem só dá aula volta ao painel. "
      + "Hoje a professora salva o link na chamada e nunca vê a lista."));
    if (semLink.length) h.push('<div class="aviso"><b>' + semLink.length + " aula"
      + (semLink.length === 1 ? "" : "s") + " sem gravação publicada.</b> "
      + semLink.map(function (g) { return esc(g.turma + " · " + g.curto); }).join(" · ") + "</div>");
    h.push('<section class="cartao liso">');
    D.GRAVACOES.forEach(function (g) {
      h.push('<div class="aulaLinha"><div class="topo">'
        + '<span class="data">' + esc(g.curto) + "</span>"
        + '<span class="tit">' + esc(g.turma) + " · sessão " + g.sessao
        + "<span>" + esc(g.titulo) + "</span></span>"
        + (g.link ? '<span class="selo ok">publicada</span><a class="btn claro pq" href="#" onclick="return false">Abrir</a>'
          : '<span class="selo alerta">sem link</span>')
        + "</div>"
        + (g.link ? "" : '<div class="formLinha" style="margin-top:9px">'
          + '<input class="campo" placeholder="Colar o link da gravação" />'
          + '<button class="btn pq">Publicar para a turma</button></div>')
        + "</div>");
    });
    h.push("</section>");
    return h.join("");
  };

  // ══ 11 · AS AULAS DO MÊS ══════════════════════════════════════
  // A contagem e a razão de cada aula ter entrado ou não. Sem valor
  // por aula e sem total: o que a professora precisa daqui é saber o
  // que corrigir antes de o mês fechar.
  B.horas = function (est) {
    var H = D.HORAS, h = [];
    var conta = function (e) {
      return H.linhas.filter(function (l) { return l.estado === e; }).length;
    };
    var contou = conta("contou"), fora = conta("não contou"), abertas = conta("hoje");

    h.push(B.marca("existe, fora do alcance",
      "A contagem é feita na Folha, que é de gestão. A professora cumpre a regra que decide "
      + "se a aula conta e não vê o resultado."));
    h.push('<section class="cartao">' + cab("Aulas do mês · " + esc(H.mes), "",
      '<span class="selo ' + (fora ? "alerta" : "ok") + '">' + contou + " de "
      + (contou + fora) + " contaram</span>"));
    h.push('<div class="grade3">' + B.numero(String(contou), "contaram")
      + B.numero(String(fora), "não contaram", fora ? "erro" : "")
      + B.numero(String(abertas), "ainda em aberto") + "</div>");
    h.push('<div class="nota" style="margin-top:9px">' + esc(H.fechamento) + "</div>");
    h.push('<div class="rotulo" style="margin-top:15px">aula por aula</div>');
    H.linhas.forEach(function (l) {
      var cls = l.estado === "contou" ? "ok" : l.estado === "hoje" ? "neutro" : "erro";
      h.push('<div style="padding:10px 0;border-bottom:1px solid var(--papel)">'
        + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
        + '<span class="data">' + esc(l.curto) + "</span>"
        + '<span class="tit">' + esc(l.turma) + "</span>"
        + '<span class="selo ' + cls + '">' + esc(l.estado) + "</span></div>"
        + (l.porque ? '<div class="nota" style="margin-top:4px">' + esc(l.porque) + "</div>" : "")
        + "</div>");
    });
    h.push("</section>");
    return h.join("");
  };

  // ══ 12 · SUBSTITUIÇÃO ═════════════════════════════════════════
  B.substituir = function (est) {
    var h = [], sel = est.subMotivo || "";
    h.push('<section class="cartao">' + cab("Pedir substituição", "", ""));
    h.push('<div class="rotulo">qual aula</div><div class="tira">');
    D.SEMANA.filter(function (s) { return !s.passada; }).forEach(function (s) {
      h.push('<button class="chip">' + esc(s.curto + " · " + s.rotulo) + "</button>");
    });
    h.push("</div>");
    h.push('<div class="rotulo" style="margin-top:12px">motivo</div><div class="tira">');
    D.SUB_MOTIVOS.forEach(function (m) {
      h.push('<button class="chip' + (sel === m ? " on" : "") + '" ' + ir({ subMotivo: m }) + ">" + esc(m) + "</button>");
    });
    h.push("</div>");
    h.push('<input class="campo" style="margin-top:12px" placeholder="Observação, se precisar" />');
    if (sel) h.push('<div class="aviso" style="margin-top:11px">Faltam menos de 48 h para a próxima aula. '
      + "O pedido vai para a escola marcado como urgente.</div>");
    h.push('<button class="btn" style="margin-top:12px">Enviar o pedido</button>');
    h.push("</section>");
    h.push('<section class="cartao">' + cab("Pedidos seus", "", ""));
    if (!D.SUBSTITUICOES.length) h.push('<div class="nota">Nenhum pedido.</div>');
    D.SUBSTITUICOES.forEach(function (s) {
      h.push('<div class="linha"><span class="data">' + esc(s.curto) + "</span>"
        + '<span class="tit">' + esc(s.turma) + "<span>" + esc(s.motivo) + "</span></span>"
        + '<span class="selo ok">' + esc(s.estado) + "</span></div>");
    });
    h.push("</section>");
    return h.join("");
  };

  // ══ 13 · PULSO DA ALUNA ═══════════════════════════════════════
  B.pulso = function (est) {
    var nome = est.aluna || "Marina Teste";
    var p = D.PULSOS[nome] || null, h = [];
    var daTurma = D.TURMAS.filter(function (t) { return t.alunas.indexOf(nome) >= 0; })[0];
    var cad = D.CADERNO.filter(function (c) { return c.aluna === nome; });

    h.push(B.marca("existe, fora do alcance",
      "O registro — nota de 1 a 5 e um comentário — mora em Acompanhamento, que é de gestão. "
      + "Quem vê a aluna toda semana é a professora."));

    h.push('<section class="cartao">' + cab(esc(nome), daTurma ? esc(daTurma.nivel + " · " + daTurma.quando) : "",
      p ? '<span class="selo ' + (p.nota >= 4 ? "ok" : p.nota >= 3 ? "alerta" : "erro") + '">pulso ' + p.nota + "/5 · " + esc(p.quando) + "</span>"
        : '<span class="selo neutro">sem pulso</span>'));
    if (p && p.comentario) h.push('<div class="correcao">' + esc(p.comentario) + "</div>");
    h.push('<div class="rotulo" style="margin-top:13px">como ela está indo</div>');
    h.push('<div class="tira">');
    [1, 2, 3, 4, 5].forEach(function (n) {
      h.push('<button class="chip' + (p && p.nota === n ? " on" : "") + '" data-pulso="'
        + esc(nome) + "|" + n + '">' + n + "</button>");
    });
    h.push("</div>");
    h.push('<textarea class="campo" style="margin-top:10px" rows="3" placeholder="O que você observou. Fica no histórico dela e a escola lê."></textarea>');
    h.push('<button class="btn pq" style="margin-top:10px">Registrar</button>');
    h.push("</section>");

    if (daTurma) {
      var faltas = (daTurma.aulas || []).filter(function (x) { return x.presencas[nome] === "F"; });
      var ent = (daTurma.aulas || []).filter(function (x) { return (x.entregues || []).indexOf(nome) >= 0; }).length;
      var dadas = (daTurma.aulas || []).filter(function (x) { return x.estado !== "agendada"; }).length;
      h.push('<section class="cartao">' + cab("O que o sistema já sabe dela", "", ""));
      h.push('<div class="grade3">'
        + B.numero(String(faltas.length), "faltas no ciclo", faltas.length ? "erro" : "")
        + B.numero(ent + "/" + dadas, "tarefas entregues")
        + B.numero(String(cad.length), "textos no caderno") + "</div>");
      if (cad.length) h.push('<button class="btn claro pq" style="margin-top:11px" '
        + ir({ tela: "cadernos", cadFiltro: "todas" }) + ">Ler o caderno dela</button>");
      h.push("</section>");
    }
    return h.join("");
  };

  B.esc = esc;
  B.ir = ir;
  B.cab = cab;
  return B;
})();
