// Ícones oficiais do Inglês sem Roteiro.
//
// Regras do set (não mexer sem passar pelo design):
//   grid          24×24, com 2px de área segura nas bordas
//   traço         1.8px, cap e join redondos
//   cor           o SVG usa currentColor — quem pinta é o container,
//                 com token: teal no ativo, #b3a89d no inativo
//   tamanhos      20 · 22 (navegação) · 24 · 30 (moeda no card)
//   preenchimento nenhum: stroke puro, sempre
//
// O pin do monograma ISR é logo, não ícone de interface.

(function () {
  var CAMINHOS = {
  inicio: "<path d=\"M3 11l9-8 9 8\"></path><path d=\"M5 10v10h14V10\"></path>",
  aulas: "<rect x=\"2.8\" y=\"4.2\" width=\"18.4\" height=\"12.4\" rx=\"2.2\"></rect><path d=\"M8.5 20.2h7\"></path><path d=\"M12 16.6v3.6\"></path>",
  flin: "<path d=\"M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z\"></path>",
  chat: "<path d=\"M21 12a8 8 0 0 1-11.5 7.2L4 20l.8-5.5A8 8 0 1 1 21 12z\"></path>",
  comunidade: "<circle cx=\"9\" cy=\"8\" r=\"3.2\"></circle><path d=\"M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5\"></path><path d=\"M16 5.5a3.2 3.2 0 0 1 0 6\"></path><path d=\"M17.5 14.8c2.1.7 3.5 2.6 3.5 5.2\"></path>",
  miles: "<path d=\"M15.6 4.6a8.5 8.5 0 0 0-8.6 14.6\"></path><circle cx=\"13.5\" cy=\"13.5\" r=\"7.5\"></circle><path d=\"M15.8 11.2a2.6 2.6 0 0 0-2.3-1.2c-1.3 0-2.2.7-2.2 1.7 0 2.2 4.5 1.3 4.5 3.5 0 1-.9 1.8-2.3 1.8a2.6 2.6 0 0 1-2.3-1.2\"></path><path d=\"M13.5 8.6v1.4M13.5 17v1.4\"></path>",
  certificado: "<circle cx=\"12\" cy=\"9\" r=\"5.5\"></circle><path d=\"M8.5 13.8L7 21l5-2.4L17 21l-1.5-7.2\"></path>",
  notificacao: "<path d=\"M18 8.5a6 6 0 1 0-12 0c0 5.2-2 6.8-2 6.8h16s-2-1.6-2-6.8z\"></path><path d=\"M10.3 19a2 2 0 0 0 3.4 0\"></path>",
  calendario: "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2.5\"></rect><path d=\"M3.5 9.8h17\"></path><path d=\"M8 3v4\"></path><path d=\"M16 3v4\"></path>",
  professor: "<path d=\"M12 3.5L21 7l-9 3.5L3 7z\"></path><path d=\"M6.5 9v5.2c0 1.7 2.5 2.8 5.5 2.8s5.5-1.1 5.5-2.8V9\"></path><path d=\"M21 7v5.5\"></path>",
  tarefa: "<rect x=\"5\" y=\"4.5\" width=\"14\" height=\"16\" rx=\"2.2\"></rect><path d=\"M9 4.5V3.2A1.2 1.2 0 0 1 10.2 2h3.6A1.2 1.2 0 0 1 15 3.2v1.3z\"></path><path d=\"M9 12.5l2 2 4-4\"></path>",
  concluido: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M8.2 12.3l2.6 2.6 5-5.2\"></path>",
  pin: "<path d=\"M12 2.5c-3.6 0-6.5 2.9-6.5 6.5 0 4.6 6.5 12.5 6.5 12.5s6.5-7.9 6.5-12.5c0-3.6-2.9-6.5-6.5-6.5z\"></path><circle cx=\"12\" cy=\"9\" r=\"2.6\"></circle>",
  aoVivo: "<rect x=\"2.5\" y=\"5.5\" width=\"13\" height=\"13\" rx=\"2.4\"></rect><path d=\"M15.5 10.5L21.5 7v10l-6-3.5z\"></path>",
  perfil: "<circle cx=\"12\" cy=\"8.2\" r=\"3.6\"></circle><path d=\"M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5\"></path>",
  config: "<circle cx=\"12\" cy=\"12\" r=\"3\"></circle><path d=\"M19.1 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.3a1.8 1.8 0 1 1-3.6 0V20a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9H4a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3H9.7a1.5 1.5 0 0 0 .9-1.4V4a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.3a1.8 1.8 0 1 1 0 3.6H20a1.5 1.5 0 0 0-1.4.9z\"></path>",
  };

  // Devolve o SVG pronto. A cor vem de fora, por currentColor.
  function icone(nome, tamanho) {
    var d = CAMINHOS[nome];
    if (!d) return "";
    var s = tamanho || 24;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
      + 'stroke-linejoin="round" aria-hidden="true" style="display:block">' + d + '</svg>';
  }

  window.ISR_ICONES = { caminhos: CAMINHOS, icone: icone, nomes: Object.keys(CAMINHOS) };
})();
