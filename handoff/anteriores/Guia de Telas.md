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
