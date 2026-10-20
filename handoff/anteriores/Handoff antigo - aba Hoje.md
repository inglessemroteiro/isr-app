1	# Handoff: Painel do professor › aba Hoje
2	
3	## Overview
4	Este documento descreve o layout novo da aba **Hoje** do Painel do professor (app de gestão do Inglês sem Roteiro). A aba Hoje responde a uma pergunta: **"o que eu faço agora?"**. Tudo o mais fica abaixo, em ordem de urgência.
5	
6	## About the Design Files
7	`ISR Gestao v5.dc.html` é um **protótipo em HTML**, uma referência de visual e comportamento. **Não é código para copiar.** Ele usa uma sintaxe de template própria (`<sc-if>`, `<sc-for>`, `{{ }}`) e dados fictícios.
8	
9	A tarefa é **recriar este layout no app que já existe** (`inglessemroteiro.netlify.app`, arquivo `ISR - Painel v3.dc.html`), mantendo:
10	- a camada de dados real (alunas, turmas, chamadas, sincronização);
11	- a sidebar, o seletor "vendo como" e as abas Hoje / Minhas turmas / Particulares / Clubes, que já existem;
12	- toda a lógica de permissões.
13	
14	**Só a ordem, a hierarquia e o visual da aba Hoje mudam.** Não importe os dados fictícios do protótipo.
15	
16	O trecho que importa no protótipo fica no bloco `<!-- PROFESSOR -->`, dentro de `<sc-if value="{{ ptHoje }}">`.
17	
18	## Fidelity
19	**High-fidelity.** Cores, tipografia, raios e espaçamentos são os finais e seguem o design system ISR.
20	
21	## Screen: aba Hoje (de cima para baixo)
22	
23	Coluna única com `gap: 20px`. Os blocos 2 a 4 são linhas `display:flex; flex-wrap:wrap; gap:20px`. Cada cartão nessas linhas usa `flex: 1 1 320px; min-width: 0`.
24	
25	### 1. Hero: uma única ação principal (substitui o hero atual E o bloco amarelo "Aulas sem chamada")
26	Cartão escuro com `background #164951`, texto `#fff`, `border-radius 24px`, `padding 24px`, coluna com `gap 16px`.
27	- Eyebrow: 12px, peso 700, cor `#fc9082`.
28	- Título: 28px, peso 800, `letter-spacing -0.035em`.
29	- Pills de status: 12px, peso 800, `padding 6px 12px`, `radius 999px`, texto `#164951`. Fundo `#9ec970` quando está ok e `#fdf3d6` quando falta algo.
30	- Botão principal: fundo `#fc9082`, texto `#164951`, 15px, peso 800, `padding 13px 22px`, `radius 999px`, `box-shadow 0 3px 0 #d9675a`.
31	- Botões secundários: fundo `rgba(255,255,255,.12)`, texto `#fff`, 14px, peso 800, `padding 12px 18px`.
32	
33	**O conteúdo do hero segue a primeira regra verdadeira desta lista (só um estado por vez):**
34	
35	| # | Condição | Eyebrow | Título | Botão principal | Secundários |
36	|---|---|---|---|---|---|
37	| A | Aula acontecendo agora ou ainda hoje | `próxima aula · hoje HH:MM · <turma>` | `Session N · <tema>` | ▶ Começar aula | Ver plano · Fazer chamada |
38	| B | Existem aulas que já aconteceram sem chamada | `N aulas sem chamada` (a contagem vai no eyebrow) | `Faça a chamada de DD/MM · <turma>` (a mais antiga) | Fazer chamada | Ver todas (abre a lista) |
39	| C | Próxima aula dentro de 7 dias | `próxima aula · <dia> HH:MM` | `Session N · <tema>` | Ver plano | Preparar slides |
40	| D | Nada disso | `sem aula marcada` | `Nenhuma aula nos próximos 7 dias` | — | Chamada de outra data |
41	
42	O bloco amarelo "Aulas sem chamada" **deixa de existir** como cartão separado e passa a ser o estado B do hero. Com isso, "17 aulas sem chamada" aparece em um só lugar.
43	
44	### 2. Linha "agora": Agenda de hoje | Fila pedagógica
45	Os dois cartões são brancos: `background #fff`, `radius 24px`, `padding 20px 22px`, coluna com `gap 12px`.
46	- **Agenda de hoje · <dia dd mmm>**: título 16px, peso 800. Cada linha tem `padding 10px 0` e `border-bottom 1px solid #f2ebe3`, com o horário em negrito (min-width 48px), a descrição (14px) e uma pill de status (11px, peso 800). A linha toda é clicável. Se o dia estiver vazio, mostre "Nada na agenda hoje.".
47	- **Fila pedagógica · N**: cada item tem emoji, título como link (`#348a8e`, sublinhado), motivo (13px, `#1d5a63`) e botão de ação escuro (`#164951`, radius 999px). Se a fila estiver vazia, mostre "Nenhuma pendência pedagógica." **Não inclua** a frase explicativa longa.
48	
49	### 3. Rótulo "seu mês" + linha
50	Rótulo: 13px, peso 700, cor `#6b5749`, minúsculas, `margin-top 8px`.
51	- **Entregas do mês · <mês>**: métricas lado a lado, cada uma com `flex 1 1 110px`. O número é 24px, peso 800, `letter-spacing -0.03em`; a legenda é 12px, peso 700, `#6b5749`. Use `#a3392c` no número só quando ele indicar problema (ex.: aulas sem chamada > 0). **Não inclua** o parágrafo explicativo embaixo.
52	- **Projeto <nome> · entregas**: valor `x/y` à direita; barra de 10px com fundo `#f2ebe3` e preenchimento `#9ec970`; embaixo, "Faltam: nomes" (13px).
53	- **Turmas atribuídas**: lista com o nome em negrito e `N/M vagas →` em `#348a8e`. Clicar abre a turma.
54	
55	### 4. Rótulo "substituições" + cartão
56	Botão "Pedir substituição". Ao clicar, o formulário abre no próprio cartão com: aula (pills), motivo (pills), observação (campo de texto) e o aviso `#fde4df` quando faltar menos de 24h. Abaixo vem a lista dos pedidos, cada um com seu status.
57	
58	### Topo da página (já existe, só ajustar)
59	O botão "+ Aula extra" fica à direita do título. As abas usam pills com `radius 999px`: a ativa tem fundo `#164951` e texto branco; as inativas não têm fundo.
60	
61	## Interactions
62	- Começar aula muda para o modo "em aula" (já existe no app).
63	- Fazer chamada abre a chamada daquela aula específica.
64	- Ver plano abre o plano da sessão em modo leitura.
65	- Botões: no hover sobem 3px e a sombra cresce; no clique afundam 4px. Transição de 150–200ms, ease-out.
66	
67	## Design Tokens
68	- `#164951` texto / fundo escuro · `#1d5a63` texto de apoio · `#348a8e` links · `#fc9082` destaque · `#9ec970` positivo
69	- `#6b5749` rótulos · `#f2ebe3` fundo da página e divisórias · `#fff` cartões · `#fdf3d6` atenção · `#fde4df` / `#a3392c` alerta
70	- Fonte Inter. Títulos de cartão 16px/800; hero 28px/800; texto 14px/400–600; rótulos 12–13px/700
71	- Raios: 24px cartões, 999px botões e pills
72	- Gaps: 20px entre blocos, 12px dentro dos cartões
73	
74	## Files
75	- `ISR Gestao v5.dc.html`: protótipo completo. Use apenas o bloco `<!-- PROFESSOR -->` › `ptHoje` como referência.
76
