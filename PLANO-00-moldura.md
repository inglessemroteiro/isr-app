# Plano · Painel do professor › Moldura (00)

Plano antes de editar, como o `00 LEIA PRIMEIRO` pede. Nada foi
alterado ainda.

---

## 1. O que existe hoje, e o que vira o quê

| Bloco de hoje | Vira |
|---|---|
| Cabeçalho: eyebrow "painel do professor · o seu dia" + h1 fixo "Painel do professor" | eyebrow igual + **h1 com o nome da professora**; quando a coordenação está em "vendo como", o h1 diz "· visualizando como <nome>" |
| Abas Hoje · Minhas turmas · Particulares · Clubes (pills, `padding 10px 18px`, 13.5px) | as mesmas quatro, no padrão do handoff: `padding 9px 16px`, 14px/700, `gap 6px`, inativa com fundo branco, rolagem horizontal no celular |
| Turma aberta dentro do Painel, com "← Minhas turmas" e quatro abas (Visão geral · Alunas · Chamadas · Materiais) | **a decisão da seção 4** |
| Menu lateral: a professora vê Agenda, Painel, Acompanhamento, Turmas & Projetos, Gravações e Clubes | **só o Painel do professor** |
| Guarda de telas (`telaDeGestao`): qualquer pessoa com sessão entra em qualquer tela de gestão | a professora que abrir uma tela fora da lista dela cai no Painel |
| Estado das abas: só em memória | **na URL**: `?tab=hoje\|turmas\|particulares\|clubes`, `&turma=<id>`, `&sub=<aba>` |

## 2. Dados reais desta subpágina

| Dado que o handoff pede | De onde vem | Estado |
|---|---|---|
| Professora logada (nome, papel) | `gestaoVisao()` para filtrar, `gestaoUser()` para gravar | já existe |
| Turmas atribuídas | `ocupacaoTurmas()` filtrado por `professoraDaVisao()` | já existe |
| Particulares | `particularesDaProfessora()` | já existe |
| Clubes | `clubesLista()` filtrado pela professora | já existe |
| Permissões por papel (quais abas da Página da turma aparecem) | `perfilDosPapeis` + `papeis` da ficha de Equipe | a regra existe; **a tabela de abas por papel não** |

## 3. O que falta (e não invento)

1. **Aba Projeto na Página da turma.** O handoff a lista para a
   professora, a Érika e a Gabi. Ela depende da entrega do projeto por
   aluna, que o app não registra (é a tela 09). **Proposta:** a Moldura
   não cria a aba; ela entra junto com a 09.
2. **Aba Financeiro.** Só a Gabi a vê, e ela não existe em lugar
   nenhum. **Proposta:** fica fora desta tela.
3. **Modo "em aula"** (a barra com "← Hoje", "em aula · turma",
   "Respostas ao vivo" e "Slides"). É a moldura das telas 02 e 03, que
   ainda não existem. Construir a barra agora dá três cliques que não
   levam a lugar nenhum — e, pior, "Começar aula" hoje **faz** uma
   coisa de verdade: abre o caderno da turma no Drive, que é o que as
   professoras usam. **Proposta:** a barra entra junto com a 03, e até
   lá "Começar aula" continua como está.

## 4. A decisão que preciso de você

O handoff desenha a Página da turma **dentro** do Painel. O app tem as
duas coisas: um resumo da turma dentro do Painel (Visão geral, Alunas,
Chamadas, Materiais) **e** a página completa `ISR - Turma v3`, que é a
da coordenação — é a do seu print, com Plano das aulas, Projeto,
Materiais, Renovação e vagas e Financeiro.

Isso importa agora por um motivo prático: **o plano das aulas só existe
na página completa.** Se eu tirar "Turmas & Projetos" do menu da
professora sem resolver isto, ela perde o acesso ao plano que acabamos
de transcrever.

**Opção A — uma página da turma só** (a que recomendo)
A página completa passa a mostrar abas diferentes por papel: a
professora vê Visão geral, Alunas, Plano das aulas, Chamadas e
Materiais, e não vê Renovação e vagas. O Painel lista as turmas e abre
essa página. O resumo de dentro do Painel sai.
*A favor:* uma implementação só; o plano continua onde está e passa a
ser alcançável pela professora; menos chance de as duas versões
divergirem com o tempo.
*Contra:* a URL fica `ISR - Turma v3.dc.html?id=…&sub=plano` em vez de
`?tab=turmas&turma=…&sub=plano`. O "voltar e recarregar mantêm o
lugar" continua valendo; o endereço é que é outro.

**Opção B — a página da turma dentro do Painel**, como o handoff
desenha. Obriga a trazer Plano das aulas, Projeto e Materiais para
dentro do Painel e a manter duas implementações de cada um, ou a apagar
a da coordenação.
*A favor:* fica igual ao desenho.
*Contra:* é o dobro de código nas telas que mais mudam, e é onde as
duas vão divergir primeiro.

## 5. O que eu faço na Opção A

1. **Menu:** a professora passa a ver só "Painel do professor". Sai
   Agenda, Acompanhamento, Turmas & Projetos, Gravações e Clubes.
   *Nota:* isso contraria o que você pediu antes ("somente a agenda e
   painel pedagógico"). A função da Agenda volta como o cartão "Agenda
   de hoje" da tela 01. Se quiser a Agenda de volta no menu, é uma
   linha.
2. **Guarda:** professora que abrir uma tela fora da lista dela
   (Central, Alunas, CRM, Caixa…) é levada ao Painel. A lista dela:
   Painel, Página da turma e perfil da aluna. Isto é recorte de
   trabalho, não proteção — roda no navegador, como o resto.
3. **Abas da Página da turma por papel**, conforme a tabela do
   `02 Lógica`: a professora não vê Renovação e vagas; a Carla vê
   Visão geral, Alunas e Renovação; a Érika vê tudo menos Plano e
   Financeiro.
4. **Cabeçalho do Painel** com o nome da professora e o aviso de
   "visualizando como" quando for o caso.
5. **Abas no padrão do handoff** e rolagem horizontal no celular.
6. **URL:** `?tab=` no Painel e `&sub=` na Página da turma, lidos na
   abertura e escritos com `history.replaceState` a cada troca.

## 6. Um risco que eu quero registrar antes

A tela 06 diz que o nome da aluna, na lista da turma, abre o perfil
dela. O perfil que existe hoje mostra pagamento, histórico comercial e
as notas internas da escola. Abrir isso inteiro para a professora é uma
decisão de privacidade, não de layout. **Nesta tela eu não mexo nisso**
— só registro, para resolvermos na 06.

## 7. Verificação que vou rodar

A do fim do `00 Moldura`:

- [ ] nenhum nome ou número fictício do protótipo na tela;
- [ ] abre sem erro com professora com dados e sem dados;
- [ ] a professora só vê as próprias turmas, alunas e clubes;
- [ ] as quatro abas trocam sem recarregar;
- [ ] recarregar mantém a aba e a subaba;
- [ ] Renovação e Financeiro não aparecem para a professora;
- [ ] os verificadores do app continuam passando.

Mais estes, que o handoff não pede e eu acho que faltam:

- [ ] a professora continua alcançando o plano das aulas da turma dela;
- [ ] a gestora e a Érika não perdem nenhuma tela;
- [ ] uma professora que digite o endereço de uma tela fora da lista
      dela cai no Painel, e não numa tela quebrada.
