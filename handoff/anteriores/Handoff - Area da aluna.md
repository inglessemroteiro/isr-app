1	# Handoff: Área da aluna (Student Portal)
2	
3	## Overview
4	App da aluna do Inglês sem Roteiro. A aluna entra na aula ao vivo, faz o caderno e o homework, revisa palavras, participa dos clubes, troca recados com as colegas e usa os miles. A interface fica **em inglês** por padrão, com um seletor EN/PT no topo.
5	
6	## About the Design Files
7	`Student Portal v3.dc.html` é um **protótipo em HTML**, uma referência de visual e comportamento. **Não é código para copiar.** Ele usa uma sintaxe de template própria (`<sc-if>`, `<sc-for>`, `{{ }}`) e todos os dados são fictícios (Marianne, Tutor Dave, Book Club…).
8	
9	A tarefa é **recriar estas telas no app que já existe**, mantendo:
10	- login, autenticação e banco de dados reais;
11	- a sincronização com o app de gestão (o protótipo simula isso com `localStorage`: a chave `isr-demo-sync` é escrita pela gestão e lida pela aluna; no app real isso vem do backend);
12	- as regras de negócio que já existem.
13	
14	Mude **uma tela por vez**, na ordem da seção "Ordem sugerida". O protótipo marca cada tela com um comentário: `<!-- HOME -->`, `<!-- NOTEBOOK -->` etc.
15	
16	## Fidelity
17	**High-fidelity.** Cores, tipografia, raios e espaçamentos são os finais e seguem o design system ISR.
18	
19	## Estrutura geral (todas as telas)
20	
21	**Desktop (≥ 900px):** sidebar fixa à esquerda + conteúdo principal.
22	- Sidebar: `240px`, fundo `#164951`, texto branco, `padding 22px 16px`, `position: sticky; height: 100vh`. De cima para baixo:
23	  1. logo branco;
24	  2. avatar de 44px com nome e "Nível · formato" (clique abre o perfil);
25	  3. navegação agrupada;
26	  4. no fim, o cartão "isr miles" (fundo `rgba(255,255,255,.08)`, `radius 16px`, número 22px/800; clique abre a loja);
27	  5. "Log out".
28	- Navegação, com rótulos de grupo de 11px/700 em `#fc9082`:
29	  - (sem rótulo) Home
30	  - **study**: Notebook, Review
31	  - **community**: Clubs, Profile
32	  - **me**: Progress, Shop, Account
33	  - Item: `padding 9px 12px`, `radius 12px`, 14px/600. O ativo tem fundo `rgba(255,255,255,.12)`. Badge opcional à direita em `#fc9082`.
34	
35	**Mobile (< 900px):** sem sidebar. Barra inferior com 4 abas: Home ⌂, Study ✎, Community ◎, Me ◉. No topo, uma pill com o saldo de miles.
36	
37	**Cabeçalho do conteúdo:** eyebrow 12px/700 `#6b5749` + título h1 800, `letter-spacing -0.035em`. À direita ficam a busca (só no desktop), o seletor EN/PT e o sino de notificações (40px, com contador coral).
38	
39	**Subabas:** quando o grupo tem mais de uma tela (ex.: Notebook | Review), aparece uma barra de pills logo abaixo do título. A barra tem fundo `#fff`, `padding 6px` e `radius 999px`; a pill ativa tem fundo `#164951` e texto branco.
40	
41	**Conteúdo:** fundo da página `#f2ebe3`, coluna com `gap 22px`, cartões brancos com `radius 24px` e `padding 22px 24px`. As linhas de cartões usam `display:flex; flex-wrap:wrap; gap:22px`, com cada cartão em `flex:1 1 280–320px; min-width:0`.
42	
43	## Telas
44	
45	### 1. Home ("Olá, Marianne!")
46	1. **Hero da próxima aula** (fundo `#164951`, `radius 24px`, `padding 26px 28px`): eyebrow coral, título 24px/800 "Projeto · Session N", linha "professor · dia hora · plataforma". À direita, o CTA coral "Join live room" e o link sublinhado "Open my notebook".
47	2. **This week**: título 18px/800 e contador "x of y done" à direita. Barra de progresso de 8px (`#9ec970` sobre `#f2ebe3`). Depois, uma lista de tarefas da semana (aula ao vivo, homework, revisão do dia, encontro de clube). Cada linha tem uma bolinha de 34px (✓ verde quando feita), título 15px/800, subtítulo 13px e uma pill de status à direita. A linha inteira leva à tela correspondente.
48	3. **Linha de 3 cartões:** "my progress" (nível + metas "I can…" em barras segmentadas) · "School feed" (avatar com inicial, nome, quando e texto) · "last class recording" (ícone ▷, título, duração).
49	
50	### 2. Notebook (caderno da aula)
51	- **Faixa de sessões:** pills roláveis na horizontal, `min-width 92px`, `radius 16px`, com "S4 · 14 Oct" e o status. A sessão atual tem borda de 2px.
52	- **Sessão atual:**
53	  - pill "live now / starts 19:00";
54	  - hero escuro "🎯 today you will…" com o objetivo em 24px/800;
55	  - cartões "Class slides" e "Class recording";
56	  - cartões de apoio (words / sentence starters) com pills coloridas;
57	  - aviso 🔒 "Class activities open at 19:00" enquanto a aula não começou;
58	  - tarefas, uma por cartão: passo, enunciado 17px/700, textarea (`#f5f5f0`, `radius 14px`), botões ● Record e + Photo;
59	  - durante a aula, área para enviar foto e o botão "Add 5 words to my Review Vault" (+20 miles);
60	  - cartão de homework com borda colorida conforme o status.
61	- **Sessão passada:** pill "✓ class done · read only", hero com os botões Slides e "▶ Watch recording", "my answers in class" em modo leitura, homework (com textarea e botão "Send to …" se ainda estiver aberto) e as palavras da aula.
62	- **Bloqueio:** se o homework anterior não foi entregue, aparece uma faixa `#fdf3d6` no topo com o link para ele.
63	
64	### 3. Review
65	Coluna central com `max-width 720px`.
66	- **Intro:** hero escuro (`radius 32px`) "today's review · about 5 min" + "Ready for today's words?" + botão coral.
67	- **Em andamento:** barra de passos no topo + ✕ para pausar. Os passos são:
68	  - flashcards (cartão de 240px de altura que vira ao clicar; botões Not yet / Almost / Yes!);
69	  - montar frases (chips para pôr em ordem);
70	  - listening (▶ coral, 🐢 slower, múltipla escolha, transcrição depois de responder);
71	  - speaking (gravar + 🔊 resposta modelo).
72	- **Fim:** "✓ done for today · +15 miles", "See you tomorrow.", botão "See my words →".
73	- **My words:** contadores do vault, palavras agrupadas por aula, "my own words" (formulário com palavra, significado e exemplo) e "how review works".
74	
75	### 4. Clubs
76	Subabas "My clubs" | "All clubs".
77	- **My clubs:**
78	  - pills para escolher o clube;
79	  - cartão escuro com emoji, nome, "with professor · horário", os 4 encontros (data, tema, tag) e o CTA "Join live meeting";
80	  - cartão "reference material" (só aparece se o professor anexou algo);
81	  - fórum com posts, respostas e **respostas em áudio** (gravar → Stop & send; player com barra de progresso).
82	- **All clubs:**
83	  - aviso "Each club has 4 live meetings per cycle. Your plan includes 2 clubs… 3rd club €50";
84	  - grade de cartões (`minmax(250px,1fr)`). Cada cartão tem emoji, pill de **nível** (`#e8f5dd`: All levels / A1 and up / A2 and up / B1 and up / B2 and up), pill "New" coral quando o clube é novo, nome, descrição, professor, horário, membros e local, o link "See dates and details →" e o botão Join.
85	- **Detalhe do clube:**
86	  - hero escuro (`radius 40px`) com pills de formato e nível, nome em 34–56px, descrição, botão Join e preço/vagas, fatos em mini-cartões e a foto do professor à direita;
87	  - abaixo, duas colunas: "4 meetings" (dia em bloco + tema) e "about your teacher" | preço com barra de vagas e Join, depois "where we meet" (endereço + Google Maps, ou "Online, on Google Meet").
88	- **Regras:**
89	  - o que o professor publica ou edita na gestão (nome, descrição, nível, datas, temas, vagas, local, bio) aparece aqui;
90	  - clubes publicados entram no catálogo com a tag "New";
91	  - entrar num 3º clube passa pelo pagamento extra.
92	
93	### 5. Profile
94	- Faixa `#e5f2f6` explicando a diferença entre 💬 Scrap (recado público imediato) e ⭐ Testimonial (só aparece se a pessoa aceitar).
95	- **Coluna esquerda:** foto de 120px com o botão "📷 Change", nome, meta, 🎂 aniversário, bio e atributos com estrelas. As colegas votam nos atributos, mas só no perfil de outra pessoa.
96	- **Coluna direita:** Scraps (campo + Post + lista) e Testimonials. Um depoimento pendente aparece com "Accept · +15 miles" / "Not now". No perfil de uma colega, aparece o campo para escrever um depoimento.
97	
98	### 6. Progress
99	Hero escuro com nível e próximo passo · 4 cartões de números · metas "I can…" do projeto (✓ / em andamento / a fazer) · barra de presença por sessão · projetos passados com link para o certificado.
100	
101	### 7. Shop (miles)
102	Subabas "School rewards" | "Swap & sell" + pill escura com o saldo à direita.
103	- **School rewards:** grade de cartões com emoji, nome, custo e botão Redeem (fica desabilitado sem saldo; depois do resgate mostra "Redeemed"). Embaixo, como ganhar miles.
104	  - **Ao resgatar, os miles saem do saldo na hora.** Se a escola cancelar o resgate na gestão, os miles voltam e a aluna recebe um aviso.
105	  - Só aparecem as recompensas marcadas como visíveis na gestão.
106	- **Swap & sell:** filtros (All, Swap, Sell, Miles, Services, My listings), botão "+ New listing" e grade de anúncios com paginação. Nos anúncios das outras, o botão é "Message"; nos próprios, "Edit" e "Mark sold". Anúncios ocultados ou apagados pela escola não aparecem.
107	- **Ajuste manual de miles pela escola:** a aluna recebe uma notificação com o motivo ("The school added 50 miles · Evento da escola").
108	
109	### 8. Account
110	Presença (grade de quadrados por sessão: verde presente, amarelo justificada, vermelho falta, branco a vir; regra dos 75%; enviar atestado) · Financeiro (cartão salvo, faturas com PDF, contrato) · Configurações (toggles + links para editar perfil e trocar senha).
111	
112	## Interactions & Behavior
113	- Botões principais: hover sobe 3px (`translateY(-3px)`), clique afunda (`translateY(2px)`). Sombra sólida embaixo: `0 4px 0 #0e3339` nos escuros e `0 4px 0 #d9675a` nos corais. Transição de 150–200ms, ease-out.
114	- Toasts curtos confirmam as ações que dão miles ("Homework sent · +15 miles").
115	- O seletor EN/PT troca os rótulos da interface. O conteúdo das aulas continua em inglês.
116	- Respeitar `prefers-reduced-motion`.
117	
118	## Sincronização com a gestão (implementar no backend)
119	| Gestão faz | A aluna vê |
120	|---|---|
121	| Professor edita ou publica um clube | Catálogo e detalhe atualizados; "New" no clube novo |
122	| Professor anexa material ao clube | Cartão "reference material" |
123	| Escola cria, edita ou oculta uma recompensa | Lista de School rewards |
124	| Escola edita, oculta ou apaga um anúncio | Swap & sell |
125	| Escola ajusta miles | Saldo novo + notificação com o motivo |
126	| Escola cancela um resgate | Miles devolvidos + recompensa liberada de novo |
127	
128	## Design Tokens
129	- `#164951` texto / fundo escuro · `#1d5a63` texto de apoio · `#348a8e` links · `#fc9082` destaque/CTA no escuro · `#d9675a` sombra coral
130	- `#9ec970` positivo · `#e8f5dd` tint verde · `#e5f2f6` tint azul · `#fdf3d6` atenção · `#fde4df` tint coral
131	- `#6b5749` rótulos · `#e2c8b5` borda de input · `#f2ebe3` fundo da página · `#f5f5f0` fundo de campos · `#fff` cartões
132	- Fonte Inter. Títulos 800 com `letter-spacing` de −0.035 a −0.045em; texto 14–16px com entrelinha 1.5; rótulos 11–12px/700 em minúsculas
133	- Raios: 12–16px pequenos · 20–28px cartões · 32–40px heroes · 999px botões e pills
134	
135	## Assets
136	- `assets/ISR_logo_primary.png` (login) e `assets/ISR_logo_white.png` (sidebar), do design system ISR.
137	- Foto do professor no detalhe do clube: espaço reservado para a foto real.
138	
139	## Ordem sugerida (uma tela por sessão do Claude Code)
140	1. Estrutura geral (sidebar, cabeçalho, barra inferior no mobile)
141	2. Home
142	3. Notebook
143	4. Clubs (+ sincronização com a gestão)
144	5. Shop (+ sincronização de miles)
145	6. Review
146	7. Profile, Progress, Account
147	
148	## Files
149	- `Student Portal v3.dc.html`: protótipo completo (referência visual; procure os comentários `<!-- HOME -->`, `<!-- CLUBS -->` etc.).
150
