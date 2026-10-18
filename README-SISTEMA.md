# ISR — Sistema da Escola · Guia de Telas (para revisão de UX)

**Produto:** Sistema de gestão do Inglês sem Roteiro (CRM, cobrança, pedagógico e marketing)
**Stack:** telas HTML (framework DC) + Netlify + Google Apps Script/Planilhas
**Estado:** em uso, com o banco central no Google Apps Script; a base de demonstração no navegador (localStorage) fica para testar
**Última atualização:** Outubro 2026

---

## Duas áreas, dados diferentes

O sistema tem **duas** áreas, e elas não se misturam:

| | Área de Gestão | Área da Aluna |
|---|---|---|
| quem entra | a equipe, por `gestao.html` (Netlify Identity) | a aluna, pelo endereço dela |
| telas | tudo o que começa com `ISR - ` e não está na lista aberta | `/aluna.html` → `ISR - Aluna v4.dc.html` |
| desenho | `ISR Gestao v4` (barra lateral fixa, `isr-shell.js`) | `Student Portal v3` (barra lateral no monitor, barra de baixo no celular) |

A separação é feita em **um lugar só**, no `crm-data.js`: a lista
`ABERTAS` diz quais telas são da aluna. Tudo o mais que comece com
`ISR - ` é gestão, e quem não tem sessão da equipe é mandado para o
`gestao.html`.

**O que cada área lê.** A camada de dados é a mesma (`crm-data.js`,
uma base só), mas as funções não se cruzam:

- **da aluna** — `getPessoa`, `progressoDaAluna`, `progressoCiclo`,
  `certificadoDaAluna`, `horasDaAluna`, `jornadaDaAluna`,
  `presencasDe`, `tarefasDeCasa`, `agendaItens` (filtrada pela turma
  dela), `clubesParaAluna`/`clubeEntrar`/`clubeSair`,
  `gravacoesParaAluna`, `moedasDe`/`recompensasDaAluna`,
  `contratoVigente`, `rsvpEvento`, `registrarPulso`,
  `programaDaAluna` e `trilhaDesafio`;
- **da gestão** — `filaParaHoje`, `alunasPainel`, `ocupacaoTurmas`,
  `cobrancaResumo`, `folhaDoMes`, `getLeads`, `funilResumo`,
  `equipeLista`, `matriculasDoCiclo`, `chamadasPendentesPorProfessora`,
  `salvarChamada`, `clubesResumo`, `abrirCiclo` e as demais.

O teste `test-aluna-v4.js` falha se uma função de gestão aparecer na
tela da aluna.

---

## Mapa de navegação

```
index.html → Login (Magic Link) → Área da aluna / Painel do professor

gestao.html  (entrada da equipe: e-mail e senha pelo Netlify Identity)
└── a barra lateral fixa, em isr-shell.js, leva a todas as telas
    conforme o papel de quem entrou
```

A lista completa das telas, com o nome do arquivo e o endereço curto de
cada uma, está em **"As telas, no desenho novo"**, no fim deste
arquivo. A barra lateral é a navegação: não há mais botão "⌂ Central"
no topo de cada tela.

As seções 1 a 6 abaixo descrevem o que cada tela faz e por quê. Foram
escritas antes do redesenho, então as cores e as medidas que elas citam
são as de antes; o que a tela resolve continua valendo.

---

## 1. HOME — `ISR - Central v3.dc.html`

Fundo teal escuro (#164951). É o "bom dia" da gestora: o que precisa de atenção + as 4 áreas.

**Seções, de cima para baixo:**

1. **Cabeçalho** — eyebrow "INGLÊS SEM ROTEIRO", título "Central do Sistema", subtítulo.
2. **Alertas do dia** (aparecem só quando existem):
   - `🎯 N leads precisam de atenção hoje (follow-up ou inscrição incompleta)` → clique leva ao CRM
   - `⚠️ N parcelas atrasadas para cobrar` → clique leva à Cobrança
   - Cada alerta é um cartão translúcido inteiro clicável, com "abrir →" à direita.
3. **4 cards de área** (grid responsivo, 1 card por pilar). Cada card tem:
   - Faixa colorida no topo com nome da área (Comercial coral #e07856 · Gestão teal #2a9d8f · Pedagógico roxo #6b5b95 · Marketing caramelo #d4a574)
   - **2 indicadores grandes** (ex.: Comercial → "para hoje" e "matriculadas"; Gestão → "a receber (R$)" e "atrasadas"; Pedagógico → "turmas ativas" e "professoras"; Marketing → "leads registrados" e "conversão")
   - **2 botões-link** (linhas com "→") para as telas da área

**Botões da Central:**

| Botão | Ação |
|---|---|
| Cartão de alerta | Abre a tela relacionada (CRM ou Cobrança) |
| "CRM · Funil de leads" | Abre o CRM |
| "Mensagens WhatsApp" | Abre mensagens prontas |
| "Cobrança & renovações" | Abre Cobrança |
| "App do aluno (dados reais)" | Abre o app do aluno |
| "Turmas & projetos (units)" | Abre Pedagógico |
| "Painel do professor" | Abre painel existente |
| "Origens & conversão" | Abre Marketing |
| "Launcher (todas as telas)" | Abre a visão geral com miniaturas |

---

## 2. COMERCIAL — `ISR - CRM v3.dc.html`

Referência: CRM da mentoria (funil por abas + painel de lead expansível).

**Topo:** título "CRM · Funil de leads" + botões **💬 Mensagens prontas** (verde WhatsApp) e **↺ Demo** (restaura dados de demonstração).

**Notificação:** faixa `🎯 N novas inscrições hoje — abrir o funil` quando algum lead entrou hoje.

**Abas do funil** (pills roláveis horizontalmente, cada uma com contador):
`Para hoje · A contatar · Em conversa · Reunião · Contrato · Incompletas · Matriculados · Perdidos`
- "Para hoje" é visão inteligente: follow-up vencendo hoje/vencido + inscrições incompletas.
- Aba ativa: pill escura; inativas: brancas.

**Linha de lead** (cartão com borda esquerda na cor do estágio):
- Colunas: **Nome** (+ badge do estágio, ex. "PAROU NO PASSO 4", "IMEDIATA") · **Entrou** (relativo: "Hoje", "15 dias", com ⚠️ se ≥14 dias parado) · **Turma** · **Origem** (pill: Instagram, Formulário, Indicação…)
- Clique em qualquer lugar da linha expande/recolhe o painel (caret ▸/▾).

**Painel expandido do lead:**

| Elemento | Ação |
|---|---|
| Chips de **Estágio** (7 opções coloridas) | Um clique muda o estágio e registra no histórico |
| **✈️ Enviar mensagem do estágio** (botão largo teal) | Abre WhatsApp Web/app com a mensagem certa pro estágio já escrita (nada é enviado sem revisão) |
| "Lembrar de novo follow-up": **Amanhã · Em 3 dias · Próx. semana** + campo de data | Agenda o follow-up (alimenta a aba "Para hoje") e registra no histórico |
| **Histórico** (timeline com bolinhas coloridas por tipo) | Só leitura: criação, mudanças de estágio, contatos, notas |
| Campo **"Adicionar nota..."** + botão **Salvar** | Enter ou clique salva a nota no histórico |
| Cartão **Origem detalhada** (fundo coral claro) | Só leitura: utm/campanha dos pixels, "Veio de", "Entrou por" |
| **✓ Registrar contato** | Marca contato feito no histórico |
| **📅 Agendar reunião** | Muda estágio para "Reunião marcada" + registra |
| **Marcar perdido** (texto discreto) | Move o lead para Perdidos |
| **Excluir** (texto vermelho) | Confirma e apaga o lead |

**Rodapé da tela — Reativação · ex-alunas recuperáveis:** lista de ex-alunas com motivo da saída e botão **💬 Reativar** (WhatsApp com mensagem de renovação pronta).

---

## 3. COMERCIAL — `ISR - Mensagens v3.dc.html`

Mensagens prontas com variáveis preenchidas automaticamente.

**Topo:** título + botão **← Voltar ao CRM**.

**Controles:**
- **Categoria** (pills): `Leads · Pagamento · Alunos · Check-in · Onboarding`
- **Para** (dropdown): todas as pessoas (leads e alunas), formato "Nome · lead/aluna · turma"

**Layout em 2 colunas:**
- **Esquerda — lista de modelos:** busca ("🔎 Buscar modelo...") + lista rolável; modelo ativo com barra teal à esquerda. Modelos incluem: primeiro contato, follow-up, inscrição incompleta, confirmar conversa, indicação, lembrete de vencimento, **pagamento em atraso**, pagamento confirmado, link de pagamento, boas-vindas, sentimos sua falta, renovação, check-in mensal, agendar acompanhamento, convite onboarding.
- **Direita — editor:** textarea com a mensagem já preenchida (nome, turma, valor, vencimento, link). O que faltar aparece como `[DESTACADO: campo]` + aviso "✍️ Complete os trechos [DESTACADO] antes de enviar".

**Botões do editor:**

| Botão | Ação |
|---|---|
| **💬 Enviar no WhatsApp** (verde, largo) | Abre `wa.me/<número>` com o texto pronto — a gestora revisa e aperta enviar no próprio WhatsApp |
| **Copiar** | Copia o texto (vira "✓ Copiado" por 1,6s) |

Nota de rodapé explica que nada é enviado automaticamente.

---

## 4. GESTÃO — `ISR - Cobrança v3.dc.html`

Espelho da [ISR] Planilha Renovações. Título mostra o mês corrente ("Cobrança · Julho").

**Topo:** botões **⌂ Central** e **💬 Mensagens**.

**Resumo do mês (3 cards):** A receber no mês (R$ e € separados) · Recebido no mês · **Atrasadas** (número grande; borda/número ficam vermelhos quando > 0).

**Filtros** (pills com contador): `Todas · Atrasadas · Vence em breve · Pagas no mês · Quitadas · Auto matrícula`

**Linha de cobrança** (borda esquerda na cor do status):
- **Nome** + subtítulo "Tipo · Ciclos" (ex. "Renovação · 2 Ciclos 3.2026 e 4.2026")
- **Parcela** (ex. "R$ 345,00 · venc. dia 10" ou "· auto")
- **Progresso** (ex. "2/7 pagas")
- **Badge de status:** Em dia / Vence em breve / Atrasada / Paga este mês / Quitada / Auto matrícula

**Painel expandido:**

| Elemento | Ação |
|---|---|
| **Grade de parcelas** (um botão por mês: Julho → Janeiro, com valor) | Clique alterna paga ↔ pendente; paga fica verde "✓ paga"; o mês corrente é destacado "● este mês". Totais e status recalculam na hora |
| Cartão 📝 de observações | Só leitura (ex. "Sinal de €50 pago em 10/07") |
| **🔔 Lembrete de vencimento** (teal) | WhatsApp com lembrete gentil, valor e dia |
| **⚠️ Cobrar atraso** (vermelho) | WhatsApp com cobrança leve + link de pagamento |
| **✅ Confirmar recebimento** (verde) | WhatsApp confirmando o pagamento |

---

## 5. PEDAGÓGICO — `ISR - Turmas v3.dc.html`

Units of study visual: o que cada turma estuda agora.

**Topo:** botão **⌂ Central**.
**Filtro** (pills): `Todas · Carla · Gabi · Adrielly · Ricky` (professoras, geradas dos dados).

**Conteúdo:** seções por nível (First Steps A0 → Basics A1 → Essentials A2 → Speaking B1), cada uma com grid de cards. Card de turma:
- Barra superior na cor do nível (A0 caramelo · A1 coral · A2 teal · B1 roxo)
- Horário da turma ("MON 7h BR | 12h NL"), 👩‍🏫 professora, ciclo
- Destaque **"Projeto do ciclo"** (ex. The Poetry Project, My People Map, The Culture Map)
- 📓 nome do caderno vinculado, ou aviso `⚠️ Sem caderno vinculado neste ciclo`

*(Cards são informativos por enquanto; com a planilha conectada, os materiais viram links clicáveis.)*

---

## 6. MARKETING — `ISR - Marketing v3.dc.html`

**Topo:** botões **⌂ Central** e **🎯 Abrir CRM**.

**Totais (4 cards):** Leads no funil · Matriculadas (verde) · Perdidas (vermelho) · Conversão geral (%).

**Por canal:** um cartão por canal (Instagram, Formulário, Indicação, Site…) com:
- total de leads + pill de conversão (verde ≥50%, âmbar <50%, cinza "sem fechamento")
- **barra empilhada** verde/azul/vermelho (matriculadas / no funil / perdidas) + legenda

**Origens detalhadas (pixels):** tabela nome · string da origem (`ig · social · carol-matriculas-trafego`) · veio de.

---

## Design system aplicado

- **Cores:** teal #164951 (base) · teal claro #2a9d8f · coral #e07856 · roxo #6b5b95 · caramelo #d4a574 · verde #5a9e4b · vermelho #cf6b5c · fundo creme #faf8f3 · WhatsApp #25D366
- **Tipografia:** Helvetica Neue; títulos 26px bold com letter-spacing negativo; labels 8–9px uppercase com letter-spacing largo
- **Padrões:** cartões brancos com borda #e0dcd6 e sombra suave; borda esquerda/superior de 4px como código de cor semântico; pills para filtros/abas (ativa = escura); painéis expansíveis com fundo #fcfaf6

## Estado dos dados

- Telas rodam com **dados fictícios** persistidos no navegador (localStorage) — dá pra clicar tudo.
- Botão **↺ Demo** (no CRM) restaura os dados de demonstração.
- Conectores prontos para: [ISR] Planilha Renovações, [ISR] MKT - Leads_e_Alunos, [ISR] Units of study, ISR_Planilha_Mestra.

## Pontos abertos (sugestões para a revisão de UX)

1. **Mobile:** as linhas de CRM/Cobrança usam grid de 4 colunas — no celular precisam empilhar (hoje ficam apertadas).
2. **Confirmação de exclusão** usa `confirm()` nativo do navegador — trocar por modal do design system?
3. **Nota no CRM:** o campo de nota fica dentro do painel expandido; avaliar atalho na linha.
4. **Botão "Agendar reunião"** muda o estágio mas ainda não conecta com Google Agenda (roadmap).
5. **Acessibilidade:** revisar contraste dos labels 8px uppercase e navegação por teclado nos painéis expansíveis.
6. **Turmas & Projetos:** quando os links reais chegarem, definir hierarquia entre Syllabus / Teacher's Guide / Student's Notebook / Calendar no card.
7. **Central:** avaliar se os indicadores dos cards são os melhores KPIs de cada área.

---

## Pesquisa de horários — `horarios.html` + `apps-script-horarios.js`

Página pública para a turma marcar disponibilidade (livre, talvez, ocupado) em uma grade de horários, com fuso horário obrigatório. A professora cria quantas pesquisas quiser, cada uma com o próprio link (`horarios.html?p=código`).

**Instalação (uma vez):** planilha nova → Extensões → Apps Script → colar `apps-script-horarios.js` → trocar `PIN_ADMIN` → Implantar como App da Web (executar como você, acesso: qualquer pessoa) → colar a URL `/exec` em `BACKEND_PADRAO` dentro de `horarios.html`.

**Abas:**

| Aba | O que faz |
|---|---|
| Minha disponibilidade | Nome, e-mail, fuso e a grade para pintar. Salva automaticamente após pintar e pelo botão. O mesmo e-mail recarrega a resposta anterior. |
| Grupo | Mapa de calor com quantas pessoas estão livres em cada bloco, no fuso escolhido. Toque no bloco mostra quem pode. |
| Administração (senha) | Lista de pesquisas com link para copiar, formulário da pesquisa (título, descrição, período, horas, bloco, fuso), pontos de confluência ranqueados, participantes (com remoção) e e-mail para todas (sai da conta Google do script, alunas em Cco). |

**Tipos de pesquisa:** `datas` (cada dia do período vira uma coluna) e `semanal` (dias da semana repetindo durante o período, para eventos longos). Os blocos são calculados dia a dia na base de fusos do navegador, então mudanças de horário de verão em qualquer país entram na conta: no tipo semanal, a análise informa quando alguém está livre só em parte do período.

**Dados:** abas `Pesquisas` e `Respostas` na planilha, uma linha por pesquisa e por resposta (coluna `json` com o registro completo).

---

## Compra no Stripe → tag no systeme.io — `netlify/functions/stripe-compra.js`

Substitui o Zap. A pessoa compra no link de checkout do Stripe (com ou sem order bump), o Stripe avisa a função, a função aplica no contato do systeme.io uma tag por produto comprado, e as regras de automação do systeme ("tag adicionada → enviar e-mail") mandam o e-mail de cada produto. Comprou dois produtos, recebe duas tags e dois e-mails. Não existe regra por combinação.

**Por que o Zap não rodava:** link de pagamento com produto de compra única não gera invoice; o gatilho "New Invoice" nunca disparava. O evento certo é `checkout.session.completed`, e é ele que traz os itens da compra, order bump incluído.

**Instalação (uma vez):**

1. **Netlify** → Site configuration → Environment variables. Criar:
   - `SYSTEME_API_KEY` → systeme.io → Configurações → Chave de API pública.
   - `STRIPE_WEBHOOK_SECRET` → vem do passo 3.
   - `STRIPE_API_KEY` já existe (é a do extrato). Se for chave restrita, ela precisa da permissão de leitura em **Checkout Sessions** (Stripe → Developers → API keys → editar a chave).
   - `SLACK_WEBHOOK_URL` já existe; cada compra e cada problema aparecem lá.
2. Fazer **Trigger deploy** no Netlify para as variáveis valerem.
3. **Stripe** → Developers → Webhooks → Add endpoint:
   - URL: `https://SEU-SITE.netlify.app/.netlify/functions/stripe-compra`
   - Eventos: `checkout.session.completed` e `checkout.session.async_payment_succeeded`
   - Depois de criar, copiar o **Signing secret** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET` no Netlify e fazer novo Trigger deploy.
4. **Cada produto no Stripe** → Catálogo de produtos → o produto → Metadados → chave `tag`, valor = nome da tag no systeme (ex.: `comprou-ebook`). Mais de uma tag: separar por vírgula. Vale para o produto principal e para cada order bump.
5. **systeme.io** → para cada produto, uma regra de automação: gatilho "Tag adicionada" (a mesma tag do passo 4) → ação "Enviar e-mail" com o e-mail que entrega o produto. Se a tag não existir, a função cria na primeira compra, mas a regra precisa existir para o e-mail sair.

**Produto novo no futuro:** criar no Stripe com o metadado `tag`, criar a tag e a regra no systeme. Nada muda no código.

**Testar:** no Stripe, Developers → Webhooks → o endpoint → "Send test event" só testa a assinatura (o evento de teste não tem compra real, a função responde `ignorado`). O teste de verdade é uma compra no modo de teste do Stripe, com o webhook e a chave de teste, ou uma compra real de valor baixo.

**Quando algo dá errado:**

| Sintoma | O que é | O que fazer |
|---|---|---|
| Slack: "Sem tag no Stripe: Produto X" | O produto não tem o metadado `tag` | Preencher o metadado e, no Stripe → Webhooks → o endpoint → aba do evento, clicar **Resend** |
| Slack: "não entrou no systeme" | O systeme.io recusou (chave, fora do ar) | A função responde erro e o Stripe reenvia sozinho por até 3 dias; conferir `SYSTEME_API_KEY` |
| Stripe mostra o endpoint com erro 400 "assinatura inválida" | `STRIPE_WEBHOOK_SECRET` não bate | Copiar de novo o Signing secret do endpoint certo (teste e produção têm segredos diferentes) |
| Stripe mostra erro 500 "Falta configurar" | Variável não existe no Netlify | Criar a variável e fazer Trigger deploy |
| Boleto/Pix: tag só chega depois | `completed` chega com pagamento pendente | Normal: a tag entra no `async_payment_succeeded`, quando o dinheiro cai |

---

## A barra lateral

Os destinos em cinco seções, na ordem do dia de trabalho: **hoje ·
pessoas e vendas · financeiro · pedagógico · escola**. Vinte itens
numa coluna lisa viram uma lista para ler inteira toda vez; com
título em cima de cada grupo, a pessoa pula direto para o pedaço em
que está.

Só a lista rola. O rodapé — sincronização, versão e sair — fica preso
embaixo: a coluna agrupada passa de 1.100px e, rolando tudo junto, o
"sair" sumia de qualquer tela de notebook.

O **Mural da equipe** e a tela de gestão do **Desafio da semana**
foram apagados: não existem no v5. Com o mural fora, o dado dele saiu
junto — post no mural sem tela que o leia é arquivo que ninguém abre.
As páginas semanais do desafio, o material da aluna em
`/desafio.html` e o modo desafio no app continuam no ar: são
produto, não tela de gestão.

A seção do menu que se chamava "pessoas e vendas" passou a ser
**"alunas e vendas"**.

### Ver como

Quem cuida da escola precisa olhar o sistema pelos olhos de quem
trabalha nela: a fila da Carla, o painel da professora, o menu que
cada uma vê. Isso existia no seletor de perfil da Central antiga e se
perdeu no porte; voltou na barra lateral, onde vale para todas as
telas.

Duas regras, e a segunda é a que importa:

1. **só a gestora liga.** Ver como outra pessoa nunca dá acesso a
   nada — a gestora já vê tudo —, então isto só estreita a visão,
   nunca alarga. Ligar por fora, pelo console, não funciona.
2. **`gestaoUser()` continua devolvendo a pessoa de verdade.** É dela
   que saem os "por" de toda gravação: chamada, pendência, toque,
   recado no mural. Se o ver como entrasse ali, a Gabi olhando como
   Carla gravaria chamada assinada pela Carla, e o arquivo de cinco
   anos passaria a mentir.

Quem filtra tela usa `gestaoVisao()`; quem grava usa `gestaoUser()`.
Enquanto está ligado, a barra fica marcada e diz, com todas as
letras, que o que for gravado continua no nome de quem está ali.

Sair da gestão limpa o ver como: quem entrar depois abriria o sistema
já olhando pelos olhos de outra pessoa.

### A Central, pelo v5

A regra é a da Gabi: **o que não está no v5 não fica na versão
final**. A Central do v5 tem quatro coisas, e só elas: a fila do
dia, as metas do ciclo, os cartões por área e dois links da direção.

**O que saiu, e para onde:**

| saiu da Central | foi para |
|---|---|
| o calendário dos três ciclos | **Matrículas do ciclo**, que é onde o v5 põe começo e fim do ciclo |
| aulas sem chamada e o lote de presença | **Painel do professor**, onde o v5 mostra o diário pendente |
| a busca de pessoa | já existia em **Alunas** |
| criar pendência à mão | saiu: o v5 não tem |
| o bloco de avisos da equipe | saiu: o v5 não tem |
| ajustes no cadastro | saiu: o v5 não tem |
| os links Mural e Desafio no rodapé | saíram: o v5 tem só Atas e Financeiro |

Com os avisos fora, o botão **avisar a professora** virou um botão
que escreve num arquivo que ninguém abre. Saiu junto.

**A professora deixa de ter Central.** No v5 ela nem aparece lá: a
casa dela é o Painel do professor, que é justamente onde a fila
pedagógica e as aulas sem chamada passaram a morar.

#### A fila: há quanto tempo cada item espera

A fila dizia **o que** fazer e não **há quanto tempo** espera. Um
follow-up vencido hoje e um vencido há duas semanas tinham exatamente
a mesma cara, e é o antigo que custa caro.

Cada sinal passa a guardar um `desde` — e só quando a data existe de
verdade: o vencimento da parcela atrasada, o dia da última falta, a
data da avaliação baixa, o dia do check-in, o `proximoFollowup` do
lead, a data em que a ex-aluna ficou elegível para reativação (a
saída mais seis meses, não o dia em que ela saiu). Sinal sem data não
ganha uma inventada: `idadeNaFila` devolve `null` e a tela não mostra
nada.

Na linha, ao lado do nome: a **regra** que acendeu o item e **há
quanto tempo** ele espera, em vermelho a partir de três dias.

**A ordem é urgência primeiro, idade depois.** O desenho ordena só
por idade, o que funciona na fila de exemplo, onde tudo é do mesmo
tipo; com os dados reais isso põe uma reativação elegível há 104 dias
em cima de uma parcela que venceu hoje. Dentro da mesma urgência, o
que espera há mais tempo vem antes.

Junto, do v5: o rótulo **"filas da equipe"** antes dos chips, e o
bloco das metas inteiro leva ao Marketing.

### A Agenda, pelo v5

A Agenda do v5 tem três coisas: a **tira dos sete dias** com a
contagem de cada um, a **lista do dia escolhido** (hora, tipo,
título, quem, e um link para o perfil ou a turma) e **"+ Novo
evento"**, que abre o Google Agenda — o v5 não cria evento no
sistema.

Saíram: o seletor Lista/Semana, o seletor de responsável, o
7/14/30 dias, a legenda por tipo com contagem, o aviso do ciclo e o
bloco de configuração da **assinatura**.

**Com o aviso do ciclo foi embora a explicação da semana vazia**, e
isso voltou — em outro lugar e em outra forma. Depois que o ciclo
fecha, as aulas das turmas param: está certo, mas calado parece
defeito. A explicação agora é **uma linha embaixo da lista do dia**,
não um aviso no topo:

> Não há aula de turma neste dia porque o ciclo 3.2026 das turmas
> online terminou em 10/10. As aulas das turmas só existem dentro do
> ciclo. O próximo se abre em Matrículas do ciclo.

Duas coisas foram aprendidas ao fazer isso. A primeira: **"lista
vazia" não é a condição certa.** Follow-up e reunião não morrem com o
ciclo, então o dia costuma ter alguma coisa — a condição é o dia estar
fora da janela, e a nota aparece de qualquer jeito. A segunda: a
última frase só sai para quem pode abrir ciclo. Mandar a professora
abrir é mandá-la para uma tela que ela não tem.

São **dois calendários**, online e presencial, com datas próprias: o
dia pode estar fora de um, do outro, ou dos dois, e a nota diz qual.

**O filtro virou regra, não controle.** No v5 cada evento carrega os
papéis que o veem, e não há seletor. Aqui o equivalente é o nome:
fora da gestão, a agenda mostra o que está no nome da pessoa — o que
é de outra pessoa fica na agenda dela. Feriado aparece para todo
mundo.

**Três blocos ficaram, por decisão da escola**, ainda que o v5 não os
tenha em lugar nenhum:

- **aula extra** — é dela que sai a confirmação de presença no app da
  aluna e a chamada com horas próprias. Sem ela a aluna perde o botão
  de confirmar. O botão **"Criar aula extra" não criava nada**: estava
  ligado a um `onCriarEvento` que `renderVals()` nunca devolvia, então
  a gaveta abria, os oito campos preenchiam e o clique não fazia nada
  — sem evento e sem aviso. Corrigido, e a agenda agora pula para a
  semana da data marcada: sem isso, aula marcada para outra semana
  some do olho de quem acabou de marcá-la, e parece que não gravou;
- **feriados** — sem o cadastro, a agenda volta a gerar aula em
  feriado e a escola cobra chamada de aula que não houve;
- **Book Club** — a configuração da aula fixa.

A **assinatura** saiu: é operação, não agenda.

**Uma coisa que o v5 não tem e eu mantive:** as setas de semana. Sem
elas a tela só mostraria a semana corrente, e a escola marca aula com
semanas de antecedência.

### Alunas, pelo v5

No v5 esta tela se chama Pessoas e o subtítulo é **cadastro único**:
lead, aluna, pausada e MVS vivem no mesmo registro, porque é a mesma
pessoa em momentos diferentes. O cadastro único ficou; o nome, não — no
menu e no título ela continua **Alunas**, que é o que a escola chama e
o que a tela mostra ao abrir.

A tela tem quatro coisas: a **busca**, os **chips de situação com a
contagem** (Todos, Alunas, Leads, Pausadas, Em risco), a **lista de
quatro campos** (nome, situação, contexto, risco) e, acima dela, o que
a escola opera.

**A tela abre nas alunas ativas**, não em todo mundo: é a lista que a
escola usa todo dia, e lead já tem o CRM. O cadastro inteiro continua a
um clique, no chip Todos — o v5 abre em Todos, mas abrir numa lista de
leads uma tela que a professora usa para achar aluna custa um clique em
toda consulta.

O contexto muda com a situação: para quem é aluna, turma e professora;
para quem é lead, o estágio, o canal e desde quando. É a mesma linha —
o que ela diz é que depende de quem é a pessoa.

Saíram, pela regra de que o que não está no v5 não fica: o
**termômetro da turma** (a faixa de números no topo — a contagem agora
é o próprio chip), a **retenção por ciclo**, o **copiar lista** e o
**copiar e-mails**, e os filtros de **professora** e de **etiqueta**.

**Dois blocos ficaram, por decisão da escola:**

- **registros duplicados** — a mesma pessoa cadastrada em dois
  aparelhos antes de conectar. Sem o bloco, as duas cópias seguem
  somando contrato e presença em separado;
- **início das aulas em lote** — é o que põe a turma nova na chamada
  de uma vez.

**Duas coisas que o v5 não tem e eu mantive**, porque o bloco de lote
não funciona sem elas: o **seletor de turma** (é ele que define em
quem o lote escreve) e o **campo de início na linha de cada aluna**,
que é onde a exceção se corrige depois do lote.

**O lote conta só as alunas.** A lista agora traz lead junto, e data de
início de aulas não quer dizer nada num lead — aplicar em todo mundo
escreveria no registro errado. Por isso o botão diz "Aplicar às N
alunas da lista", não "às N pessoas".

O arquivo segue `ISR - Alunas v3.dc.html` e o endereço segue
`/alunas.html`.

### O CRM, pelo v5

O CRM do v5 é **só o funil**: chips de estágio com a contagem, uma
lista de quatro campos (nome e estágio, quando entrou, interesse,
canal) e, ao abrir uma lead, a régua de estágios, o follow-up, o
histórico e a origem.

**Saiu a vista Atividade** — os números do período, o extrato dia a
dia, o por pessoa da equipe e o por dia da semana. Eram ~250 linhas de
relatório no meio da tela em que se vende; quem olha número olha em
Marketing.

**Saiu o cabeçalho de colunas** com as setinhas de ordenar, que não
ordenavam nada: eram enfeite.

**O estágio mudou de lugar.** Era um `<select>` em cada linha; agora é
a régua de chips dentro da lead aberta, como no v5. A regra não mudou:
reunião, contrato, matrícula e perda **abrem um formulário** em vez de
mudar o estágio na hora — é o que impede alguém de marcar "Matriculada"
sem matrícula. Mudança simples de estágio continua valendo no clique.

**Tudo o mais ficou, por decisão da escola**, ainda que o v5 não tenha:
conversas de matrícula (marcar, convidar, dar por feita, e o bloco de
30 dias no topo), novo lead manual e link público de cadastro,
reativação de ex-alunas, seleção em massa, condições combinadas — que é
o que pré-preenche a tela de Matrícula —, motivo de perda, nota, e a
ficha da inscrição com contato e preferências.

**Um defeito que apareceu no porte:** a conversa marcada só aparecia na
linha quando a lead estava aberta, e a lista abre com todas fechadas.
Na prática, nunca aparecia. Agora é da linha.

**O que o v5 tem e não entrou:** a fila de revisão das inscrições do
Jotform — onde cada inscrição espera confirmação antes de virar lead, e
o sistema oferece juntar com um cadastro de mesmo WhatsApp. Aqui a
inscrição já vira lead sozinha, a cada cinco minutos, e os duplicados
se resolvem no bloco de registros duplicados em Alunas. Trocar isso é
mudar como uma lead nasce, não como ela aparece — fica para uma decisão
à parte. Também não entrou o **somente leitura**, que no v5 limita
quem pode mexer no funil: aqui definiria o que a operação pode fazer, e
isso é escolha da escola, não do desenho.

### Mensagens, pelo v5

Quatro coisas: os **chips de categoria**, o **para** (quem recebe, com
um atalho para o perfil dela), a **lista de modelos** e o **editor**.

A categoria era um `<select>`; virou chip, como no v5. Cada modelo da
lista passa a mostrar o **título e a primeira linha do texto**, já com
o nome e os dados de quem está escolhido — é o que diz qual é qual sem
precisar abrir um por um. O editor passa a dizer, no topo, **qual
modelo para quem**. O botão do WhatsApp é verde (#25D366), como no v5,
em vez do verde-água da casa: ele abre outro aplicativo, e isso é o que
a cor diz.

**Saíram:** a faixa **"Para hoje"** — os atalhos da fila da Central,
que davam ao compositor uma segunda porta de entrada — e a **busca de
modelos**. O × de limpar o destinatário saiu junto: o lugar dele no v5
é o atalho "abrir perfil".

**Ficaram, por decisão da escola:**

- **gerenciar modelos** — editar título e texto, restaurar o padrão,
  apagar e criar. O v5 não tem nada disso: sem o bloco, um erro de
  texto num modelo só se corrige no código. A etiqueta de "seu" e
  "editado" na lista é o par dele;
- **o aviso de contexto e o de envio** — a faixa "mensagem pronta para
  Fulana" quando se chega do CRM com `?para=&tpl=`, e a confirmação de
  que o contato entrou no histórico dela.

### Listas que viram página

`isr-paginacao.js` é a peça que faz toda lista comprida virar página do
mesmo jeito. A tela chama uma função e recebe tudo pronto — a fatia, o
rodapé com `« ‹ 1 2 3 › »`, o "mostrar 10 / 25 / 50 / todas por página"
e o resumo "11–20 de 45".

Três regras que a tela não precisa lembrar:

- **lista curta não ganha rodapé.** Dez linhas com controle de página é
  ruído, então o rodapé só aparece quando há mais de uma página;
- **página que não existe cai na última.** Filtrar encolhe a lista, e a
  página 4 de uma lista que agora tem 2 não existe — em vez de uma tela
  vazia, mostra a última válida;
- **mudar o filtro volta para a primeira página.** Cada tela faz isso no
  seu próprio controle, porque é lá que ela sabe o que é "mudar de
  assunto".

**"todas" existe** porque conferir e imprimir pedem a lista inteira.

Onde está ligada, e por quê: **Alunas** (45 pessoas), **CRM** (o estágio
"Fechados" tem 36), **Cobrança** (33 parcelas num mês) e
**Acompanhamento** (36 cartões abertos, seis mil pixels de rolagem — a
tela mais alta do sistema; caiu para 2.400px). As outras ou têm listas
de dez linhas ou menos, ou — como o **Caixa** — têm várias listas
pequenas em vez de uma grande, e precisam de um passo próprio.

### Buscar pessoa no compositor

O seletor de destinatário em Mensagens listava as dezenas de pessoas da
escola de uma vez. Ganhou um campo de busca ao lado: digitar filtra a
lista, e quando sobra uma pessoa só ela já é escolhida — é o que quem
digitou o nome inteiro queria. Busca sem resultado avisa e **não troca
o destinatário**: digitar não pode mandar a mensagem para outra pessoa.

### A Matrícula, pelo v5

O v5 põe a tela em **duas colunas**: os passos numa, e o **Resumo fixo**
na outra — ele acompanha a rolagem, mostra o que já está preenchido e
lista **o que falta** antes de deixar salvar. O botão parou de falhar
depois do clique: enquanto houver campo em falta, ele está apagado e o
resumo diz quais são.

**A pessoa passou a ser escolhida aqui.** Antes a tela só abria pelo
botão Matricular do CRM, com `?id=` na URL — quem fechou no boca a boca
tinha que virar lead antes. Agora há um seletor do cadastro, com busca
(digitar filtra; achando uma pessoa só, ela já é escolhida), e um
**"+ adicionar nova pessoa"** para quem nunca passou pelo CRM: nome,
WhatsApp, e-mail e **como chegou**. Ela nasce no cadastro na hora de
salvar. O `?id=` continua valendo.

Outras coisas que vieram do v5: a **turma virou cartão com a vaga à
vista**, em vez de uma linha de seletor — a vaga é o que decide, e
precisa ser lida sem abrir nada; **produto e moeda viraram chip**; e a
tela de conclusão é o **cartão verde-escuro** com os **quatro
checkpoints da integração** (D0, D+2, D+7, D+30) e três saídas: abrir
perfil, enviar boas-vindas, nova matrícula.

**Tudo o que a escola usa ficou**, ainda que o v5 não tenha: dados da
aluna e documento/endereço (o contrato exige), **mais de um produto na
mesma matrícula** (o v5 pede um formato só, a escola vende turma e
pacote juntos), pacote de aulas particulares, tipo de contrato, início
das aulas com o ciclo e a entrada na chamada, matrícula retroativa,
sinal e a lista do que o sistema faz ao concluir — que no v5 é uma
frase e aqui é a lista, dentro do Resumo.

**Uma coisa do v5 que não entrou:** o contador de **ciclos** com −/+.
O contrato aqui se conta em parcelas, não em ciclos, e trocar isso
mexeria na cobrança inteira.

### "Pessoa" é palavra de banco de dados

No código o registro se chama `pessoa`, porque ele cobre tanto quem
estuda quanto quem ainda não fechou. Na tela isso não ajuda: quem
estuda é **aluna**, quem ainda não fechou é **lead**, e "pessoa" não
diz qual dos dois.

A palavra saiu de 36 lugares no texto que a escola lê — busca, lista
vazia, contagem, rótulo de resumo, aviso de exclusão, rodapé de
cobrança, cartão de dados. Onde o texto cobre os dois, ele diz os dois
("buscar aluna ou lead…", "45 no cadastro, entre alunas e leads") em
vez de apagar a diferença.

Nos **nomes de código** ela fica: `getPessoas`, `pessoaId`,
`novaPessoa`. Renomear a camada de dados inteira é risco sem ganho, e
ninguém lê isso na tela.

E fica também onde não quer dizer aluna: **Equipe** e **Folha** falam
de quem trabalha aqui, a **Agenda** fala de quem é dona do evento, e
"dados pessoais" e "conta pessoal" são outra palavra.

O `verificar-jargao.js` passou a barrar `pessoa` no texto visível, com
exceção dessas três telas — se a palavra voltar, a conferência falha.

### Matrículas do ciclo, pelo v5

O placar verde-escuro com o número grande deu lugar aos **cartões
brancos de número** do v5 — faltam, ritmo atual, ritmo necessário,
contratado, mensalidade somada. O "N de M", a porcentagem e a barra
desceram para o bloco **Meta do ciclo**, que é onde o v5 os põe.

**A linha escura na barra** é a melhor ideia do v5 nesta tela: ela
marca onde a escola estaria hoje se as matrículas entrassem no mesmo
passo do ciclo. Sem ela a barra diz quanto falta, mas não se está
atrasada. Ela só aparece quando há data de fim — sem fim não há passo
a comparar, e a tela não promete o que não sabe.

**Mês a mês, De onde vieram e Por nível** viraram três cartões de
barra, lado a lado. A barra mede contra o maior do próprio corte: o
que se compara ali é um mês com os outros meses, não com a meta.

**Saíram:** o bloco "Como usar esta tela" (nenhuma outra tela explica
a si mesma), o **copiar a lista**, e o **início das aulas em lote** —
esse ficou em Alunas, que é de onde a escola trabalha a turma inteira.
A coluna de início continua em cada linha, que é onde a exceção se
corrige.

**Ficou a tabela de nove colunas**, por decisão da escola: fechou,
aluna, veio de, nível, turma, início, pacote, mensalidade, parcelas. O
v5 mostra cinco campos, e cinco não bastam para conferir um ciclo.

**Duas coisas em aberto nesta tela**, que não resolvi porque são
decisão sua: as datas do ciclo podem ser editadas em dois lugares — no
bloco Meta do ciclo e nos três calendários — e o significado não é o
mesmo; e o v5 tem um `mcCanEdit` que limita quem edita a meta, que
aqui ninguém limita.

### Uma gravação que ninguém ouvia

Cinco telas — Agenda, Central, Clubes, Turmas e Matrículas do ciclo —
escutavam o evento `isr-dados` para se redesenhar quando o dado muda.
**Ninguém nunca disparou esse evento.** As cinco ficavam velhas até
alguém recarregar a página.

O aviso passou a sair de `agendarSync()`, que é por onde toda gravação
passa — com banco central configurado ou sem ele. Uma linha, cinco
telas que voltam a se atualizar sozinhas.

### Calculadora, Cobrança e Folha, pelo v5

A **Calculadora** já era quase o v5. Mudaram três coisas: o produto
virou **chip** (são poucos, e um seletor esconde a lista justamente
onde a comparação de preço acontece); o cartão da **decisão** deixou de
ser verde-escuro e virou o cartão claro do v5 — verde quando fecha
sozinha, vermelho quando precisa de aprovação; e o **resumo** saiu de
dentro dele para um cartão branco próprio. O bloco **Pacote** ficou.

Na **Cobrança**, as abas-pasta viraram **chips com a contagem** e a
linha virou os cinco campos do v5: nome, tipo, parcela, progresso,
situação. O cabeçalho de colunas com as setinhas saiu.

**O quadradinho da parcela pede confirmação.** No v5 um clique marca a
parcela como paga. Aqui o primeiro clique destaca o mês e pergunta; o
segundo grava. Marcar parcela é mexer em dinheiro, e um toque errado
numa lista de trinta linhas não pode dar uma parcela por paga sem que
ninguém perceba. Fechar a aluna cancela a confirmação pendente.

Ficaram, por decisão da escola: resumo do mês, a projeção de doze
meses, o link de pagamento e as alunas sem plano.

Na **Folha**, o cartão verde-escuro virou **cartões brancos de número**
— a mesma troca feita em Matrículas do ciclo —, e a lista de
professoras passou a **abrir por clique**: o cálculo de todas de uma
vez era uma parede de número. Marcar pago não abre nem fecha a linha.
Ficaram os quatro blocos da escola: quem dá aula sem cadastro, aluna
particular sem professora, valor fixo no cadastro, e as regras e
faixas de comissão.

**Uma coisa do v5 que não entrou na Folha:** o botão "Exportar para o
ISR Financeiro". Ele aponta para um sistema externo que não existe
deste lado, e inventar um formato de exportação sem saber quem o lê
seria chutar.

### O Caixa, pelo v5

O Caixa tem dezenove blocos; o v5 tem dois. Aqui a regra de seguir o
v5 não ajuda — ele simplesmente não modela esta tela. Então a pergunta
foi outra: o que a escola usa. Dezessete blocos ficaram.

**Entrou o gráfico do v5**, no topo da aba do mês: três meses, duas
barras por mês (€ e R$) e uma linha escura atravessando cada barra na
altura do custo fixo. Barra abaixo da linha: o mês não se paga, e o
mês ganha o aviso. Clicar no mês abre o detalhe moeda por moeda —
recebido, a receber, entradas previstas, custo fixo, resultado.

Cada moeda tem **escala própria**: € e R$ não se comparam em altura, e
somar os dois esconderia qual das duas operações não se paga.

**Um defeito achado ao ligar o gráfico:** `projecaoCaixa()` dizia no
comentário "mês corrente + 2" e pegava os três primeiros meses de uma
lista fixa que começa em julho. A projeção mostrava julho, agosto e
setembro em qualquer mês do ano. Ninguém viu porque **nenhuma tela
usava a função**. Agora os três meses são contados da data de hoje.

**Saiu o bloco do câmbio.** A taxa continua existindo: ela alimenta a
linha do tempo e o previsto × realizado, e o campo foi para o rodapé
da linha do tempo — onde o número aparece é onde ele se edita. A tela
perde um bloco e não perde a capacidade.

**A paginação entrou nas duas listas de lançamento** do mês, entradas
e saídas, cada uma com a sua página. O Caixa caiu de 3.734px para
2.870px.

### A identidade visual, aplicada de verdade

As telas carregavam os quatro arquivos de token do design system — e
não usavam nenhum. `var(--color-…)` aparecia **zero vezes** no app
inteiro. Toda cor era um hexadecimal escrito à mão, e mudar o verde da
marca no design system não mudava nada no sistema.

O levantamento, antes de mexer: 4.610 cores escritas nas telas, 190
valores distintos. 2.465 delas eram cores da paleta, escritas à mão;
2.145 eram 168 valores que o design system não tem.

**Passo 1, feito: 2.889 trocas em 23 telas.** Toda cor que tem token
passou a ser `var(--color-…)`. Nada mudou de valor — mudou de
mecanismo.

A prova de que nenhum pixel mudou está no `cores-snapshot.js`: ele
fotografa a cor computada (texto, fundo, borda, sombra) de cada
elemento de cada tela, e compara as duas fotos. **5.230 elementos, 23
telas, zero diferença.**

**O `verificar-identidade.js`** passou a barrar o retorno do
hexadecimal: cor que tem token e está escrita à mão falha a
conferência, com arquivo e linha. Cor que ainda **não** tem token
continua em hexadecimal e aparece em `--fora`, que é a lista do que
falta no design system — não um erro de quem escreveu a tela.

Três cores ficaram de fora da regra de propósito: o verde do WhatsApp
e os dois tons do seu botão. São cor de outra marca, e a paleta da ISR
não deve absorvê-las.

**Fora do passo 1:** as nove telas da aluna que não carregam os tokens
(`ISR - Aluna`, `Aulas`, `Certificado`, `Comunidade`, `Tela de Aula`,
`Flin`, `Login`, `Onboarding`, `Notificações`). O app da aluna é
escuro e tem paleta própria; `var(--color-…)` ali resolveria para
nada. Entram quando o design system tiver os tokens do tema escuro.

**Passo 2, feito: 1.582 trocas, e cinco tokens novos no design
system.** As 138 cores que sobravam entraram — menos oito.

A decisão da escola foi que **o design system ganha**: os tons de
estado das telas adotam os semânticos dele, não o contrário. Mas isso
não pôde ser literal, porque a camada semântica estava incompleta:

| texto sobre o fundo do estado | razão | mínimo |
|---|---|---|
| `error` sobre `error-light` | 4,20:1 | 4,5:1 |
| `success` sobre `success-light` | 4,31:1 | 4,5:1 |
| `warning` sobre `warning-light` | 2,35:1 | 4,5:1 |
| `info` sobre `info-light` | 3,28:1 | 4,5:1 |

Nenhum dos quatro passava. **Cada estado tem três degraus, não dois:**
a cor do estado (ícone, borda, barra), o `-light` (o fundo do aviso) e
o `-dark` (o texto escrito sobre esse fundo). Era por isso que havia
tom escuro inventado em cada estado.

Então entraram no design system cinco tokens, todos derivados das
cores que já estavam lá: `--color-error-dark`, `--color-success-dark`,
`--color-warning-dark`, `--color-info-dark` — cada um é a própria cor
do estado escurecida até passar 4,5:1, e nada mais — e
`--color-primary-950`, o degrau abaixo do 900, que é a sombra do botão
escuro. Sem ele a sombra fica da cor do botão e o botão perde o
relevo.

**A rota não é distância de cor.** Mapear pelo tom mais próximo é o
que transforma fundo de erro em bege e sombra de botão em botão. A
regra é o papel: cor a menos de 3 ΔE de um token é o mesmo tom escrito
errado e vai para ele; o resto vai pela família de matiz e pelo degrau
de claridade. Marrom e vermelho são os dois quentes, e o que os separa
é a saturação — `#9c6f56` é texto marrom, `#a3392c` é erro.

**Oito cores ficaram em hexadecimal, de propósito: o roxo.** A paleta
não tem roxo nenhum, e é com ele que o CRM e a Agenda marcam conversa
e reunião. Mapear no cinza apagaria a distinção; mapear no teal daria
a reunião a cor de todo o resto. Cor que falta na paleta é trabalho do
design system, não chute de quem escreve a tela.

### Medir antes de mexer em cor

Duas ferramentas ficaram no repositório, porque é o que torna esse
tipo de mudança segura:

- **`verificar-cores.js`** fotografa a cor computada de cada elemento
  de cada tela e compara duas fotos. No passo 1 provou que nada mudou;
  no passo 2 mediu quanto mudou: **1.079 de 5.230 elementos, 20,6%**;
- **`verificar-contraste.js`** mede o contraste de cada texto contra o
  fundo em que ele está de verdade — subindo na árvore até achar o
  fundo que vale, como o olho faz — e aponta só o que **piorou**.

O passo 2 fechou em **307 textos melhores, 1.490 iguais, zero
piores**. Os quatro que a primeira medição pegou eram o mesmo caso: a
cor do estado usada como texto sobre o fundo do estado. Foram para o
`-dark`.

**Passo 3, feito: 718 de 848 elementos passaram a usar a classe do
componente, e 2.962 declarações de estilo saíram das telas.**

O levantamento, antes de mexer: 848 botões, cartões, selos, campos e
seleções nas 22 telas de gestão, em **546 formas de estilo distintas**.
A variação quase toda era de colocação (margem, flex, largura) e de
valores quase iguais — fonte 12 / 12,5 / 13px, canto 18 / 24px. O
tipo, não: 195 dos 224 campos usam o mesmo preenchimento, 131 dos 131
cartões usam o mesmo branco. 848 elementos, oito componentes de
verdade.

**Por que a camada de gestão mora no repositório.** O design system
exporta catorze componentes. Dez são das páginas de venda — CTAButton,
Tag, PriceTag, Gable, WordMarquee, StreetSign, FaqItem, ChatBubble,
AuthorChip, Highlight. Os outros quatro são os genéricos, e cada um,
do jeito que está exportado, piora a tela de gestão:

| componente | o que ele faz hoje | o que a gestão precisa |
|---|---|---|
| `Button` | `--color-primary-500`, sem sombra, `--radius-lg` | `--900`, sombra de relevo, pílula |
| `Badge` | `--color-success` sobre `--success-light` = 4,31:1 | o degrau `-dark`, que o passo 2 criou |
| `Card` | `--shadow-md` em todo cartão | 20 dos 131 cartões têm sombra |
| `Input` | branco com borda cinza | o preenchimento bege, sem borda |

Trocar literalmente achataria os botões, desfaria a correção de
contraste do passo 2, poria sombra em 111 cartões e deixaria os campos
brancos. Então as classes ficam em **`isr-componentes.css`**, escritas
inteiras em token do design system. Quando o design system ganhar um
`Button` com sombra e um `Badge` com o `-dark`, cada classe vira uma
linha e some.

**A conversão não muda um pixel, e a razão é estrutural, não
estatística:** a classe só entra num elemento que **já declara todas
as propriedades da classe** — assim ela nunca introduz uma propriedade
que o elemento não tinha; e uma declaração só sai do estilo quando o
valor é equivalente ao da classe. O que não é equivalente fica no
elemento e sobrepõe a classe, porque estilo direto vence classe. O
campo que precisa de canto de 18px continua com ele à vista, agora
como a única linha do seu estilo.

**O preço dessa regra é uma lista**, e foi ela que ensinou o resto do
passo. 130 elementos ficaram de fora por não declararem alguma das
propriedades — e não era dívida inventada: cada item era um lugar onde
a tela estava diferente das outras sem querer. Lendo a lista item por
item, os 130 eram quatro coisas distintas, e só duas eram defeito:

| caso | quantos | o que era |
|---|---|---|
| botão de texto | 42 | fundo transparente, sem canto — **outro componente**, que não estava nomeado |
| sem `font-family` | 16 | botão preenchido aparecendo na fonte do navegador — **defeito** |
| sem `border` | 6 | botão recebendo a borda 3D cinza do navegador — **defeito** |
| `<select>` sem `color` | 6 | texto em preto puro onde todo o app é teal — **defeito** |
| caixa de marcar e arquivo | 6 | não é campo de preencher — **erro de classificação do verificador** |
| cartão clicável | 19 | não é botão de rótulo; mexer no peso mudaria o texto de dentro |

**A forma do botão virou modificador.** Os 42 botões de texto — o
"cancelar" ao lado do salvar, o "excluir" dentro do lead, o "esta
semana" na Agenda — não têm canto nenhum. A pílula na base dizia que
todo botão é preenchido e deixava esses 42 fora da camada. Agora são
quatro classes: `.isr-botao` (tipo, peso, sem borda, cursor),
`.isr-botao--pilula` (a forma preenchida), `.isr-botao--escuro` (a ação
principal, com a sombra de relevo) e `.isr-botao--texto` (sem fundo e
sem forma, só a palavra). A cor fica no elemento, porque ela diz o que
o clique faz — teal para seguir, vermelho para desfazer.

**Três defeitos corrigidos, e medidos um a um:**

- **16 botões ganharam a fonte da escola.** Em Mensagens, Turma,
  Equipe, Marketing e Dados, botões de rótulo real ("Criar", "Salvar
  modelo", "Restaurar", "Pedir à Gabi") apareciam em Arial. 13 mudaram
  na tela, e a caixa de todos ficou do mesmo tamanho — as duas fontes
  têm a mesma métrica nesses corpos, então nada reposicionou;
- **6 botões perderam a borda 3D do navegador.** Botão sem `border`
  declarada recebe `2px outset` cinza: três no Perfil apareciam com
  moldura, 4px mais largos e mais altos que os vizinhos limpos. A
  página do Perfil ficou 3px mais curta;
- **6 seleções da Caixa saíram do preto.** Controle de formulário não
  herda cor do `body` no Chrome, então seis `<select>` apareciam em
  preto puro onde todo o resto do app é o teal `#164951`. 35 elementos
  mudaram de cor (as seis seleções e as opções dentro delas), e o
  verificador de contraste confirma: **zero textos passaram a ficar
  abaixo de 4,5:1**.

Ficaram 29 elementos fora, de propósito: os 19 cartões clicáveis, 5
selos e 5 campos onde a declaração que falta não é a mesma nos dois
lados. A cobertura é de **96%**.

**A área da aluna não entra nesta camada.** O que diz se uma tela é de
gestão é a barra lateral: as 21 telas do menu carregam `isr-shell.js`.
O `ISR App (Conectado)` carrega os tokens mas não a barra — é da área
da aluna, com Helvetica Neue e Georgia, tipografia própria. Deixar a
camada entrar ali faria uma mudança no botão da gestão chegar calada na
tela da aluna, e as duas áreas são para ficar separadas. Os 41 botões
sem `font-family` que ele tem continuam como estão: lá `inherit` não é
a fonte da escola.

**`verificar-componentes.js`** é o quinto verificador: diz quanto das
telas usa a classe, lista o que ficou de fora com tela e linha
(`--fora`), e falha se alguma tela esquecer de carregar a folha.

### Medir antes de mexer em forma

**`verificar-forma.js`** é o instrumento deste passo. O de cores não
servia: ele fotografa cor, e trocar estilo repetido por classe mexe em
borda, canto, espaçamento e tipografia. Este fotografa a caixa, o
canto, a borda, o espaçamento interno, a fonte, o peso, o cursor e a
sombra de cada elemento de cada tela.

Ele normaliza uma coisa de propósito: canto maior que a metade do lado
menor é registrado como **pílula**, porque o navegador desenha a mesma
pílula para 999px e para 9999px. Sem isso ele acusava diferença em 22
telas onde não há nenhuma — e instrumento que acusa o que não existe
não serve para o passo seguinte.

A conversão fechou em **zero diferenças em forma e zero em cor**, nas
23 telas e 5.230 elementos. Os três defeitos corrigidos depois dela
aparecem isolados: **13 elementos de fonte em 4 telas, 9 de borda no
Perfil e 35 de cor na Caixa** — e mais nada, em 5.230.

E o instrumento pegou uma regressão de verdade no caminho: o
`ISR App (Conectado)` carrega `styles.css` em vez de `tokens/web.css`,
a folha de componentes não entrou lá, e um campo perdeu o canto e a
fonte. Foi o que levou a descobrir que aquela tela não é de gestão.

### O Painel do professor, pelo v5

A tela tinha **três abas planas** — Resumo do dia · Chamada · Turmas e
horas — e a turma não era lugar nenhum: a chamada tinha um `<select>`
de turma no meio dela, e escolher a turma e escolher a chamada eram
duas escolhas separadas que precisavam combinar.

O v5 tem **quatro abas no topo** — Hoje · Minhas turmas · Particulares
· Clubes — e **"Minhas turmas" abre UMA turma, com abas próprias
dentro**. A turma é a unidade do trabalho da professora: ela entra na
turma e trabalha ali.

| aba de dentro | o que tem | de onde veio |
|---|---|---|
| **Visão geral** | projeto do ciclo, ocupação com vagas, professora, próxima aula | nova |
| **Alunas** | a lista com o estado de hoje e a frequência de cada uma | a mesma lista da grade do diário, sem cálculo novo |
| **Chamadas** | a chamada inteira: as datas, a grade P/A/F/J, salvar, gravação, histórico, chamadas já feitas | era a aba Chamada |
| **Materiais** | o caderno da turma com link para o Drive, e as aulas gravadas | nova |

**A lógica da chamada não foi reescrita.** São 900 linhas que
funcionam, e o que mudou foi quem escolhe a turma: antes um seletor
dentro da chamada, agora a turma estar aberta. O state `turmaChamada`
já era o "turma selecionada" — a reestruturação se encaixou nele, e o
seletor saiu porque virou redundante.

**As particulares saíram de dentro da chamada** e viraram aba do
topo, como no v5: a tabela de pacotes e a chamada da semana. Elas não
são uma turma, e estavam dentro do bloco de uma.

**A aba Clubes mostra os clubes dela** — estado, horário, onde,
inscritas, lista de espera, encontros do mês e o próximo — e manda
editar na tela de Clubes. Criar e publicar em dois lugares acaba em
dois lugares que discordam, e a tela de Clubes já existe no menu.

**"Começar aula"** aparece quando a aula do dia tem caderno, e abre o
caderno no Drive. O v5 abre um caderno ao vivo para edição; nós
guardamos o **nome** do documento, não o caderno. O botão faz o que dá
para fazer — leva ao caderno que a professora abre à mão hoje. Prometer
caderno ao vivo seria pior que não ter botão.

**Fora, por não haver dado nosso:** Plano das aulas (sessões,
atividades, reordenar, publicar), Substituições (pedir e atribuir),
Respostas ao vivo, Slides e Entregas do mês. Ficam nomeadas aqui, como
o "Exportar para o ISR Financeiro" da Folha: tela que promete o que
não existe é pior que tela sem a promessa.

**Os links diretos continuam valendo.** `?turma=&data=&retro=1` da
Agenda, da lista de aulas sem chamada e da página da Turma agora
entram na turma, na aba de chamadas — que é o que quem clica veio
fazer.

### Turmas e Turma, pelo v5

**A lista dizia "3/5".** Para saber *quem* está na turma e se a
professora aguenta mais uma, era preciso abrir turma por turma — e é
exatamente isso que se faz ao encaixar uma matrícula nova.

Agora a lista mostra **quem está em cada turma, como etiqueta, com as
vagas vazias desenhadas em pontilhado** — é o quadro do v5. Aluna em
risco vem marcada em vermelho: é nela que se olha antes de pôr mais uma
na turma. A coluna de material saiu da linha para abrir esse espaço; o
caderno é assunto da turma aberta.

Duas alunas chamadas Beatriz na mesma turma davam duas etiquetas
"Beatriz", que leem como uma duplicata. **Primeiro nome repetido na
mesma turma ganha a inicial do sobrenome:** Beatriz O. e Beatriz C.

**Capacidade das professoras** entrou, com uma barra por professora. O
v5 conta em **horas por semana**, que o sistema não guarda; a **carteira
em alunas** é a unidade que existe, já é editável na Equipe, e é a
mesma `CRM.carteiraProfessoras()` que a Equipe mostra — duas contas da
mesma coisa acabam discordando, e aí ninguém confia em nenhuma. Aqui
ela só se vê, no momento em que se monta turma; editar continua na
Equipe.

**Os quatro blocos que o v5 não tem ficaram**, por decisão da escola:
o formulário de nova turma (sem ele, criar turma não tem lugar nenhum
no sistema), o aviso da janela do ciclo (que evita a pergunta
"cadastrei a turma, por que não aparece aula?"), o bloco de alunas
particulares e a seleção múltipla.

#### A turma virou um lugar

A tela de Turma tinha **duas colunas com seis blocos**: alunas e
chamadas à esquerda; projeto, materiais, tarefa de casa e pedir à Gabi
à direita. Quem vinha ver a chamada rolava por material e tarefa de
casa.

Agora são **cinco abas**, as quatro do Painel do professor mais a de
gestão:

| aba | o que tem |
|---|---|
| **Visão geral** | dia e horário, professora, projeto, ciclo, ocupação com vagas, caderno — e é onde "editar turma" abre |
| **Alunas** | a lista, com faltas e situação de pagamento, e o campo de adicionar |
| **Chamadas** | as chamadas recentes, cada uma abrindo no Painel |
| **Materiais** | projeto do ciclo, materiais da turma, tarefa de casa e pedir à Gabi |
| **Renovação e vagas** | quem renovou, quem não, quem não respondeu — e as vagas do ciclo seguinte |

**Renovação e vagas é nova.** Cada aluna já carregava o campo
`renovacao`; a soma disso por turma é o que diz quantas vagas o ciclo
seguinte abre, e ela só existia na conta da escola inteira. A conta é
explícita na tela: as vagas de hoje mais as de quem não renovou, e quem
está sem resposta ainda não conta.

**Lista de espera por turma ficou de fora:** o v5 tem, e o sistema não
guarda espera por turma — só por clube.

As duas colunas se dissolveram em vez de virar abas por coluna: cada
bloco é filho direto da grade, embrulhado no `sc-if` da aba dele. Aba
de um bloco ocupa a largura inteira, e Materiais, que tem três, os põe
lado a lado — é o que a grade `auto-fit` já fazia.

### Gravações das aulas · uma tela que faltava

O link da aula gravada sempre existiu: colava-se **dentro da chamada**,
no Painel do professor, e a aluna daquela turma o via no caderno. O que
não existia era o lugar de ver o **conjunto** — quais aulas têm
gravação e quais ficaram sem. Sem essa lista, descobrir que a aula de
três semanas atrás não foi publicada dependia de a aluna reclamar.

A tela é a do v5, e é curta: a regra no topo, três números, três
filtros (**sem gravação · publicadas · todas**), o seletor de
professora, e a lista das aulas com o campo de colar o link.

**A lista é das aulas com chamada salva.** Aula sem chamada não existe
para a escola, e gravação de aula não registrada não tem a quem
aparecer: é a chamada que diz quem estava matriculada naquele dia, e é
isso que decide quem vê o link. Por isso cada linha mostra quantas
alunas veem aquela gravação.

**Só aula de turma.** Particular é de uma aluna só, e aula extra tem
convidadas de turmas diferentes — nos dois casos "quem estava
matriculada naquela turma" não é a pergunta certa.

**Link que não é do Drive é recusado na hora**, com o caminho certo
("Compartilhar → Copiar link no Drive"). Colar o endereço errado
publica uma gravação que ninguém abre, e o erro só apareceria quando a
aluna tentasse assistir.

**A linha em que se acabou de agir fica à vista.** Salvar o link tira a
aula do filtro "sem gravação", e ela desapareceria da tela — o que
parece que não gravou. A linha continua, com o selo de publicada, até a
próxima troca de filtro. É o mesmo princípio da agenda que pula para a
semana da aula que se acabou de marcar.

Endereço curto: `/gravacoes.html`. No menu, em **pedagógico**, depois
de Clubes.

### Os avisos estavam escrevendo para o nada

Um teste cobrava que a professora é avisada quando a gestão corrige a
chamada dela. Não era, e a causa estava três camadas abaixo:

```js
function avisosLista() {
  try { return JSON.parse(localStorage.getItem(AVISOS_KEY)) || []; } catch (e) { return []; }
}
```

**`AVISOS_KEY` não existia.** O corte do Mural apagou a declaração
`var AVISOS_KEY = "isr_avisos_v1";` e deixou os três usos dela. Como o
acesso a `localStorage` vive dentro de `try/catch`, o `ReferenceError`
era engolido: a lista devolvia vazio, a gravação não gravava, e nada
acusava. **Todo aviso que o sistema escreveu desde então foi descartado
em silêncio** — nove lugares diferentes, por dias, sem uma linha de
erro.

Antes de mexer, conferi um por um se a informação sobrevive em outro
lugar que alguém de fato vê:

| o que avisava | onde a informação está |
|---|---|
| matrícula nova | `pushHist` do onboarding + a tarefa de integração, logo depois |
| avaliação baixa | a tarefa "Falar com X sobre a última aula" |
| entrada no acompanhamento | `pushHist` + tarefa |
| tarefa concluída | a tarefa fica marcada como feita na lista |
| conversa de matrícula marcada | a tarefa com dono e prazo |
| chamada corrigida | o histórico da chamada, que o Painel mostra |
| particular remarcada | a linha do tempo da aluna, e a Agenda mostra a aula no dia novo; o limite excedido aparece no Perfil, para quem remarca |
| desafio respondido | `pushHist` |

Todas cobertas. **Então a máquina saiu** — cinco funções, nove
chamadas, duas exportações e o campo no pacote do sync. Restaurar a
chave só devolveria uma gaveta write-only: nove escritores e, desde
que o Mural saiu, zero leitores.

**`verificar-nomes.js`** é o sexto verificador, e existe por causa
deste defeito: ele procura chave de armazenamento (`NOME_KEY`) usada
num arquivo e nunca declarada nele. O alvo é estreito de propósito —
mirar em todo nome em caixa alta dá 104 achados, quase todos
`window.ISRCRM` e `ISRPaginacao.PADRAO`, e verificador que acusa o que
não existe deixa de ser lido. Posto no arquivo de antes da correção,
ele aponta o `AVISOS_KEY` nas três linhas.

### A Área da Aluna no desenho novo

`ISR - Aluna v4.dc.html` é o `Student Portal v3` com os dados reais da
escola. A casca é a do desenho: **barra lateral** escura no monitor
(logo, nome e nível, menu por grupos, milhas no rodapé) e **barra de
baixo** de quatro itens no celular; cabeçalho com assunto, título,
seletor **PT / EN** e sino de avisos. O design system entra pelos
tokens e pelo `_ds_bundle.js`, e o logo vem de `assets/`.

Quatro páginas, com o dado que já existe:

- **Início** — a próxima aula em destaque (professora, dia, hora e
  projeto do ciclo), a semana de segunda a domingo com o que já
  aconteceu marcado, e os cartões de progresso e de clubes;
- **Meu progresso** — nível e próximo passo, quatro números
  (presença, aulas, tarefas, carga horária), o projeto do ciclo, o
  **certificado** com o que falta, e a linha da presença;
- **Clubes** — Meus clubes e Todos os clubes, com encontros, material,
  entrar, sair e lista de espera;
- **Minha conta** — presença, parcelas do contrato e ISR Miles com
  extrato.

O **PT / EN** troca só as palavras da casca. Nome de turma, nível,
professora e projeto são o dado da escola e não são traduzidos.

#### A Loja de milhas e o Meu perfil

Duas das quatro que faltavam entraram.

**A Loja de milhas não precisava de dado novo nenhum** — as milhas já
eram contadas, o catálogo existia e o resgate funcionava; faltava a
página. Ela tem o saldo, quantas recompensas estão ao alcance, a barra
do que falta para a próxima, **como ganhar milhas** (as seis regras,
com os valores que o sistema usa de verdade), as recompensas da escola
e o que a aluna já resgatou.

Tudo vem de `CRM.recompensasDaAluna`, que é a mesma função que alimenta
o número na Conta — duas contas da mesma coisa acabam discordando. Ela
também já tira da lista o prêmio fechado por regra (tempo de casa,
vagas do mês, um por ciclo): não adianta dizer "faltam 315 milhas" para
algo que milha nenhuma destrava hoje.

**Resgatar é de duas etapas.** O primeiro clique pergunta, o segundo
gasta — resgate debita milhas e não se desfaz. É a mesma confirmação da
célula de parcela na Cobrança, e pela mesma razão.

**O perfil é dela, e é ela que escreve.** Foto, bio, aniversário (dia e
mês, sem ano: a comunidade comemora, não precisa da idade) e até quatro
links. A escola não tem esses dados nem deveria digitá-los.

Para isso entrou **`salvarPerfilDaAluna`** no `crm-data.js`, e ele é
estreito de propósito. A alternativa seria expor o `mutate` e deixar o
app da aluna escrever qualquer campo do cadastro — nome, turma,
contrato. **Um app que roda no aparelho de outra pessoa não ganha a
chave do cadastro inteiro; ganha a porta dos quatro campos que são
dela.** Foto e link têm de começar com `https://` — endereço que não é
https não carrega, e dado embutido (`data:`) cresce o cadastro sem
limite e viaja em todo sync.

**Fica de fora, nomeado na própria página:** o **mural de trocas** da
loja, em que as alunas trocam coisas entre si, e **a metade social do
perfil** — os atributos que outras alunas avaliam com estrelas e o
mural de recados. Os dois são conteúdo público entre alunas, com as
mesmas perguntas (o que cada anúncio mostra, como duas alunas se
falam, quem modera), e isso é decisão da escola, não detalhe de tela.

**Falta trazer do desenho:** **Caderno** (plano da aula, palavras,
tarefas ao vivo, homework) e **Review** (cofre de palavras). As duas
dependem do **plano de aula da professora**, que é a maior peça que
falta no sistema e começa do lado dela. Até lá o app antigo
(`ISR - Aluna.dc.html`) continua de pé, com Aulas, Materiais, Desafio e
avaliação da aula.

### Cada tela na rotina de quem abriu

O menu já escondia as telas que não são de quem entrou, mas **dentro**
das telas a escola inteira continuava aparecendo. A professora abria a
Central e via meta de matrícula, leads no funil e a planilha
financeira; abria a Agenda e via follow-up do comercial, reunião de
venda e a aula das colegas no meio das dela.

Número que a pessoa não pode mover não é informação: ocupa o lugar do
que ela precisa ver, e ainda parece cobrança.

Na **Central**:

- metas de matrícula e renovação, só para gestão e comercial;
- a planilha financeira é da direção; a ata é de quem está na reunião
  de alinhamento, então o comercial continua com ela.

Dois itens desta lista descreviam um desenho que o corte do v5
desfez, e ficaram aqui desmentindo o código: o cartão Pedagógico com
"suas alunas em risco" e o bloco de aulas sem chamada com "47 aulas
suas". **A professora não tem Central** — no `isr-shell.js` o item é
de gestora, operação e comercial —, as aulas sem chamada foram para o
Painel do professor e os cartões de área são de quem cuida da escola.
O número por professora é dela e vai no Painel, que é a casa dela.

O filtro por professora que alimentava aquele cartão continuou no
código depois de a professora sair da tela, calculando um número que
ninguém lia. Saiu: filtro que não filtra nada é armadilha para quem
mexer depois.

Na **Agenda**:

- o que entra na lista sai do papel: quem só dá aula vê aula, aula
  extra, particular e feriado; quem vende vê também reunião,
  matrícula, follow-up e renovação, porque a Carla faz as duas
  coisas; gestão e operação veem tudo;
- o filtro de responsável **abre no nome da pessoa**, e "Todos"
  continua lá para quando ela precisa ver a aula de uma colega;
- assinatura, Book Club e feriados são configuração da escola e
  somem para quem não administra;
- o aviso do ciclo deixa de mandar a professora "resolver na
  Central" — o bloco do ciclo nem aparece para ela lá;
- o bloco de aulas extras passa a respeitar o filtro de responsável,
  que ele ignorava para todo mundo.

No **Painel do professor**:

- a tela era um rolo só — chamada do dia, histórico de chamadas,
  turmas e horas, um embaixo do outro. Quem entrava para lançar a
  chamada rolava por tudo. Viraram três abas, como no desenho:
  **Resumo do dia**, **Chamada**, **Turmas e horas**;
- o Resumo responde "o que eu tenho hoje?" antes de pedir qualquer
  coisa: a aula de agora com o projeto do ciclo e o tamanho da turma,
  as entregas do mês, a fila pedagógica e as próximas aulas;
- quem chega por um **link de chamada** (a Central, a Turma, a
  Agenda) abre direto na aba da chamada: já tem o que fazer;
- o **seletor de professora** some para quem não é gestão. Ele abria
  o painel das colegas — as aulas delas, as alunas delas, a chamada
  delas —, e nem o `?prof=` na barra de endereço leva para lá agora.

As **entregas do mês** contam só o que o sistema registra: aula com
chamada salva, aula sem chamada, alunas nas turmas dela e clube dela.
O desenho mostra também reunião pedagógica e slides apresentados, que
não têm registro nenhum — número inventado é pior do que número
ausente.

---

## Ligar as chaves · passo a passo

Três coisas, nesta ordem. A primeira é urgente: **enquanto
`ISR_FUNCOES_CHAVE` não existir, seis funções recusam tudo** —
certificado, push, aviso de onboarding, chat, data e confirmações.
Elas foram fechadas de propósito sem modo aberto, e isso significa
que estão paradas até a variável existir.

### 1. `ISR_FUNCOES_CHAVE` — fecha as seis funções

1. Abra **app.netlify.com** e entre no site do ISR.
2. **Site configuration** → **Environment variables** → **Add a
   variable** → **Add a single variable**.
3. Key: `ISR_FUNCOES_CHAVE`. Value: uma senha longa inventada na hora
   — 30 caracteres aleatórios, sem significado. Guarde-a no
   gerenciador de senhas; ela não aparece mais depois de salva.
4. Scopes: deixe em **All scopes**. Deploy contexts: **All**.
5. **Create variable**.
6. **Deploys** → **Trigger deploy** → **Deploy site**. Variável nova
   só vale depois de um deploy.
7. Quem chama essas funções de fora (Zapier, Apps Script) precisa
   mandar a mesma senha no cabeçalho `x-isr-chave` ou no campo
   `chave` do corpo. Onde houver automação chamando uma das seis,
   acrescente o cabeçalho.

### 2. `ISR_BASE_URL` — o endereço da base sai do código

1. Mesma tela: **Add a variable** → Key `ISR_BASE_URL`.
2. Value: o endereço do Web App do banco central — o mesmo `.../exec`
   que está hoje em `crm-data.js`.
3. **Create variable** → **Trigger deploy**.
4. Abra a Central e confira que a sincronização continua. Se cair no
   caminho antigo, o console do navegador escreve "falando com a base
   pelo caminho antigo".

### 3. Convidar a equipe no Netlify Identity

Até cada pessoa ter conta, a porta de transição do `gestao.html`
deixa entrar só com o e-mail — que é o buraco que o Identity fecha.

1. No site do ISR: aba **Identity**. Se ainda estiver desligada,
   **Enable Identity**.
2. **Settings and usage** → **Registration** → **Invite only**. Sem
   isso qualquer pessoa cria conta sozinha.
3. Volte para **Identity** → **Invite users**.
4. Um e-mail por linha: o da Gabi, o da Carla, o da Érika, e os das
   professoras que entram no sistema.
5. **Send**. Cada pessoa recebe um convite, escolhe a própria senha e
   passa a entrar por `inglessemroteiro.netlify.app/gestao.html`.
6. Quando **todas** tiverem entrado uma vez, avise — aí a porta de
   transição sai do `gestao.html` e o e-mail sozinho deixa de valer.

Nenhuma dessas senhas deve ser mandada por conversa, nem para mim.

---

## As portas do sistema

O site é estático: qualquer pessoa lê o JavaScript dele e descobre
todos os endereços que ele chama. Por isso quem fecha a porta é o
servidor, nunca a tela.

### Funções do Netlify

| Função | Quem chama | Como está fechada |
|---|---|---|
| `base` | a gestão, pelo navegador | token do Netlify Identity |
| `convidar-aluna` | Zapier | `ISR_CONVITE_CHAVE` |
| `extrato-conta` | Caixa | `ISR_EXTRATO_CHAVE`, digitada uma vez por aparelho |
| `stripe-compra` | Stripe | assinatura do webhook (`STRIPE_WEBHOOK_SECRET`) |
| `chat` | máquina | `ISR_FUNCOES_CHAVE` |
| `data` | máquina | `ISR_FUNCOES_CHAVE` |
| `get-confirmations` | máquina | `ISR_FUNCOES_CHAVE` |
| `onboarding-notify` | máquina | `ISR_FUNCOES_CHAVE` |
| `send-certificate` | máquina | `ISR_FUNCOES_CHAVE` |
| `send-push` | máquina | `ISR_FUNCOES_CHAVE` |
| `bc-proxy`, `save-chamada`, `save-confirmation`, `save-feedback`, `save-interest`, `subscribe-push` | app da aluna | **ainda abertas** |

**Para valer:** Netlify → Site configuration → Environment variables →
criar `ISR_FUNCOES_CHAVE` com uma senha longa inventada na hora, e
fazer **Trigger deploy**. Enquanto a variável não existir, as seis
recusam tudo — não existe modo aberto, de propósito.

Quem chama de fora manda a chave no cabeçalho `x-isr-chave` ou no
campo `chave` do corpo.

### O portão da equipe

Quem confere a senha é o **Netlify Identity** — o mesmo serviço que as
alunas já usam no app. A tela manda e-mail e senha, o servidor devolve
um token assinado, e o token fica guardado no aparelho (`isr_gestao_token`,
renovado sozinho antes de vencer). É esse token que as funções vão
exigir. Entrar pelo console do navegador deixa de valer.

Quem o Identity autentica ainda precisa estar na equipe da escola: o
e-mail passa pelo `liberarGestao`, e quem não está não entra, mesmo
com a senha certa.

**Criar as contas** (uma vez, por pessoa): Netlify → Identity → Invite
users → o e-mail. A pessoa recebe um convite, abre, define a senha, e
daí em diante entra por `gestao.html`. Esqueceu a senha: "Esqueci
minha senha" na própria tela.

**Enquanto uma conta não existir**, aquela pessoa continua entrando só
com o e-mail, como antes, e a tela avisa que a conta está faltando. É
transição, não é para ficar: senha errada nunca abre essa porta, mas
quem souber um e-mail da equipe ainda entra. Assim que as quatro
contas existirem, o bloco marcado `PORTA DE TRANSIÇÃO` em `gestao.html`
sai do código.

### Os calendários de escola

A escola não tem **um** ciclo. As turmas online e a turma presencial
começam e terminam em datas diferentes. Enquanto havia uma janela só,
a agenda gerava aula presencial em semana sem aula presencial, e a
conferência cobrava chamada de aula que não houve.

| Tipo | Onde o ciclo em vigor mora | Como a aula é reconhecida |
|---|---|---|
| Turmas online | nas metas (`cicloLabel/Inicio/Fim`) | o padrão |
| Turma presencial | na lista de ciclos, com `tipo` e `atual` | "PRESENCIAL" no nome da turma |

Quem não informa um calendário próprio não muda de comportamento: o
tipo cai no calendário geral da escola, como sempre foi. É por isso
que o presencial nasce como "sem calendário próprio" em vez de nascer
vazio — vazio pareceria "não há aula".

**A aula particular não tem calendário de escola.** Cada uma depende
da aluna: é marcada numa data, dentro do contrato daquela pessoa, e
não existe um começo e um fim que valham para todas. Por isso:

- nenhuma janela filtra aula particular, e a chamada dela é cobrada
  em qualquer semana — inclusive no intervalo entre dois ciclos;
- a Central não oferece esse calendário, e diz por quê. Ausência
  silenciosa pareceria esquecimento;
- `particular` continua sendo um `tipo` reconhecido, para que um
  ciclo gravado antes desta decisão não seja lido como se fosse
  online. Esses ciclos ficam fora da união das janelas: um deles
  diria que há aula numa semana em que não há, e a agenda geraria
  aula de turma nela.

Com mais de um calendário, a conferência deixou de poder nomear **um**
ciclo: ela varre todos, e o nome escolhido seria o de um só. A tela
diz o período de verdade — "Desde 01/07" — em vez de "no ciclo
4.2026, de 31/08 a 07/11" diante de aulas de julho.

### Presença para todas, nas aulas sem chamada

Quando a pilha de chamadas não lançadas é grande, fazer uma a uma não
é a alternativa real — a alternativa real é não fazer, e sem chamada a
aluna não tem presença nem falta, e a frequência do certificado sai
menor do que a real.

`presencaParaTodos()` lança presença em todas as aulas sem chamada de
uma vez. Três travas:

1. **só escreve onde não existe chamada.** O que a professora lançou
   não é tocado, e nenhuma chamada antiga fica marcada como corrigida;
2. **duas etapas.** O primeiro clique simula e diz quantas aulas e
   quantas presenças; o segundo grava;
3. **a aula extra fica de fora.** Ela não tem lista de alunas, e
   inventar presença sem saber quem estava lá é inventar registro.

O lote vai para o mural da equipe, com quem fez e quanto. Quem faltou
se corrige depois, na chamada do dia, pelo Painel do professor.

### Meu progresso, no app da aluna

A aluna via aula, material e miles, e nunca a resposta para "como eu
estou indo?". Os números já existiam, cada um num canto: a chamada
sabe a frequência e a tarefa, a turma sabe o projeto e o nível, o
cadastro sabe o resto. `progressoDaAluna(pessoaId)` junta.

Duas decisões que mudam o número na tela:

- **o nível é o da turma**, não o do cadastro. O campo do cadastro
  guarda "Básico", "Intermediário" — como a escola conversa —, e o
  degrau do caminho está no nome da turma ("Essentials (A2)"). É
  dele que sai também o próximo passo;
- **a ausência justificada não conta contra.** Justificar existe
  exatamente para isso, então ela sai da conta em vez de virar
  falta. Presença e atraso contam como presença.

Sem chamada no ciclo, a tela diz isso em vez de mostrar 0%: zero é
uma afirmação, e seria falsa.

A entrada é um cartão no Início, não uma quinta aba — a barra de
baixo tem quatro, e uma quinta aperta tudo no celular. É o mesmo
caminho do desenho.

Os projetos que já passaram saem das turmas em que ela teve chamada.
É o único registro de onde ela esteve, e é verdade.

#### O certificado

"Já dá para tirar o meu certificado?" era pergunta de WhatsApp, e a
resposta saía de uma conta feita à mão. `certificadoDaAluna(pessoaId)`
responde, e responde **uma vez só para os dois lados**: é a mesma
função que a tela da gestão usa para imprimir o documento.

Isso corrigiu um defeito: a tela do certificado contava a frequência
de um jeito (ausência avisada contra a aluna, curso inteiro) e o app
dizia a ela outro (avisada fora da conta). Dizer um número à aluna e
imprimir outro no documento é pior do que não dizer nada.

No cartão ela vê os quatro números que o documento traz — nível,
carga horária agora, carga horária no fim do ciclo, frequência — e o
que falta, na ordem em que dá para agir: primeiro a presença, que ela
muda; depois as aulas que faltam para o ciclo fechar, que ela espera.

O documento só abre quando os dois estão cumpridos: **presença acima
do mínimo e ciclo fechado**. Aberto pela aluna (`&de=app`), o
certificado não mostra o caminho de volta para a lista de alunas da
escola — só imprimir ou salvar em PDF.

### Os clubes

Clube é encontro de conversa por tema, fora da aula: Book Club,
Movie Lovers, Chef Traditions. A escola vendia **um** (o Book Club,
com um link solto na configuração) e agora oferece vários.

A regra comercial é o que exige modelo de verdade: **os dois
primeiros clubes de cada aluna vêm no plano; do terceiro em diante
ela paga.** Quem decide quais dois são os incluídos é a **ordem de
entrada**, por isso cada entrada fica carimbada. Duas entradas no
mesmo milissegundo empatavam e o desempate caía no nome do clube — a
aluna entrava no terceiro e o sistema cobrava o segundo —, então o
carimbo é estritamente crescente.

- vaga é limitada, então existe **lista de espera**: quem sai libera
  a vaga e a primeira da espera entra no lugar, já carimbada;
- sair de um clube antigo pode tornar **incluído** um que era pago, e
  o cálculo é sempre pela lista atual, nunca por um campo guardado;
- clube nasce **rascunho** (só a equipe vê) e vira **publicado**;
- presencial exige endereço — clube presencial sem onde é não é
  oferta, é promessa.

Na tela, duas vistas: **por clube** (quem está em cada um, adicionar,
tirar, lista de espera) e **por aluna** (em que clubes ela está e o
que é pago). O bloco amarelo no topo lista quem está num terceiro
clube sem ter pago: dinheiro que não é cobrado some sem ninguém
notar.

`isr_clubes_v1` anda no sync por registro e entra na cópia de
segurança. Os ciclos fechados (`isr_ciclos_v1`) também — estavam de
fora, e são o arquivo de cinco anos.

#### O lado da aluna

A inscrição era pedida por fora — no WhatsApp, para quem lembrasse de
pedir. A aluna não via em que clubes estava, nem o que havia aberto,
e a escola perdia a inscrição que ela faria sozinha.

No app da aluna, `Clubes` entra por um cartão no Início (a barra de
baixo tem quatro abas; uma quinta aperta tudo no celular) e abre em
duas:

- **Meus clubes** — cada clube com dia, hora, onde, os encontros com
  data e tema, o material de consulta e `sair deste clube`. O selo diz
  o que é: *no seu plano*, *3º clube · pago*, *3º clube · a pagar*;
- **Todos os clubes** — só o que está publicado. Cada um traz o botão,
  as vagas que sobram e uma linha que diz, **antes do clique**, se
  aquele seria o 1º, o 2º ou o 3º clube dela: *"Do terceiro em diante a
  escola cobra à parte"*. A aluna não pode descobrir a cobrança pela
  fatura.

Clube lotado não esconde o botão: ele vira `entrar na lista de espera`,
e depois do clique ela sabe em que posição ficou. Entrar num terceiro
registra a inscrição como **a pagar**, e ela aparece na hora no bloco
de pendentes da tela de Clubes da gestão.

### O histórico de uma chamada

Cada gravação de chamada acrescenta uma linha a `hist`, dentro do
próprio registro: **quem, quando, e o quê** — "chamada salva", "2
presenças alteradas", "regravada sem mudança".

Os campos `corrigidaPor` e `corrigidaEm` continuam ali, mas guardam
só a ÚLTIMA correção: duas seguidas e a primeira some. Numa chamada
que a professora e a gestão mexem alternadamente, e que a escola
guarda por cinco anos, "quem mudou o quê" só se responde com a lista
inteira.

- a lista para em **20 linhas**, mantendo a primeira (a origem) e as
  19 últimas. Uma chamada reaberta muitas vezes não pode crescer sem
  fim dentro do registro;
- chamada gravada antes disto existir não começa vazia: o que já
  estava nela (`criadaPor`/`criadaEm` e a última correção) vira as
  primeiras linhas;
- aparece no Painel do professor, embaixo da grade — a tela onde a
  chamada é feita e corrigida.

Uma ressalva do sync: a chamada é fundida por registro inteiro, pelo
`salvoEm` mais novo. Se dois aparelhos editarem a mesma chamada sem
rede, o que perder leva junto as linhas de histórico dele — como já
levava as presenças. O histórico não piora isso, mas também não
resolve.

### O ciclo, e o arquivo de cinco anos

A escola vende ciclo, e é o ciclo que a agenda usa para saber em que
dias há aula. Por muito tempo isso foi **um** campo: abrir o ciclo
seguinte apagava o anterior, e com ele a resposta para "quais aulas
deveriam ter acontecido entre julho e outubro". Para frequência e
certificado, que a escola guarda por anos, um campo que se
sobrescreve não serve.

Agora cada ciclo fechado vira uma linha guardada (`isr_ciclos_v1`),
que anda no sync e é carimbada no backup da planilha. Disso decorre:

- **a aula de um ciclo passado continua tendo existido.** Trocar de
  ciclo não apaga a história, e a chamada retroativa continua
  possível — pelo Painel do professor, em "outra data · chamada
  retroativa", sem limite de prazo;
- **a conferência de chamada é do ciclo inteiro**, não de 21 dias
  corridos como antes. A aula de 22 dias atrás sumia da lista sem
  nunca ter sido lançada, e a frequência ficava furada em silêncio;
- **no intervalo entre dois ciclos**, quem está em conferência é o que
  acabou de fechar — é dele que as chamadas ainda faltam e é dele que
  sai o certificado;
- a agenda não gera aula no intervalo, nem antes do primeiro ciclo.

A chamada, uma vez salva, não é apagada por nada: fica em
`isr_chamadas_v1`, vai no sync e é carimbada em aba legível da
planilha. É esse o arquivo de cinco anos.

### A base

O navegador falava direto com o Apps Script, com o endereço escrito em
`crm-data.js` — um arquivo público. Agora o pedido vai para a função
`base`, que confere o token da pessoa e só então fala com o Apps
Script, com endereço e chave que ficam no servidor.

**Como está ligando, em dois passos.** O primeiro já está no ar: o
navegador prefere a função e, se ela não responder, cai no caminho
antigo. Assim nada para enquanto as contas do Identity não existem.

Passo 1 — agora:

1. Netlify → Environment variables → `ISR_BASE_URL` = o endereço do
   Web App do banco central (o mesmo que está em `crm-data.js`).
2. Trigger deploy. Abra a Central e confira que a sincronização
   continua funcionando. No console do navegador, o aviso "falando com
   a base pelo caminho antigo" diz que a função não está sendo usada.

Passo 2 — quando o passo 1 estiver funcionando para toda a equipe:

1. Apps Script → Configurações do projeto → Propriedades do script →
   `ISR_BASE_CHAVE` com uma senha longa.
2. A mesma string em Netlify → `ISR_BASE_CHAVE` → Trigger deploy.
3. Publicar o Apps Script de novo (Implantar → Gerenciar implantações
   → editar → Nova versão).
4. Avisar, que aí sai do `crm-data.js` a rede do caminho antigo e o
   endereço do Web App.

Enquanto a propriedade não existir no Apps Script, ele aceita como
sempre aceitou — é isso que permite ligar a chave sem derrubar a
escola no meio do expediente. As ações do Zapier (`novoCadastro`,
`assinaturaEvento`, `novaAtividade`) nunca são trancadas.

**O endereço de hoje está no git desde sempre.** Depois do passo 2, a
chave já basta para fechar a porta; mas quem clonou o repositório
continua com o endereço. Uma implantação nova, com endereço novo em
`ISR_BASE_URL`, resolve isso de vez — e aí só o servidor o conhece.

### O que ainda está aberto

1. **As seis funções do app da aluna.** Precisam do token da aluna
   (Netlify Identity), não de uma chave fixa.
2. **A porta de transição do portão**, em `gestao.html`: enquanto uma
   conta não existir, aquela pessoa entra só com o e-mail.
3. **A guarda das telas** (`guardGestao`, em `crm-data.js`) roda no
   navegador. Serve para ninguém cair numa tela por engano. Não é
   proteção.

---

## As telas, no desenho novo

O sistema foi redesenhado tela a tela. A versão nova de cada uma tem
`v3` no nome do arquivo. As antigas foram apagadas quando o desenho
novo ficou pronto; os endereços delas continuam funcionando, por
redirecionamento no `netlify.toml`, para não quebrar link salvo. Quem
precisar da tela antiga a encontra no histórico do git.

| Menu | Arquivo | Endereço curto |
|---|---|---|
| Central | `ISR - Central v3.dc.html` | `/central.html` |
| Painel do professor | `ISR - Painel v3.dc.html` | `/professor.html` |
| Alunas | `ISR - Alunas v3.dc.html` | `/alunas.html` |
| CRM · Funil | `ISR - CRM v3.dc.html` | `/crm.html` |
| Mensagens | `ISR - Mensagens v3.dc.html` | `/mensagens.html` |
| Matrículas do ciclo | `ISR - Matriculas ciclo v3.dc.html` | `/ciclo.html` |
| Calculadora de preços | `ISR - Calculadora v3.dc.html` | `/precos.html` |
| Acompanhamento | `ISR - Acompanhamento v3.dc.html` | `/acompanhamento.html` |
| Contas a receber | `ISR - Cobrança v3.dc.html` | `/cobranca.html` |
| Caixa | `ISR - Caixa v3.dc.html` | `/caixa.html` |
| Folha | `ISR - Folha v3.dc.html` | `/folha.html` |
| Turmas e projetos | `ISR - Turmas v3.dc.html` | `/turmas.html` |
| Clubes | `ISR - Clubes v3.dc.html` | `/clubes.html` |
| Gravações | `ISR - Gravacoes v3.dc.html` | `/gravacoes.html` |
| Agenda | `ISR - Agenda v3.dc.html` | `/agenda.html` |
| Marketing | `ISR - Marketing v3.dc.html` | `/marketing.html` |
| Importar | `ISR - Importar v3.dc.html` | `/importar.html` |
| Equipe | `ISR - Equipe v3.dc.html` | `/equipe.html` |
| Dados | `ISR - Dados v3.dc.html` | `/dados.html` |
| Conexão | `gestao.html?config` | — |

Fora do menu, abertas por clique: a matrícula
(`ISR - Matrícula v3.dc.html`, `/matricula.html`), o perfil de uma
pessoa (`ISR - Perfil v3.dc.html?id=`, `/perfil.html?id=`) e a página
de uma turma (`ISR - Turma v3.dc.html?id=`, `/turma.html?id=`).

`/desafio.html` é o material da aluna, semana a semana. A tela de
gestão do desafio foi apagada com o resto do que o v5 não tem.

As telas das alunas — `ISR - Aluna`, `ISR - Aulas`, `ISR - Certificado`,
`ISR - Comunidade`, `ISR - Tela de Aula` e o portal — não entraram no
redesenho: têm desenho próprio e público próprio.

### Como uma tela foi portada

Três foram reescritas à mão (Central, Painel, Alunas). As outras
passaram pelo `repintar-v3.py`: ele separa a marcação da lógica no
`<script type="text/x-dc" data-dc-script`, repinta só a marcação
(superfície, borda, raio, cor, peso, campo de formulário) e devolve a
lógica intacta. Esquecer um `{{ campo }}` quebra a tela em silêncio, e
reescrever 1.100 linhas à mão para mudar cor era o jeito mais fácil de
esquecer um.

A conferência depois do porte compara os `{{ campo }}` das duas
marcações: campo que existia na tela antiga e não existe na nova é
candidato a recurso perdido. Das onze repintadas, nenhuma perdeu campo.
A Central, que foi reescrita, perdeu — e é por isso que a reescrita só
vale quando a tela muda de ideia, não só de cor.
