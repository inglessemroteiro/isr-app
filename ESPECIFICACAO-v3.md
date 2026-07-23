# ISR — Sistema da Escola · Especificação v3

**Produto:** Sistema de gestão do Inglês sem Roteiro (CRM, cobrança, caixa, pedagógico, marketing e área da aluna)
**Stack:** telas HTML (framework DC) + Netlify + Google Apps Script/Planilhas
**Estado:** telas de gestão funcionais com dados demo (localStorage); integrações reais em `apps-script-integracoes.js`
**Este documento serve a dois leitores:** o **designer** (comportamento, hierarquia e estados de cada tela) e o **Claude Code** (de onde vem cada dado — seção "Fonte" em todos os componentes).
**Última atualização:** Julho 2026 (v3)

---

## PARTE 1 · FUNDAÇÕES

### 1.1 Princípios (inegociáveis)

1. **Uma pessoa = um registro, para sempre.** Lead, aluna, pausada, ex-aluna, MVS: a mesma pessoa mudando de `status`. Todo nome, em qualquer tela, é link para o Perfil.
2. **O sistema diz o que fazer.** Cada perfil de acesso tem sua fila "Para hoje", gerada por regras. Fila vazia = nada a fazer. Ninguém varre listas.
3. **Todo dado nasce uma vez, de uma ação.** Enviar mensagem registra contato; matricular cria contrato, parcelas e vaga; marcar presença alimenta o sinal de risco. Digitação avulsa é falha de design.
4. **€ e R$ nunca se somam.** Moeda é atributo do contrato; toda tela mostra as duas separadas.
5. **O sistema é radar, não arquivo.** Verdade contábil profunda = ISR Financeiro (Excel). Atas = Google Docs. O sistema mostra o que muda uma decisão *desta semana*; o resto é link.

### 1.2 Perfis de acesso (novo na v3)

O sistema deixa de assumir uma usuária única. Login (magic link, já existente) resolve o perfil e monta navegação, Central e fila próprias.

|Área / recurso            |👑 Gestora (Gabi)     |🎯 Comercial (Carla)               |🗂 Operação (Érika)                          |📚 Professora                    |🎒 Aluna  |
|--------------------------|---------------------|----------------------------------|--------------------------------------------|--------------------------------|---------|
|Central + fila "Para hoje"|tudo (soma das filas)|fila comercial                    |fila de operação                            |fila pedagógica                 |—        |
|CRM / Funil               |✔                    |✔                                 |leitura                                     |—                               |—        |
|Mensagens WhatsApp        |✔                    |✔ (categorias Leads/Renovação/MVS)|✔ (categorias Pagamento/Check-in/Onboarding)|—                               |—        |
|Cobrança · Parcelas       |✔                    |—                                 |✔                                           |—                               |—        |
|Cobrança · Renovações     |✔                    |✔ (conversa/proposta)             |leitura                                     |—                               |—        |
|**Caixa 90 dias**         |✔                    |—                                 |—                                           |—                               |—        |
|Custos e margem por turma |✔                    |—                                 |—                                           |—                               |—        |
|Turmas & vagas            |✔                    |✔ (vagas, sem custos)             |leitura                                     |suas turmas                     |—        |
|Perfil da Pessoa          |completo             |sem LTV/custos                    |completo                                    |bloco pedagógico das suas alunas|o próprio|
|Marketing                 |✔                    |leitura                           |—                                           |—                               |—        |
|Área da Aluna             |preview              |—                                 |—                                           |—                               |✔        |

**Regra de ouro para o designer:** não é "esconder botões" — cada perfil tem uma *experiência inteira* menor. A Carla abre o sistema e ele parece feito só pra ela.

### 1.3 Arquitetura de dados — de onde vem cada informação

**Fontes de verdade (as planilhas/arquivos existentes):**

|Fonte                       |ID/Nome              |O que guarda                                    |Alimenta                                                                                   |
|----------------------------|---------------------|------------------------------------------------|-------------------------------------------------------------------------------------------|
|`ISR_Planilha_Mestra`       |master do app        |pessoas, turmas, matrículas, presença           |Perfil, Turmas, Área da Aluna, sinais de risco                                             |
|`[ISR] MKT - Leads_e_Alunos`|leads + origem/pixels|funil, utm, canal, histórico de contato         |CRM, Marketing, Perfil (timeline de origem)                                                |
|`[ISR] Planilha Renovações` |contratos e parcelas |tipo, ciclos, valores, moeda, vencimentos, pagas|Cobrança, Caixa, Perfil (bloco financeiro), LTV                                            |
|`[ISR] Units of study`      |pedagógico           |projetos por turma/ciclo, cadernos, materiais   |Turmas & Projetos, Área da Aluna                                                           |
|`ISR Financeiro 3.1` (Excel)|verdade contábil     |matriz de custos fixos, MRR, metas              |Caixa (linha de custos — **importa, não redigita**), margem por turma                      |
|Google Docs "Admin meeting" |atas                 |decisões e action items                         |**só os action items** entram (fila "Para hoje"); ata fica no Docs com link fixo na Central|
|Google Agenda               |agenda               |onboardings, reuniões                           |checkpoints de onboarding                                                                  |

**Migração obrigatória antes de conectar dados reais (bloqueante):** unificar `Leads_e_Alunos` + `Renovações` + pessoas da `Mestra` num **cadastro único de Pessoas** (chave: WhatsApp normalizado; fallback e-mail). Cada linha vira um registro com:

```
Pessoa {
  id, nome, whatsapp, email, moeda
  status: lead | aluna | pausada | ex-aluna | mvs
  estagio: (lead → 7 estágios do funil) | (aluna → em_dia | em_risco | em_renovacao)
  origem: { canal, utm, campanha, veio_de, entrou_por }        // gravado 1x, imutável
  formatos: [grupo | particular | nanny | mvs]                  // pode ter vários (upsell)
  turma_atual, professora, nivel
  contratos: [{ tipo, ciclos, moeda, valor_parcela, parcelas: [{mes, valor, venc, paga}] }]
  historico: [{ data, tipo, quem, detalhe }]                    // timeline única, append-only
  documentos: [{ nome, link_drive }]
  risco: { faltas_seguidas, dias_sem_resposta, projeto_pendente }   // calculado, não digitado
}
```

**Para o Claude Code:** `apps-script-integracoes.js` passa a expor uma função por entidade (`getPessoas()`, `getTurmas()`, `getParcelas()`, `getCustosFixos()`), e as telas consomem só essas funções — nunca leem planilha direto. Escrever = sempre via ação de tela que também grava no `historico`.

---

## PARTE 2 · MAPA DE NAVEGAÇÃO

```
index.html → Login (Magic Link) → resolve o PERFIL DE ACESSO
│
├── 🎒 Aluna  →  ISR App (Área da Aluna)                        [seção 12]
├── 📚 Professora  →  Painel do Professor (já existe) + Turmas (leitura)
│
└── Gestão (Gestora / Comercial / Operação) → ISR - Central.dc.html
    ├── 👤 ISR - Perfil.dc.html ·························· aberto pelo nome, de qualquer tela
    ├── 🎯 Comercial
    │   ├── ISR - CRM (Funil de Leads).dc.html
    │   └── ISR - Mensagens WhatsApp.dc.html
    ├── 💰 Gestão
    │   ├── ISR - Cobrança.dc.html  (abas: Parcelas · Renovações)
    │   └── ISR - Caixa.dc.html ······················· NOVA (só Gestora)
    ├── 📚 Pedagógico
    │   └── ISR - Turmas e Projetos.dc.html  (ocupação + capacidade de professora)
    └── 📣 Marketing
        └── ISR - Marketing.dc.html
```

Todas as telas: **⌂ Central** no topo. Todo nome de pessoa: link teal sublinhado → Perfil.

---

## PARTE 3 · MOTOR DE FILAS E RISCO (não é tela — é o que alimenta tudo)

### 3.1 Regras que geram itens na fila "Para hoje"

|#  |Regra                                                   |Fonte do dado              |Vai para a fila de            |Ação sugerida no item          |
|---|--------------------------------------------------------|---------------------------|------------------------------|-------------------------------|
|R1 |Follow-up de lead vence hoje/venceu                     |Pessoas (funil)            |Comercial                     |✈️ mensagem do estágio          |
|R2 |Inscrição incompleta > 24h                              |Pessoas (funil)            |Comercial                     |mensagem "inscrição incompleta"|
|R3 |Parcela atrasada                                        |Parcelas                   |Operação                      |⚠️ cobrar atraso                |
|R4 |Parcela vence em 3 dias                                 |Parcelas                   |Operação                      |🔔 lembrete                     |
|R5 |Contrato termina em ≤ 45 dias                           |Contratos                  |Comercial (renovação)         |🔄 abrir conversa de renovação  |
|R6 |**Risco: 3 faltas seguidas**                            |Presença (Mestra/app)      |Gestora + Professora          |💛 check-in                     |
|R7 |**Risco: sem resposta há 10 dias** (aluna ativa)        |historico (contatos)       |Operação                      |check-in                       |
|R8 |**Risco: projeto do ciclo não entregue** na semana final|Units of study + app       |Professora                    |toque pedagógico               |
|R9 |Turma lotada ou com 1 vaga                              |Ocupação (calculada)       |Gestora                       |avaliar novo horário           |
|R10|**Onboarding: checkpoint pendente** (ver 3.2)           |Agenda + historico         |Operação                      |mensagem do checkpoint         |
|R11|**Action item de ata vencendo**                         |registro manual pós-reunião|responsável (Carla/Érika/Gabi)|marcar feito                   |
|R12|Ex-aluna "momento errado" completou 6 meses             |Pessoas (motivo de perda)  |Comercial                     |💬 reativar                     |

**Design da fila:** lista única ordenada por urgência, máx. 15 itens visíveis + "ver todos (N)". Cada item: ícone da regra · nome (→ Perfil) · o motivo em 1 linha · **1 botão de ação** (a da tabela) · "adiar" discreto. Item resolvido some com micro-animação — a fila precisa *parecer terminável*.

### 3.2 Jornada de onboarding (checkpoints, não só boas-vindas)

Ao virar aluna, o sistema cria 4 checkpoints com data:

`D0 boas-vindas enviadas → D+2 confirmou 1ª aula → D+7 check-in pós-1ª semana → D+30 1º pagamento ok + NPS rápido`

Checkpoint sem confirmação na data → R10 dispara. As 3 primeiras semanas decidem quantos ciclos a pessoa fica; isso transforma "boas-vindas" em processo com dono (Érika).

### 3.3 NPS por ciclo (mínimo viável)

Na última semana do ciclo, a Área da Aluna mostra 1 pergunta (0–10 + campo opcional "por quê"). Grava em `historico`. Marketing agrega por turma/professora/ciclo. Nada de formulário externo.

---

## PARTE 4 · TELAS DE GESTÃO

### 4. CENTRAL — `ISR - Central.dc.html`

Fundo teal #164951. Responde: **o que precisa de mim hoje, e estamos no ritmo da meta?** A Central é *sensível ao perfil* — abaixo, a versão da Gestora; Carla e Érika veem só sua fila + seus cards.

De cima para baixo:

1. **Cabeçalho** — eyebrow "INGLÊS SEM ROTEIRO" · "Central do Sistema" · "Bom dia, {nome}".
2. **Fila "Para hoje"** (seção 3.1) — o elemento principal da página, acima de tudo.
3. **Linha de meta do ciclo** — barra dupla: `Matrículas X/Y · Renovações X/Y`. Fonte: Pessoas (contagem no ciclo) vs. meta digitada 1x por ciclo (Config). Clique → Marketing.
4. **4 cards de área** (grid; faixa colorida no topo):
- **Comercial** coral: "para hoje (comercial)" · "matrículas no ciclo vs. meta" → CRM · Mensagens
- **Gestão** teal-claro: "atrasadas" · "saldo previsto 30 dias (€ | R$)" → Cobrança · **Caixa**
- **Pedagógico** roxo: "vagas abertas" · "alunas em risco" → Turmas · Painel professor
- **Marketing** caramelo: "leads novos na semana" · "conversão do ciclo" → Marketing
5. **Rodapé de links fixos:** 📄 Atas (Google Docs) · 📊 ISR Financeiro (Excel) · Launcher.

**Fonte dos números:** filas (motor 3.1) · Parcelas (atrasadas, saldo 30d) · Ocupação calculada (vagas) · risco calculado (R6–R8) · Pessoas (leads da semana, conversão).

---

### 5. PERFIL DA PESSOA — `ISR - Perfil.dc.html`

Toda a relação em uma tela. É o que permite Carla negociar, Érika cobrar e Gabi decidir desconto sem perguntar nada a ninguém.

**Cabeçalho:** nome grande + badge de status · linha de contexto: turma/nível · professora · **"conosco desde fev/2025 · 1 ano e 5 meses"** · moeda · badge ⚠️ *em risco* quando R6–R8 ativo (com o motivo no hover/toque). Botões: **💬 WhatsApp** (abre Mensagens com a pessoa selecionada) · menu **···** (editar, pausar, arquivar).

**Coluna esquerda — A relação:**

|Bloco                |Conteúdo                                                                                                                                                         |Fonte                                                              |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------|
|**Linha do tempo**   |timeline única: 1º contato (com origem) → conversas → matrícula → ciclos + projetos → renovações → pausas → NPS → notas. Bolinhas coloridas por tipo. Só leitura.|`historico` (append-only, alimentado pelas ações de todas as telas)|
|**"Adicionar nota…"**|único input livre; Enter salva                                                                                                                                   |grava em `historico`                                               |

**Coluna direita — Números e documentos:**

|Bloco                    |Conteúdo                                                                                                             |Fonte                              |
|-------------------------|---------------------------------------------------------------------------------------------------------------------|-----------------------------------|
|**Contrato vigente**     |tipo · ciclos · parcela · vencimento · **grade de parcelas** (mesmo componente da Cobrança — marcar aqui = marcar lá)|`contratos` (Renovações)           |
|**Total investido (LTV)**|soma histórica na moeda da pessoa — *oculto no perfil Comercial*                                                     |`contratos`                        |
|**Pedagógico**           |nível · turmas anteriores · projetos concluídos · presença do ciclo (%)                                              |Mestra + Units + app               |
|**📎 Documentos**         |links Drive (contrato assinado, acordos, comprovantes) + **+ Adicionar link**                                        |`documentos`                       |
|**Ações rápidas**        |🔔 Lembrete · ✅ Confirmar pagamento · 🔄 Renovação · 💛 Check-in — modelos já preenchidos                               |Mensagens (registra em `historico`)|

**Se a pessoa é lead:** coluna direita mostra o painel do funil (estágio, follow-up, origem detalhada) no lugar do contrato. Uma pessoa, uma tela, dois momentos.

**Mobile (designer):** as duas colunas viram abas — "Relação" / "Números".

---

### 6. CRM — `ISR - CRM (Funil de Leads).dc.html`

**Topo:** título + **💬 Mensagens** + **↺ Demo**. Faixa `🎯 N novas inscrições hoje` quando houver.
**Abas** (pills roláveis, com contador): `Para hoje · A contatar · Em conversa · Reunião · Contrato · Incompletas · Matriculados · Perdidos`. "Para hoje" = R1 + R2 + R12.
**Linha do lead** (borda esquerda na cor do estágio): Nome (→ Perfil) + badge · Entrou (relativo, ⚠️ ≥14 dias parado) · Turma de interesse · Origem (pill). Clique expande.

**Painel expandido — hierarquia de ações (v2 mantida):**

- **Primárias** (largas): **✈️ Enviar mensagem do estágio** · **✓ Registrar contato**
- **Secundárias:** chips dos 7 estágios · follow-up (Amanhã · 3 dias · Próx. semana · data)
- **Menu ···:** Agendar reunião · Marcar perdido · Excluir
- **Histórico** (timeline) · nota rápida · cartão Origem detalhada (só leitura)

**Comportamentos-chave:**

- ✈️ Enviar → abre `wa.me` **e** grava contato no `historico` (nome do modelo). Nada é enviado sem revisão humana.
- **Marcar perdido** → modal obrigatório de motivo: `Preço · Horário · Sumiu · Concorrente · Momento errado · Outro`. Fonte do gráfico de perdas (Marketing) e da régua R12.
- **Mover para Matriculados** → mini-formulário de transição: turma (dropdown com vagas visíveis: "SEG 19h · 2 vagas") + contrato (tipo, ciclos, valor, moeda, dia de vencimento). Ao salvar: `status→aluna`, contrato+parcelas criados, vaga ocupada, checkpoints de onboarding criados (3.2). **Zero recadastro.**

**Fonte:** Pessoas (funil) · Ocupação (dropdown de turma) · Mensagens (modelos).

---

### 7. MENSAGENS — `ISR - Mensagens WhatsApp.dc.html`

**Topo:** título + **← Voltar**. **Categorias** (pills): `Leads · Pagamento · Alunos · Check-in · Onboarding · Renovação · MVS` (as duas últimas: novas). **Para:** dropdown "Nome · status · turma" (nome → Perfil).

**2 colunas:** esquerda = busca + lista de modelos (ativo com barra teal); direita = editor com variáveis preenchidas (nome, turma, valor, vencimento, link) e pendências como `[DESTACADO: campo]` + aviso pra completar.

**Modelos por categoria:** os 15 da v1 + Renovação (abrir conversa 45d · proposta · lembrete de decisão · boas-vindas ao novo ciclo) + MVS (boas-vindas · check-in semanal · convite de upsell pra grupo).

|Botão                   |Ação                             |Efeito no dado                                 |
|------------------------|---------------------------------|-----------------------------------------------|
|**💬 Enviar no WhatsApp**|abre `wa.me/<número>` com o texto|grava contato em `historico` com o modelo usado|
|**Copiar**              |copia (vira "✓ Copiado" 1,6s)    |também grava contato (marcado "copiado")       |

Rodapé mantém: nada é enviado automaticamente.

**Fonte das variáveis:** Pessoas (nome, turma) · Contratos (valor, vencimento) · Config (links de pagamento).

---

### 8. COBRANÇA — `ISR - Cobrança.dc.html` · abas **Parcelas** e **Renovações**

#### Aba Parcelas (Érika vive aqui)

- **Resumo do mês (3 cards):** A receber (€ | R$ **separados**) · Recebido (€ | R$) · **Atrasadas** (vermelho > 0).
- **Filtros:** `Todas · Atrasadas · Vence em breve · Pagas no mês · Quitadas · Auto matrícula`
- **Linha:** nome (→ Perfil) · "Tipo · Ciclos" · parcela ("R$ 345,00 · venc. dia 10") · progresso ("2/7") · badge de status.
- **Painel expandido:** grade de parcelas (Julho → Janeiro; paga = verde "✓"; mês corrente "● este mês"; **toast desfazer 5s** ao marcar — dado financeiro não muda silenciosamente) · 📝 observações · botões 🔔 Lembrete / ⚠️ Cobrar atraso / ✅ Confirmar recebimento (todos gravam contato).

**Fonte:** Contratos/Parcelas (Renovações). Marcar parcela aqui = mesma escrita que no Perfil (componente compartilhado).

#### Aba Renovações (funil de proteção da base)

- **Fila automática:** contrato termina em ≤ 45 dias → entra sozinha, ordenada por término. (R5)
- **Estágios** (chips): `A abordar → Em conversa → Proposta enviada → Renovada ✓ → Não renovou` — "Não renovou" pede motivo (mesma lista do CRM).
- **Linha:** nome (→ Perfil) · "termina em X dias" · LTV (só Gestora) · estágio · ✈️ mensagem de renovação.
- **Indicador do topo:** **taxa de renovação do ciclo** (renovadas/vencidas) — o número que protege a meta de 60.

---

### 9. CAIXA — `ISR - Caixa.dc.html` **(TELA NOVA · só Gestora)**

Responde a pergunta que hoje não tem resposta rápida: **"setembro fecha no azul?"**

1. **Cards do topo:** Saldo previsto 30 dias · 60 · 90 — cada um com € e R$ lado a lado, verde/vermelho pelo sinal.
2. **Gráfico principal (90 dias, por mês):** barras de **entradas previstas** (parcelas a vencer, empilhadas por moeda) − linha/área de **custos fixos** = **resultado do mês** rotulado em cima. Mês corrente destacado; meses de sazonalidade conhecida (jan/jul) com marcador ⚠️.
3. **Lista "o que compõe"** (expansível por mês): entradas (cada parcela: pessoa → Perfil, valor, dia) e saídas (linhas da matriz de custos: agência R$2.800, ferramentas, professoras…).
4. **Simulador simples (v1 do simulador):** dois steppers — "+N matrículas grupo" e "+N renovações" — e o gráfico re-renderiza. É o suficiente pra decidir "posso segurar a agência mais um ciclo?".

|Dado              |Fonte                                        |Observação para o Code                                                                  |
|------------------|---------------------------------------------|----------------------------------------------------------------------------------------|
|Entradas previstas|Parcelas não pagas com vencimento futuro     |direto do modelo — já existe                                                            |
|Recebido real     |Parcelas pagas                               |idem                                                                                    |
|Custos fixos      |**ISR Financeiro 3.1 → aba matriz de custos**|importar via Apps Script 1x/dia; editar custo continua sendo no Excel (fonte da verdade)|
|Sazonalidade      |histórico de matrículas/evasão por mês       |fase 2; v1 pode ser marcador manual em jan/jul                                          |

---

### 10. TURMAS & PROJETOS — `ISR - Turmas e Projetos.dc.html`

Mantém: seções por nível (A0 caramelo → A1 coral → A2 teal → B1 roxo), filtro por professora, projeto do ciclo e caderno no card.

**Card de turma (v3):**

- Barra do nível · horário ("MON 7h BR | 12h NL") · 👩‍🏫 professora · ciclo
- **Ocupação:** `7/10 · ▓▓▓▓▓▓▓░░░` — verde (vagas) / âmbar (1 vaga) / vermelho (lotada). **Fonte:** contagem de Pessoas ativas com a turma no contrato — ninguém digita.
- **Projeto do ciclo** em destaque · 📓 caderno (ou ⚠️ sem caderno)
- **Alunas em risco na turma:** `⚠️ 2` quando R6–R8 ativo (clique lista as pessoas) — *visível para Gestora e para a professora da turma*
- **Margem da turma** *(só Gestora)*: receita mensal da turma − custo/hora da professora × horas. **Fonte:** Contratos + matriz de custos (Financeiro). É o número que decide abrir/consolidar horário.

**Filtros novos:** `Com vagas · Lotadas` (a visão da Carla durante a venda).

**Painel de capacidade de professoras (topo da tela, só Gestora):** uma linha por professora: horas/semana dadas vs. disponíveis (barra) · nº de turmas · custo/hora. **Fonte:** grade de turmas + disponibilidade digitada 1x em Config + custos do Financeiro. Responde "quem pode absorver a próxima turma?" — o gargalo real dos 60, segundo a revisão da dona de escola 100+.

---

### 11. MARKETING — `ISR - Marketing.dc.html`

1. **Meta vs. realizado do ciclo** (topo — mesma barra da Central).
2. **Leads por semana** (barras, 8 semanas) — a agência está funcionando *antes* de outubro? **Fonte:** Pessoas (data de criação).
3. **Totais:** leads no funil · matriculadas · perdidas · conversão.
4. **Por canal:** cartão com total + pill de conversão + barra empilhada (matriculadas/funil/perdidas). **Fonte:** origem imutável do registro.
5. **Motivos de perda** (barras — CRM + Renovações somados): se "horário" domina, o problema é grade, não anúncio.
6. **Funil MVS:** entradas · ativas · **upsell → grupo (%)**. **Fonte:** Pessoas com formato `mvs` e transições de formato no `historico`.
7. **NPS por ciclo** (média + distribuição por turma/professora). **Fonte:** respostas na Área da Aluna (3.3).
8. **Origens detalhadas (pixels):** tabela nome · string (`ig · social · carol-matriculas-trafego`) · veio de.

---

## PARTE 5 · ÁREA DA ALUNA

### 12. `ISR App` — Área da Aluna (evolução do app existente)

O app já existe (login magic link, papéis aluna/professora). A v3 o conecta ao modelo de Pessoa única — a área da aluna é **a mesma Pessoa, vista por ela**. Princípio de marca: a área da aluna não é "portal de cobrança"; é onde ela **vê o próprio progresso e se sente capaz** (anti-perfeccionismo é posicionamento — o design precisa refletir isso: celebração > pendência).

**Home da aluna, de cima para baixo:**

|Bloco                            |Conteúdo                                                                                                               |Fonte             |Alimenta de volta                        |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------|------------------|-----------------------------------------|
|**Saudação + próximo passo**     |"Oi, {nome}! Sua próxima aula: QUA 19h · {projeto}"                                                                    |Turmas + Units    |—                                        |
|**Projeto do ciclo**             |nome, descrição curta, materiais (caderno/links), entrega                                                              |Units of study    |entrega marcada → limpa R8               |
|**Meu progresso**                |ciclos concluídos (linha do tempo visual), nível, projetos feitos, presença do ciclo (%) — celebratório, nunca punitivo|Mestra + historico|—                                        |
|**Confirmação de presença/aula** |"confirmar presença" pós-aula (ou professora marca no painel)                                                          |grava presença    |alimenta R6 (risco)                      |
|**Pagamentos (discreto, no fim)**|próxima parcela (valor + venc.) e botão do link de pagamento; recibos                                                  |Parcelas          |—                                        |
|**NPS do ciclo**                 |última semana do ciclo: 0–10 + "por quê" opcional, 1 tela                                                              |—                 |Marketing + historico                    |
|**Onboarding (só novas)**        |checklist dos primeiros 30 dias (1ª aula, materiais, grupo de WhatsApp)                                                |checkpoints 3.2   |checkpoint ok → limpa R10                |
|**MVS (se formato mvs)**         |as 8 situações do programa, rubrica de estrelas, convite pra experimentar grupo                                        |materiais MVS     |clique no convite → lead de upsell no CRM|

**O que a aluna NÃO vê:** funil, LTV, risco, custos, notas internas — nada da gestão vaza.

**Para o designer:** mesma paleta, mas hierarquia invertida em relação à gestão — a gestão prioriza *pendência*; a área da aluna prioriza *conquista* (progresso e projeto em cima, pagamento discreto embaixo).

---

## PARTE 6 · APOIO

### 13. Config (tela simples, só Gestora)

Digitado 1x por ciclo, nada operacional: metas (matrículas/renovações) · links de pagamento · disponibilidade das professoras (h/semana) · datas do ciclo · link do doc de atas. **Action items de ata:** formulário de 3 campos (o quê · quem · quando) preenchido ao fim da reunião de terça → vira R11 na fila do responsável. A ata em si permanece no Docs.

### 14. Design system

- **Cores:** teal #164951 · teal claro #2a9d8f · coral #e07856 · roxo #6b5b95 · caramelo #d4a574 · verde #5a9e4b · vermelho #cf6b5c · creme #faf8f3 · WhatsApp #25D366
- **Tipografia:** Helvetica Neue; títulos 26px bold, letter-spacing negativo; labels 8–9px uppercase, letter-spacing largo *(ponto aberto de contraste — ver 16)*
- **Padrões v1/v2 mantidos:** cartões brancos borda #e0dcd6 + sombra suave · borda 4px como código semântico · pills (ativa = escura) · painéis expansíveis #fcfaf6 · nome de pessoa = teal sublinhado · barra de ocupação · barra de meta · toast desfazer 5s · mini-formulário de transição
- **Novos v3:** item de fila (ícone + nome + motivo + 1 ação + adiar) · badge ⚠️ *em risco* · gráfico de caixa (barras por moeda + linha de custos) · barra de capacidade de professora · timeline de progresso da aluna (celebratória)

### 15. Ordem de implementação

1. **Migração Pessoa única** (1.3) — bloqueante; antes de conectar dados reais.
2. **Perfil da Pessoa** (5) + transição lead→aluna (6) — destrava tudo.
3. **Motor de filas** com R1–R5 (comercial/cobrança) + **perfis de acesso** (1.2) — o sistema vira "da escola", não "da Gabi".
4. **Ocupação + capacidade de professora** (10) e **aba Renovações** (8) — as engrenagens dos 60.
5. **Caixa** (9) — entradas já existem no modelo; falta importar custos do Financeiro.
6. **Sinais de risco R6–R8 + onboarding R10** — dependem da presença (app) conectada.
7. **Área da Aluna v3** (12) + NPS.
8. Acabamento: mobile (Carla/Érika são mobile-first), action items de ata (R11), modal de exclusão, acessibilidade.

### 16. Pontos abertos para o designer

1. **Mobile:** linhas de CRM/Cobrança (grid 4 col.) empilham; Perfil vira abas ("Relação"/"Números"); fila com alvo de toque ≥ 44px.
2. **Fila "Para hoje":** teto visual (15 + "ver todos") e microinteração de item resolvido — precisa parecer terminável.
3. **Caixa:** legibilidade da dupla moeda no mesmo gráfico (duas barras lado a lado vs. dois gráficos empilhados?).
4. **Badge de risco:** como mostrar o motivo sem estigmatizar (hover no desktop, bottom-sheet no mobile?).
5. **Área da Aluna:** direção visual celebratória (progresso) vs. sobriedade da gestão — mesmo DS, dois tons.
6. **Contraste:** labels 8px uppercase abaixo de AA — subir pra 10px ou escurecer?
7. **Turmas:** hierarquia Syllabus / Teacher's Guide / Notebook / Calendar no card quando os links reais chegarem.
8. **Renovações:** 45 dias de antecedência — validar com a Carla no ciclo atual.
9. **Perfis de acesso:** a navegação encolhe por perfil — validar que a Central da Carla e da Érika não parecem "sistema capado", e sim completo pra função.
