# Área do aluno — mapa e ordem de construção

**Decisão de base (out/2026):** cada parte da área do aluno é uma **página HTML independente** no Netlify. A mesma página abre por link no systeme (botão "Abrir minha área"), dentro do app da aluna e como aplicativo instalado (PWA já existe: `manifest.json` + `sw.js`). Nada de iframe no systeme: no iPhone, o Safari bloqueia o armazenamento local dentro de iframe de outro domínio, e a aluna cairia deslogada.

**Visual:** toda página nova segue o design system do kit (fundo `#f2ebe3`, cartões brancos de cantos 20–32px, seções escuras `#164951` com cantos 48px, Inter 800 com letter-spacing −0,035em nos títulos, eyebrows minúsculas em `#8a7465`, botões 999px em coral com degrau sólido, emoji só com função, ícones Lucide). `comunidade.html` é a referência. O app antigo (`ISR - Aluna.dc.html`) ainda está no visual escuro anterior; migrar o Início dele para o kit é uma fatia própria.

Toda página nova segue o mesmo contrato:

```
<script src="./isr-trava.js"></script>   ← exige login (aluna ou equipe)
<script src="./support.js"></script>     ← framework DC
<script src="./crm-data.js"></script>    ← banco local + sync com o Apps Script
```

Dados novos entram em `crm-data.js` como coleção com `id`, `_v` (carimbo) e lápide (`apagada`), e são adicionados em `payloadLocal`, `aplicarRemoto` e `mesclarComRemoto`. O Apps Script grava o blob inteiro; não precisa mudar.

## O que já existia antes desta frente

| Recurso do mapa | Onde está |
|---|---|
| Acesso direto à aula (link da sala, material) | `ISR - Aluna.dc.html`, aba Início |
| ISR Miles (saldo, extrato, catálogo, resgate) | `ISR - Aluna.dc.html`, aba Conta → ISR Miles; regras em `MOEDAS_REGRAS` |
| Streak (sequência) | só no modo desafio (assinatura/programa) |
| Gravações das aulas | `gravacoesParaAluna`, aba Aulas |
| Presença (confirmação pós-aula) | aba Início + chamada da professora |
| Pagamentos (parcelas, link) | aba Conta → Seu plano |
| Perfil (nome, foto, bio) | aba Conta → Seu perfil |
| Desafio da semana | `desafio.html` + `isr-desafio.js` |
| Flin (IA) | aba Início, resgatado com miles |

## Fatia 1 — Comunidade (feita)

`comunidade.html` — o "motor Orkut":

- **Mural da escola:** recados da equipe para todas as alunas. A equipe escreve em `ISR - Mural.dc.html` (bloco "Recado para as alunas"). O recado mais novo aparece também no Início do app.
- **Perfil aberto** (`comunidade.html?perfil=ID`): foto, bio, turma.
- **Scraps:** recado curto no perfil; quem escreveu, a dona ou a equipe podem remover.
- **Depoimentos:** texto longo; fica *pendente* até a dona aceitar. Aceito vale **+10 miles para as duas**. Um por autora por perfil até ela responder.
- **Atributos:** Vocabulary Master · Fearless Speaker · Great Listener. Voto de 1 a 3 estrelas, anônimo na tela (só a média e o total de votos).
- **Colegas:** a turma primeiro; toda a escola por turma ao abrir.
- **No app:** botão **Turma** na barra (com contador do que espera a aluna) e cartão **Comunidade** no Início.
- **Equipe:** quem abre o app de uma aluna pelo sistema (`?id=`) vê a comunidade como ela, e assina scraps e depoimentos como **Equipe**.

Funções novas em `crm-data.js`: `membrosComunidade`, `perfilPublico`, `autorComunidade`, `scrapPost/scrapsDe/scrapRemover`, `depoimentoEscrever/depoimentosPendentes/depoimentoResponder`, `votar/votosDe/atributosDe`, `feedEscolaPost/feedEscolaLista/feedEscolaRemover`, `novidadesComunidade`.

### Botão no systeme

Na página de membro, um botão/link apontando para:

```
https://inglessemroteiro.netlify.app/comunidade.html
```

Quem não estiver logada cai no login (`aluna.html`) e volta para a comunidade depois.

## Fatia 2 — Clubs Hub (feita)

`clubes.html` — clubes por interesse, com fórum próprio:

- **Lista** (`clubes.html`): os clubes do ciclo corrente (o rótulo vem de `metasAtuais().cicloLabel`), quantas alunas em cada um e o botão **Entrar no clube**. Em cima, "Seus clubes" com as novidades dos fóruns desde a última visita.
- **Trava:** até **2 clubes por ciclo** (`CLUBES_POR_CICLO`). A terceira inscrição volta recusada com mensagem clara. A inscrição guarda o ciclo do clube; é nele que a trava conta.
- **Trocar de clube no meio do ciclo:** só com o resgate **"Trocar de clube no meio do ciclo"** (`rgClube`, 60 miles, um por ciclo) no catálogo de miles. O resgate deixa um crédito em `pessoa.trocasClube`; o botão "sair deste clube" consome esse crédito. Sem crédito, a saída é recusada e a tela aponta para o catálogo.
- **Página do clube** (`clubes.html?clube=ID`): descrição, quem está nele (avatares, abrem o perfil na comunidade) e o fórum: lista de tópicos, composer de tópico (título, texto, link opcional). O fórum só aparece para quem está no clube e para a equipe.
- **Tópico aberto** (`clubes.html?clube=ID&topico=TID`): o tópico, as respostas e o composer de resposta (texto, link opcional). Quem escreveu, ou a equipe, pode remover.
- **Áudio e imagem** ficam para quando houver onde guardar arquivo (ver "Pontos que precisam de decisão").
- **Gestão:** cadastro e edição dos clubes no bloco **Clubes do ciclo** em `ISR - Turmas e Projetos.dc.html` (emoji, nome, descrição, ciclo; "abrir fórum" abre o clube como equipe). Sem item novo de menu.
- **No app:** cartão **Seus clubes** no Início (os clubes da aluna e as novidades, ou o convite para escolher).
- **Equipe:** quem abre pelo sistema vê todos os fóruns e escreve como **Equipe**; não entra em clube.
- **Modo exemplo:** três clubes de demonstração entram sozinhos (`semearClubesDemo`).

Coleções novas em `crm-data.js` (todas com `id`, `_v` e lápide, no `payloadLocal`/`aplicarRemoto`/`mesclarComRemoto`): `clubes`, `clubeInscricoes`, `clubeTopicos`, `clubePosts`. Funções: `clubesLista/clubesTodos/clubeDe/clubeSalvar/clubeRemover`, `clubesDaAluna/estaNoClube/membrosDoClube`, `clubeEntrar/clubeSair/trocasClubeDe`, `topicosDoClube/topicoDe/topicoAbrir/topicoRemover`, `postsDoTopico/postResponder/postRemover`, `novidadesClubes`, `cicloDosClubes`.

### Botão no systeme

```
https://inglessemroteiro.netlify.app/clubes.html
```

## Próximas fatias, na ordem sugerida

3. **Review Vault** — `revisao.html`. Decks de flashcards por sessão (vocabulário vem do projeto da turma); botão "Add today's vocabulary" no notebook; miles por deck feito no dia.
4. **My Notebook** — `caderno.html`. Uma página por sessão: alvo da sessão, degraus (vocabulário/estruturas), campos de resposta com auto-save, upload de foto. Para presencial, versão limpa para celular/impressão. Depende do conteúdo do projeto estar em dados (hoje `Units of study` é planilha + links).
5. **Teacher's Dashboard (ao vivo)** — respostas da turma em uma tela; scrap em lote para a turma; crédito de miles em lote. Entra no `ISR - Painel do Professor.dc.html`.
6. **My Account completo** — calendário de presença (verde/amarelo/vermelho + % para certificado), financeiro (histórico, notas, contrato), preferências de notificação (push já existe em `netlify/functions/send-push.js`).
7. **Extras** — audio scraps (gravação de até 1 min no navegador; precisa de armazenamento de arquivo, hoje não há), Buddy Match (sugestão por nível/modalidade), streak diário para alunas de turma.

### Pontos que precisam de decisão antes das fatias 3 e 4

- **Onde vive o conteúdo pedagógico** (vocabulário por sessão, degraus): precisa sair da planilha/slides e virar dado no sistema para alimentar flashcards e caderno.
- **Arquivos** (fotos do caderno, áudios): o banco atual é um blob JSON no Apps Script; arquivo precisa de outro lugar (Drive via Apps Script, ou Netlify Blobs).
- **Volume de dados no aparelho da aluna:** hoje o app puxa o banco inteiro da escola. Com fóruns e cadernos, vale separar o que a aluna recebe do que a gestão recebe.
