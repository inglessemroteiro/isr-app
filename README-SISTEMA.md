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
