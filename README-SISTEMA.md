# ISR — Sistema da Escola · Guia de Telas (para revisão de UX)

**Produto:** Sistema de gestão do Inglês sem Roteiro (CRM, cobrança, pedagógico e marketing)
**Stack:** telas HTML (framework DC) + Netlify + Google Apps Script/Planilhas
**Estado:** funcional com dados de demonstração no navegador (localStorage); integrações com as planilhas reais prontas em `apps-script-integracoes.js`
**Última atualização:** Julho 2026

---

## Mapa de navegação

```
index.html → Login (Magic Link) → Área do aluno / Painel do professor   (app já existente)

launcher.html  (visão geral de todas as telas, com miniaturas)
└── ISR - Central.dc.html  ······················· HOME DO SISTEMA (gestão)
    ├── 🎯 Comercial
    │   ├── ISR - CRM (Funil de Leads).dc.html
    │   └── ISR - Mensagens WhatsApp.dc.html
    ├── 💰 Gestão
    │   ├── ISR - Cobrança.dc.html
    │   └── ISR App (Conectado).dc.html  (app do aluno, já existia)
    ├── 📚 Pedagógico
    │   ├── ISR - Turmas e Projetos.dc.html
    │   └── ISR - Painel do Professor.dc.html  (já existia)
    └── 📣 Marketing
        ├── ISR - Marketing.dc.html
        └── launcher.html
```

Todas as telas de gestão têm um botão **⌂ Central** no topo para voltar à home.

---

## 1. HOME — `ISR - Central.dc.html`

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

## 2. COMERCIAL — `ISR - CRM (Funil de Leads).dc.html`

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

## 3. COMERCIAL — `ISR - Mensagens WhatsApp.dc.html`

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

## 4. GESTÃO — `ISR - Cobrança.dc.html`

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

## 5. PEDAGÓGICO — `ISR - Turmas e Projetos.dc.html`

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

## 6. MARKETING — `ISR - Marketing.dc.html`

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
