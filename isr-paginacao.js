/* ════════════════════════════════════════════════════════════════
   ISR — paginação de lista
   ----------------------------------------------------------------
   Uma lista de 45 pessoas, ou de 300 parcelas, cabe na tela do jeito
   errado: rolar até o fim para achar alguém é pior do que virar
   página. Esta peça existe para que toda tela longa vire página do
   mesmo jeito — mesmo rodapé, mesmas palavras, mesmo comportamento.

   A tela faz uma chamada e recebe tudo pronto:

     var pg = ISRPaginacao.fatiar(lista, this.state.pagina,
                                  this.state.porPagina, ir);

   e devolve, para os campos do template:

     pg.itens      a fatia que se desenha agora
     pg.precisa    false quando tudo cabe numa página — aí o rodapé
                   nem aparece
     pg.resumo     "11–20 de 45"
     pg.botoes     « ‹ 1 2 3 › », cada um com a cor e o clique
     pg.opcoes     10 / 25 / 50 / todas, para o "mostrar por página"
     pg.onPorPagina

   `ir` é a função que a tela usa para guardar a página escolhida:
   normalmente `(n) => this.setState({ pagina: n })`.

   Duas regras que a tela não precisa lembrar:

   - filtrar a lista encolhe o total, e a página 4 de uma lista que
     agora tem 2 páginas não existe. `fatiar` devolve a última página
     válida em vez de uma tela vazia;
   - "todas" existe porque imprimir e conferir pedem a lista inteira.
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var PADRAO = 10;
  var OPCOES = [10, 25, 50, 0]; // 0 = todas

  // no máximo sete números: as pontas, a atual e as vizinhas dela.
  // O resto vira reticência, que não é botão.
  function numeros(atual, paginas) {
    if (paginas <= 7) {
      var todas = [];
      for (var i = 1; i <= paginas; i++) todas.push(i);
      return todas;
    }
    var out = [1];
    var ini = Math.max(2, atual - 1);
    var fim = Math.min(paginas - 1, atual + 1);
    if (ini > 2) out.push("…");
    for (var j = ini; j <= fim; j++) out.push(j);
    if (fim < paginas - 1) out.push("…");
    out.push(paginas);
    return out;
  }

  function fatiar(lista, pagina, porPagina, ir) {
    var itens = lista || [];
    var total = itens.length;
    var n = porPagina === 0 ? 0 : (parseInt(porPagina, 10) || PADRAO);
    var paginas = n === 0 ? 1 : Math.max(1, Math.ceil(total / n));
    var atual = Math.min(Math.max(1, parseInt(pagina, 10) || 1), paginas);
    var de = n === 0 ? 0 : (atual - 1) * n;
    var ate = n === 0 ? total : Math.min(total, de + n);
    var vai = typeof ir === "function" ? ir : function () {};

    var botoes = [];
    function botao(label, destino, ligado, atualQ) {
      botoes.push({
        label: String(label),
        onClick: ligado ? (function (d) { return function () { vai(d); }; })(destino) : function () {},
        bg: atualQ ? "#164951" : "#fff",
        fg: atualQ ? "#fff" : (ligado ? "#164951" : "#c9c1b6"),
        cursor: ligado ? "pointer" : "default"
      });
    }

    if (n !== 0 && paginas > 1) {
      botao("«", 1, atual > 1, false);
      botao("‹", atual - 1, atual > 1, false);
      numeros(atual, paginas).forEach(function (x) {
        if (x === "…") botao("…", atual, false, false);
        else botao(x, x, true, x === atual);
      });
      botao("›", atual + 1, atual < paginas, false);
      botao("»", paginas, atual < paginas, false);
    }

    return {
      itens: n === 0 ? itens.slice() : itens.slice(de, ate),
      pagina: atual,
      paginas: paginas,
      total: total,
      // o rodapé some quando não há o que paginar: uma lista de três
      // linhas com controle de página é ruído
      precisa: total > 0 && (n === 0 ? total > PADRAO : paginas > 1),
      resumo: total === 0 ? "nenhum item"
        : (n === 0 ? ("todos os " + total)
          : ((de + 1) + "–" + ate + " de " + total)),
      botoes: botoes,
      opcoes: OPCOES.map(function (o) {
        return { id: String(o), label: o === 0 ? "todas" : String(o),
          sel: String(o) === String(n) };
      }),
      onPorPagina: function (e) {
        var v = parseInt(e.target.value, 10) || 0;
        vai(1, v);
      }
    };
  }

  window.ISRPaginacao = { fatiar: fatiar, PADRAO: PADRAO, OPCOES: OPCOES };
})();
