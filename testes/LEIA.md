# As suítes de tela

Os `verificar-*.js` da raiz conferem o código: linguagem, jargão, chaves
de armazenamento, cores, redirecionamentos. O que eles não alcançam é a
tela montada — se o nível do clube chega ao cartão da aluna, se o herói
do painel está nas medidas do desenho, se a professora não vê o botão
que é da coordenação. É isso que estas suítes abrem num navegador de
verdade e conferem.

Elas moravam numa pasta temporária fora do repositório e se perderam na
primeira vez que a máquina foi recriada. Agora moram aqui.

## Como rodar

Primeiro sobe o servidor na raiz do projeto:

    node_modules/.bin/http-server -p 8899 -s .

Depois, uma suíte por vez:

    node testes/clube-catalogo.js

O navegador e o React vêm de `testes/preparar.js`, que acha o Chromium
onde ele estiver instalado e serve as cópias locais do React para as
telas `.dc.html` — elas carregam o React de um CDN que o ambiente de
teste não alcança.

Se o React ainda não estiver baixado:

    npm --prefix testes install

## O que cada suíte guarda

- `clube-catalogo.js` — o catálogo "Todos os clubes" da aluna pelo
  arquivo `handoff/aluna/04 Clubs.md`: o nível de cada clube, o emoji,
  as três linhas de informação, e a trava que não deixa publicar clube
  sem nível escolhido.
- `aluna-home.js` — a Home pelo arquivo `handoff/aluna/01 Home.md`: a
  sala que só abre no dia da aula, os quatro itens da semana, e a
  varredura que não deixa voltar nenhum recado de obra às telas da
  aluna.
- `sessao-portao.js` — o portão `aluna.html`: a entrada por link, sem
  senha, como porta da frente; o convite aceito sozinho; o link que
  só abre a tela de senha para quem pediu a troca; e a sessão do
  Netlify Identity guardada, chegando às funções no cabeçalho e saindo
  do aparelho quando a pessoa volta.
- `liberar-a-aula.js` — liberar a aula, onde a aula está. Publicar o
  plano faz a aluna LER; liberar faz o caderno dela abrir para
  ESCREVER, e o botão que fazia isso existia só no herói do painel,
  que só o mostra no dia. Agora ele está na aba do plano, junto do
  Ajustar e do Publicar, e a tela diz a diferença entre as duas
  palavras.
- `pilha-de-quem-chegou.js` — a pilha de chamadas de quem acabou de
  chegar na turma. A aula é de quem está na turma hoje, e quem assume
  herdava tudo o que ficou para trás. A data em que a professora
  passou a ser daquela turma, carimbada na troca e corrigível na tela
  de Turmas — e o herói do painel de volta à próxima aula, como no V5.
- `contatos-colados.js` — o e-mail colado na tela Importar que sumia
  sem avisar: nome e e-mail separados por um espaço só viravam uma
  célula, descartada como linha torta e em silêncio. Agora são lidos
  como duas colunas, e a linha que não dá para ler aparece na
  conferência com o que fazer a respeito.
- `sync-pendente.js` — o que foi gravado e não subiu. Toda gravação
  espera 1,5 s para agrupar edições, e nada forçava o envio quando a
  aba fechava: publicar um clube e sair deixava a alteração só no
  aparelho, em silêncio. A marca de pendente, o envio quando a página
  sai de vista, e o envio quando ela abre carregando a marca.
- `clube-dois-donos.js` — o clube é escrito por duas pessoas: quem o
  conduz mexe no cadastro, as alunas entram e saem. O sync mesclava o
  registro inteiro pelo carimbo mais novo, e uma metade apagava a
  outra. Aqui cada metade tem o seu carimbo, e a suíte guarda as duas
  perdas: a inscrita que sumia quando a professora salvava, e as
  datas que voltavam atrás quando a aluna entrava.
- `senha-da-aluna.js` — a senha definida de dentro do app, com a
  sessão aberta: é a saída para quando o link de entrada não chega.
  No lugar de um link para o portão que, com sessão, devolvia a aluna
  ao app sem fazer nada.
- `ficha-diz-que-falta.js` — quando o sistema pede o que a ficha já
  tem: o CPF, o RG e o endereço que a importação do Slack guardava
  num lugar que ninguém lê, o resgate deles, o editor da ficha
  mostrando o valor em vez de uma sugestão cinza, e o id repetido que
  fazia uma aluna responder pela situação de outra.
- `convite-recusado.js` — o que a escola lê quando o convite não sai:
  a resposta da função do Netlify traduzida para a tela, o caminho de
  entrar de novo quando a sessão venceu, o lote que para na primeira
  recusa, e as duas telas sem "Netlify Identity" nem "criar senha".
- `clube-quem-conduz.js` — quem conduz o clube, na tela Clubes: a
  lista sai dos papéis da Equipe, o nome que já está no clube não some
  da lista por não ter papel, e clube novo não escolhe sozinho.
- `acesso-aluna.js` — quem consegue entrar no app: as três coisas que
  têm de estar de pé (e-mail, convite, turma ou produto), o chip "Sem
  acesso", o botão de convidar em cada linha, o convite em lote e o
  e-mail do convite em português.
- `programas.js` — o repositório de programas da escola: a migração
  do que já existia, criar, duplicar e arquivar, a escolha do
  programa na turma e na aluna particular, e a importação por texto —
  inclusive conferindo que `programas/26-2.txt`, com os programas
  reais da escola, é entendido inteiro.
- `pergunta-caderno.js` — a pergunta que vira tarefa no caderno, na
  tela da turma: a barra de espaço, a conta de quantas perguntas vão
  para o caderno, o rótulo em cima de cada campo e a frase chegando
  inteira ao caderno da aluna.
- `loja-conta.js` — a Loja de milhas e a Conta pelos arquivos
  `handoff/aluna/07 Shop.md` e `08 Account.md`: a vitrine em grade, os
  três estados do botão de resgate, o resgate em duas etapas, as
  páginas numeradas das trocas e os três cartões da Conta.
